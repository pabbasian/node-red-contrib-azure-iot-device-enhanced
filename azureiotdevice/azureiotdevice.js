
// Copyright (c) Eric van Uum. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

/**
 * The "azure-iot-device" node enables you to represent an Azure IoT Device in Node-Red.
 * The node provide connecting a device using connection string and DPS
 * You can use a full connection string, a SAS key and a X.509 attestation
 * 
 * The device node enables D2C, C2D messages, Direct Methods, Desired and Reported properties.
 * You can connect to IoT Edge as a downstream device, IoT Hub and IoT Central.
 */
function register(RED) {
    'use strict'
    // All requires and code that depend on RED are inside this function
    const Client = require('azure-iot-device').Client;
    const Message = require('azure-iot-device').Message;
    const Protocols = {
        amqp: require('azure-iot-device-amqp').Amqp,
        amqpWs: require('azure-iot-device-amqp').AmqpWs,
        mqtt: require('azure-iot-device-mqtt').Mqtt,
        mqttWs: require('azure-iot-device-mqtt').MqttWs
    };
    const ProvisioningProtocols = {
        amqp: require('azure-iot-provisioning-device-amqp').Amqp,
        amqpWs: require('azure-iot-provisioning-device-amqp').AmqpWs,
        mqtt: require('azure-iot-provisioning-device-mqtt').Mqtt,
        mqttWs: require('azure-iot-provisioning-device-mqtt').MqttWs
    };
    const SecurityClient = {
        x509: require('azure-iot-security-x509').X509Security,
        sas: require('azure-iot-security-symmetric-key').SymmetricKeySecurityClient
    };
    const ProvisioningDeviceClient = require('azure-iot-provisioning-device').ProvisioningDeviceClient;
    const GlobalProvisoningEndpoint = "global.azure-devices-provisioning.net";
    const crypto = require('crypto');
    const forge = require('node-forge');
    var pki = forge.pki;
    const { config } = require('process');
    const statusEnum = {
        connected: { fill: "green", shape:"dot", text: "Connected" },
        connecting: { fill: "blue", shape:"dot", text: "Connecting" },
        provisioning: { fill: "blue", shape:"dot", text: "Provisioning" },
        disconnected: { fill: "red", shape:"dot", text: "Disconnected" },
        error: { fill: "grey", shape:"dot", text: "Error" }
    };
    // Setup node-red node to represent Azure IoT Device
    function AzureIoTDevice(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        // Validate required configuration
        if (!config.deviceid || config.deviceid.trim() === '') {
            error(node, config, 'Device ID is required but not provided');
            setStatus(node, statusEnum.error);
            return;
        }
        
        if (config.connectiontype === 'dps' && (!config.scopeid || config.scopeid.trim() === '')) {
            error(node, config, 'Scope ID is required for DPS connection but not provided');
            setStatus(node, statusEnum.error);
            return;
        }
        
        node.deviceid = config.deviceid;
        node.pnpModelid = config.pnpModelid;
        node.connectiontype = config.connectiontype;
        node.authenticationmethod = config.authenticationmethod;
        node.enrollmenttype = config.enrollmenttype;
        node.iothub = config.iothub;
        node.isIotcentral = config.isIotcentral;
        node.scopeid = config.scopeid;
        node.saskey = config.saskey;
        node.protocol = config.protocol;
        node.retryInterval = config.retryInterval;
        node.methods = config.methods;
        node.DPSpayload = config.DPSpayload;
        node.gatewayHostname = config.gatewayHostname;
        node.cert = config.cert;
        node.key = config.key;
        node.passphrase = config.passphrase;
        node.ca = config.ca;
        node.methodResponses = [];
        node.client = null;
        node.twin = null;
        node._healthCheckInterval = null;
        node._connectionState = 'disconnected';
        node._lastConnected = null;
        node._handlersRegistered = false;
        node._closing = false;
        setStatus(node, statusEnum.disconnected);
        initiateDevice(node);
    }

    // Set status of node on node-red
    var setStatus = function (node, status) {
        node.status({ fill: status.fill, shape: status.shape, text: status.text });
        node._connectionState = status.text.toLowerCase();
        if (status.text === 'Connected') {
            node._lastConnected = new Date();
        }
    };

    // Send catchable error to node-red
    var error = function (node, payload, message) {
        var msg = {};
        msg.topic = 'error';
        msg.message = message;
        msg.payload = payload;
        node.error(msg);
    }

    // Check if valid PEM cert
    function verifyCertificatePem(node, pem) {
        try {
            // Get the certificate from pem, if successful it is a cert
            node.log(node.deviceid + ' -> Verifying PEM Certificate');
            var cert = pki.certificateFromPem(pem);
        } catch (err) {
            return false;
        }
        return true;
    };

    // Compute device SAS key
    function computeDerivedSymmetricKey(masterKey, regId) {
        return crypto.createHmac('SHA256', Buffer.from(masterKey, 'base64'))
            .update(regId, 'utf8')
            .digest('base64');
    };
    
    // Close all listeners and clean up
    function closeAll(node) {
        node.log(node.deviceid + ' -> Closing all clients.');
        
        // Set closing flag to prevent reconnection attempts
        node._closing = true;
        
        // Clear health check interval
        if (node._healthCheckInterval) {
            clearInterval(node._healthCheckInterval);
            node._healthCheckInterval = null;
        }
        
        // Clear reconnect timeout
        if (node._reconnectTimeout) {
            clearTimeout(node._reconnectTimeout);
            node._reconnectTimeout = null;
        }
        
        // Clear methodResponses
        if (node.methodResponses) node.methodResponses.length = 0;
        // Remove listeners from twin
        if (node.twin) {
            try {
                node.twin.removeAllListeners && node.twin.removeAllListeners('properties.desired');
                node.twin.removeAllListeners && node.twin.removeAllListeners('error');
            } catch (err) {}
            node.twin = null;
        }
        // Remove listeners from client
        if (node.client) {
            try {
                node.client.removeAllListeners && node.client.removeAllListeners('error');
                node.client.removeAllListeners && node.client.removeAllListeners('disconnect');
                node.client.removeAllListeners && node.client.removeAllListeners('message');
                if (node.methods) {
                    for (let method in node.methods) {
                        try {
                            node.client.removeAllListeners(node.methods[method].name);
                        } catch (err) {}
                    }
                }
                // Close client with timeout fallback
                let closed = false;
                const closeTimeout = setTimeout(() => {
                    if (!closed) {
                        node.log(node.deviceid + ' -> Client close timeout, forcing cleanup');
                        node.client = null;
                    }
                }, 3000);
                node.client.close((err, result) => {
                    closed = true;
                    clearTimeout(closeTimeout);
                    if (err) {
                        node.log(node.deviceid + ' -> Azure IoT Device Client close failed: ' + JSON.stringify(err));
                    } else {
                        node.log(node.deviceid + ' -> Azure IoT Device Client closed.');
                    }
                    node.client = null;
                });
            } catch (err) {
                node.client = null;
            }
        }
    }

    // Initiate provisioning and retry if network not available.
    function initiateDevice(node) {
        // Only register event handlers once during node creation, not on every reconnect
        if (!node._handlersRegistered) {
            // Ensure resources are reset
            node.on('close', function(done) {
                closeAll(node);
                done();
            });

            // Listen to node input to send telemetry or reported properties
            node.on('input', function (msg) {
            if (typeof (msg.payload) === "string") {
                //Converting string to JSON Object
                try {
                    msg.payload = JSON.parse(msg.payload);
                } catch (parseErr) {
                    error(node, parseErr, node.deviceid + ' -> Invalid JSON payload: ' + parseErr.message);
                    return;
                }
            }
            if (msg.topic === 'telemetry') {
                sendDeviceTelemetry(node, msg, msg.properties);
            } else if (msg.topic === 'property' && node.twin) {
                sendDeviceProperties(node, msg);
            } else if (msg.topic === 'response') { 
                node.log(node.deviceid + ' -> Method response received with id: ' + msg.payload.requestId);
                sendMethodResponse(node, msg)
            } else {
                error(node, msg, node.deviceid + ' -> Incorrect input. Must be of type \"telemetry\" or \"property\" or \"response\".');
            }
        });
            
            node._handlersRegistered = true;
        }

        // Provision device
        node.retries = 0;
        provisionDevice(node).then( result => {
            if (result) {
                // Connect device to Azure IoT
                node.retries = 0;
                connectDevice(node, result).then( result => {
                    // Get the twin, throw error if it fails
                    if (result === null) {
                        retrieveTwin(node).then( result => {
                            node.log(node.deviceid + ' -> Device twin retrieved.');
                        }).catch( function (err) {
                            error(node, err, node.deviceid + ' -> Retrieving device twin failed');
                            throw new Error(err);
                        });
                    } else {
                        throw new Error(result);
                    }
                }).catch( function(err) {
                    error(node, err, node.deviceid + ' -> Device connection failed');
                });
            } else {
                throw new Error(result);
            }
        }).catch( function(err) {
            error(node, err, node.deviceid + ' -> Device provisioning failed.');
        });
    }

    // Provision the client 
    function provisionDevice(node) {
        // Set status
        setStatus(node, statusEnum.provisioning);
        
        // Return a promise to enable retry
        return new Promise((resolve,reject) => {
            try {
                // Log the start
                node.log(node.deviceid + ' -> Initiate IoT Device settings.');

                // Set the security properties
                var options = {};
                if (node.authenticationmethod === "x509") {
                    node.log(node.deviceid + ' -> Validating device certificates.');
                    // Set cert options
                    // verify PEM work around for SDK issue
                    if (verifyCertificatePem(node, node.cert))
                    {
                        options = {
                            cert : node.cert,
                            key : node.key,
                            passphrase : node.passphrase
                        };
                    } else {
                        reject("Invalid certificates.");
                    }
                };

                // Check if connection type is dps, if not skip the provisioning step
                if (node.connectiontype === "dps") {

                    // Set provisioning protocol to selected (default to AMQP-WS)
                    var provisioningProtocol = (node.protocol === "amqp") ? ProvisioningProtocols.amqp : 
                        (node.protocol === "amqpWs") ? ProvisioningProtocols.amqpWs :
                        (node.protocol === "mqtt") ? ProvisioningProtocols.mqtt :
                        (node.protocol === "mqttWs") ? ProvisioningProtocols.mqttWs :
                        ProvisioningProtocols.amqpWs;

                    // Set security client based on SAS or X.509
                    var saskey = (node.enrollmenttype === "group") ? computeDerivedSymmetricKey(node.saskey, node.deviceid) : node.saskey;
                    var provisioningSecurityClient = 
                        (node.authenticationmethod === "sas") ? new SecurityClient.sas(node.deviceid, saskey) :
                            new SecurityClient.x509(node.deviceid, options);

                    // Create provisioning client
                    var provisioningClient = ProvisioningDeviceClient.create(GlobalProvisoningEndpoint, node.scopeid, new provisioningProtocol(), provisioningSecurityClient);

                    // set the provisioning payload (for custom allocation)
                    var payload = {};
                    if (node.DPSpayload) {
                        // Turn payload into JSON
                        try {
                            payload = JSON.parse(node.DPSpayload);
                            node.log(node.deviceid + ' -> DPS Payload added.');
                        } catch (err) {
                            // do nothing 
                        }
                    }
                    
                    // Register the device.
                    node.log(node.deviceid + ' -> Provision IoT Device using DPS.');
                    if (node.connectiontype === "constr") {
                        resolve(options);
                    } else {
                        provisioningClient.setProvisioningPayload(JSON.stringify(payload));
                        provisioningClient.register().then( result => {
                            // Process provisioning details
                            node.log(node.deviceid + ' -> DPS registration succeeded.');
                            node.log(node.deviceid + ' -> Assigned hub: ' + result.assignedHub);
                            var msg = {};
                            msg.topic = 'provisioning';
                            msg.deviceId = result.deviceId;
                            msg.payload = JSON.parse(JSON.stringify(result));
                            node.send(msg);
                            node.iothub = result.assignedHub;
                            node.deviceid = result.deviceId;
                            setStatus(node, statusEnum.disconnected);
                            resolve(options);
                        }).catch( function(err) {
                            // Handle error
                            error(node, err, node.deviceid + ' -> DPS registration failed.');
                            setStatus(node, statusEnum.error);
                            reject(err);
                        });
                    }
                } else {
                    resolve(options);
                }
            } catch (err) {
                reject("Failed to provision device: " + err);
            }
        });
    }

    // Initiate an IoT device node in node-red
    function connectDevice(node, options){
        setStatus(node, statusEnum.connecting);
        var deviceProtocol = (node.protocol === "amqp") ? Protocols.amqp : 
        (node.protocol === "amqpWs") ? Protocols.amqpWs :
        (node.protocol === "mqtt") ? Protocols.mqtt :
        (node.protocol === "mqttWs") ? Protocols.mqttWs :
        Protocols.amqpWs;
        var connectionString = 'HostName=' + node.iothub + ';DeviceId=' + node.deviceid;
        var saskey = (node.connectiontype === "dps" && node.enrollmenttype === "group" && node.authenticationmethod === 'sas') ? computeDerivedSymmetricKey(node.saskey, node.deviceid) : node.saskey;
        connectionString = connectionString + ((node.authenticationmethod === 'sas') ? (';SharedAccessKey=' + saskey) : ';x509=true');
        if (node.gatewayHostname !== "") {
            node.log(node.deviceid + ' -> Connect through gateway: ' + node.gatewayHostname);
            try {
                options.ca = node.ca;
                connectionString = connectionString + ';GatewayHostName=' + node.gatewayHostname;
            } catch (err){
                error(node, err, node.deviceid + ' -> Certificate file error.');
                setStatus(node, statusEnum.error);
            };
        }
        node.client = Client.fromConnectionString(connectionString, deviceProtocol);
        if (node.pnpModelid) {
            options.modelId = node.pnpModelid;
            node.log(node.deviceid + ' -> Set PnP Model ID: ' + node.pnpModelid);
        }
        return new Promise((resolve,reject) => {
            node.client.setOptions(options).then( result => {
                node.client.open().then( result => {                    
                    node.client.on('error', function (err) {
                        error(node, err, node.deviceid + ' -> Device Client error.');
                        setStatus(node, statusEnum.error);
                    });
                    // Robust disconnect handler with exponential backoff and no event leak
                    node.client.on('disconnect', function (err) {
                        error(node, err, node.deviceid + ' -> Device Client disconnected.');
                        setStatus(node, statusEnum.disconnected);
                        
                        // Prevent reconnection attempts if node is closing
                        if (node._closing) {
                            return;
                        }
                        
                        // Clean up current connection but preserve node-level handlers
                        if (node.client) {
                            try {
                                node.client.removeAllListeners();
                            } catch (err) {}
                            node.client = null;
                        }
                        if (node.twin) {
                            try {
                                node.twin.removeAllListeners();
                            } catch (err) {}
                            node.twin = null;
                        }
                        
                        // Add exponential backoff for reconnection (infinite retries)
                        node._retries = (node._retries || 0) + 1;
                        const retryDelay = Math.min(1000 * Math.pow(2, node._retries), 30000);
                        node.log(node.deviceid + ' -> Reconnecting in ' + retryDelay + 'ms (attempt ' + node._retries + ')');
                        if (node._reconnectTimeout) clearTimeout(node._reconnectTimeout);
                        node._reconnectTimeout = setTimeout(() => {
                            if (!node._closing) {
                                initiateDevice(node);
                            }
                        }, retryDelay);
                    });
                    for (let method in node.methods) {
                        node.log(node.deviceid + ' -> Adding synchronous command: ' + node.methods[method].name);
                        var mthd = node.methods[method].name;
                        node.client.onDeviceMethod(mthd, function(request, response) {
                            node.log(node.deviceid + ' -> Command received: ' + request.methodName);
                            node.log(node.deviceid + ' -> Command payload: ' + JSON.stringify(request.payload));
                            node.send({payload: request, topic: "command", deviceId: node.deviceid});
                            getResponse(node, request.requestId).then( message => {
                                var rspns = message.payload;
                                node.log(node.deviceid + ' -> Method response status: ' + rspns.status);
                                node.log(node.deviceid + ' -> Method response payload: ' + JSON.stringify(rspns.payload));
                                response.send(rspns.status, rspns.payload, function(err) {
                                    if (err) {
                                    node.log(node.deviceid + ' -> Failed sending method response: ' + err);
                                    } else {
                                    node.log(node.deviceid + ' -> Successfully sent method response: ' + request.methodName);
                                    }
                                });
                            })
                            .catch( function(err){
                                error(node, err, node.deviceid + ' -> Failed sending method response: \"' + request.methodName + '\".');
                            });
                        });
                    }
                    node.log(node.deviceid + ' -> Listening to C2D messages');
                    node.client.on('message', function (msg) {
                        node.log(node.deviceid + ' -> C2D message received, data: ' + msg.data);
                        var message = {
                            messageId: msg.messageId,
                            data: msg.data.toString('utf8'),
                            properties: msg.properties
                        };
                        node.send({payload: message, topic: "message", deviceId: node.deviceid});
                        node.client.complete(msg, function (err) {
                            if (err) {
                                error(node, err, node.deviceid + ' -> C2D Message complete error.');
                            } else {
                                node.log(node.deviceid + ' -> C2D Message completed.');
                            }
                        });
                    });
                    node.log(node.deviceid + ' -> Device client connected.');
                    // Reset retry counter on successful connection
                    node._retries = 0;
                    setStatus(node, statusEnum.connected);
                    resolve(null);
                }).catch( function(err) {
                    error(node, err, node.deviceid + ' -> Device client open failed.');
                    setStatus(node, statusEnum.error);
                    reject(err);
                });
            }).catch( function(err) {
                error(node, err, node.deviceid + ' -> Device options setting failed.');
                setStatus(node, statusEnum.error);
                reject(err);
            });
        });
    }

    // Get the device twin 
    function retrieveTwin(node){
        // Set the options first and then open the connection
        node.log(node.deviceid + ' -> Retrieve device twin.');
        return new Promise((resolve,reject) => {
            node.client.getTwin().then( result => {
                node.log(node.deviceid + ' -> Device twin created.');
                node.twin = result;
                node.log(node.deviceid + ' -> Twin contents: ' + JSON.stringify(node.twin.properties));
                // Send the twin properties to Node Red
                var msg = {};
                msg.topic = 'property';
                msg.deviceId = node.deviceid;
                msg.payload = JSON.parse(JSON.stringify(node.twin.properties));
                node.send(msg);
                
                // Get the desired properties
                node.twin.on('properties.desired', function(payload) {
                    node.log(node.deviceid + ' -> Desired properties received: ' + JSON.stringify(payload));
                    var msg = {};
                    msg.topic = 'property';
                    msg.deviceId = node.deviceid;
                    msg.payload = payload;
                    node.send(msg);
                });
            }).catch(err => {
                error(node, err, node.deviceid + ' -> Device twin retrieve failed.');
                reject(err);
            });
        })
    };

    // Send messages to IoT platform (Transparant Edge, IoT Hub, IoT Central)
    function sendDeviceTelemetry(node, message, properties) {
        if (validateMessage(message.payload)){
            // Create message and set encoding and type
            var msg = new Message(JSON.stringify(message.payload));
            // Check if properties set and add if so
            if (properties){
                for (let property in properties) {
                    msg.properties.add(properties[property].key, properties[property].value);
                }
            }
            msg.contentEncoding = 'utf-8';
            msg.contentType = 'application/json';
            // Send the message
            if (node.client) {
                node.client.sendEvent(msg, function(err, res) {
                    if(err) {
                        error(node, err, node.deviceid + ' -> An error ocurred when sending telemetry.');
                        setStatus(node, statusEnum.error);
                    } else {
                        node.log(node.deviceid + ' -> Telemetry sent: ' + JSON.stringify(message.payload));
                        setStatus(node, statusEnum.connected);
                    }
                });      
            } else {
                error(node, message, node.deviceid + ' -> Unable to send telemetry, device not connected.');
                setStatus(node, statusEnum.error);
            }            
        } else {
            error(node, message, node.deviceid + ' -> Invalid telemetry format.');
        }
    };

    
    // Send device reported properties.
    function sendDeviceProperties(node, message) {
        if (node.twin) {
            node.twin.properties.reported.update(message.payload, function (err) {
                if (err) {
                    error(node, err, node.deviceid + ' -> Sending device properties failed.');
                    setStatus(node, statusEnum.error);
                } else {
                    node.log(node.deviceid + ' -> Device properties sent: ' + JSON.stringify(message.payload));
                    setStatus(node, statusEnum.connected);
                }
            });
        }
        else {
            error(node, message, node.deviceid + ' -> Unable to send device properties, device not connected.');
        }
    };

    // Send device direct method response.
    function sendMethodResponse(node, message) {
        // Push the reponse to the array
        var methodResponse = message.payload;
        node.log(node.deviceid + ' -> Creating response for command: ' + methodResponse.methodName);
        node.methodResponses.push(
            {requestId: methodResponse.requestId, response: message}
        );
    };


    // @returns true if message object is valid for IoT telemetry
    function validateMessage(message) {
        // Allow any valid JSON serializable payload
        if (message === null || message === undefined) {
            return false;
        }
        
        // Allow primitive types
        if (typeof message !== 'object') {
            return true;
        }
        
        // Allow arrays and objects - IoT telemetry often contains arrays
        if (Array.isArray(message)) {
            return true; // Arrays are valid telemetry
        }
        
        // For objects, do basic validation but be permissive
        try {
            JSON.stringify(message); // Test if serializable
            return true;
        } catch (e) {
            return false; // Not JSON serializable
        }
    }

    // Registration of the node into Node-RED
    RED.nodes.registerType("azureiotdevice", AzureIoTDevice, {
        defaults: {
            deviceid: {value: ""},
            pnpModelid: {value: ""},
            connectiontype: {value: ""},
            authenticationmethod: {value: ""},
            enrollmenttype: {value: ""},
            iothub: {value: ""},
            isIotcentral: {value: false},
            scopeid: {value: ""},
            saskey: {value: ""},
            certname: {value: ""},
            keyname: {value: ""},
            passphrase: {value:""},
            protocol: {value: ""},
            retryInterval: {value: 10},
            methods: {value: []},
            DPSpayload: {value: ""},
            isDownstream: {value: false},
            gatewayHostname: {value: ""},
            caname: {value:""},
            cert: {type:"text"},
            key: {type:"text"},
            ca: {type:"text"}
        }
    });

}

// Get method response using promise, and retry, and slow backoff
function getResponse(node, requestId) {
    const maxRetries = 20;
    const baseTimeout = 1000;
    let currentRetry = 0;
    let isResolved = false;
    let timeoutId = null;
    
    return new Promise((resolve, reject) => {
        // Enhanced cleanup function to prevent memory leaks
        const cleanup = () => {
            isResolved = true;
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
        };
        
        const checkResponse = () => {
            // Exit early if already resolved (prevents timeout accumulation)
            if (isResolved) return;
            
            const methodResponse = node.methodResponses.find(m => m.requestId === requestId);
            if (methodResponse) {
                const index = node.methodResponses.findIndex(m => m.requestId === requestId);
                if (index !== -1) node.methodResponses.splice(index, 1);
                cleanup();
                resolve(methodResponse.response);
                return;
            }
            
            currentRetry++;
            if (currentRetry >= maxRetries) {
                cleanup();
                reject(new Error(node.deviceid + ' -> Method Response timeout after ' + maxRetries + ' retries'));
                return;
            }
            
            // Exit early if already resolved (prevents timeout scheduling)
            if (isResolved) return;
            
            const delay = baseTimeout * Math.min(currentRetry, 10);
            timeoutId = setTimeout(checkResponse, delay);
        };
        
        // Start the first check immediately
        checkResponse();
    });
}

// Export the register function directly for Node-RED compatibility
module.exports = register;

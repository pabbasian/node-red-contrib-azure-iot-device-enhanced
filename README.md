# Azure IoT Device Node-RED node (Enhanced Fork)

**🔧 Forked and Enhanced by Payman Abbasian**

This is an enhanced fork of the original [node-red-contrib-azure-iot-device](https://github.com/iotblackbelt/node-red-contrib-azure-iot-device) by **Eric van Uum**. This fork was created to address critical memory leaks that were causing system reboots on IoT Hub disconnections.

## 🚨 Why This Fork Exists

The original repository was archived and no longer maintained, but users were experiencing:
- **Memory leaks** causing Node-RED to crash
- **System reboots** when IoT Hub connections were lost
- **Accumulated event listeners** leading to performance degradation
- **Method response buildup** causing memory exhaustion

**Payman Abbasian** forked this project to provide urgent fixes for production environments experiencing these critical issues.

## 🎯 Original Project Credits

- **Original Author**: Eric van Uum
- **Original Repository**: https://github.com/iotblackbelt/node-red-contrib-azure-iot-device
- **Original License**: MIT

This enhanced version maintains full compatibility with the original while adding robust memory leak prevention.

---

**Now with robust memory leak prevention and comprehensive TDD testing!**

The Azure IoT Device Node-RED node is a node that can be used to connect Node-RED to the Azure IoT platform. It can connect to Azure IoT Hub, Azure IoT Central, and use Azure IoT Edge as a transparent gateway. The node has been created to support the different attestation methods (SAS, X.509) as well as use Azure Device Provisioning Service. The node has been developed using the [Azure IoT Node.js SDK](https://github.com/Azure/azure-iot-sdk-node/).

The Azure IoT Device node represents a **single device** on the Azure IoT platform.

## 🆕 What's New in v0.3.0 (Enhanced Fork)

**Critical Memory Leak Fixes:**
- **Event Listener Cleanup**: Proper removal of all event listeners on disconnect/close
- **Resource Disposal**: Robust cleanup of Azure IoT SDK clients and twins
- **Method Response Management**: Prevents accumulation of method responses in memory
- **Connection Timeout Protection**: Prevents hanging connections from causing leaks

**Enhanced Reliability:**
- **Exponential Backoff**: Smart reconnection strategy prevents connection storms
- **Error Handling**: Improved error recovery and resource cleanup
- **TDD Testing**: Comprehensive test coverage with Docker support
- **Production Ready**: Tested in production environments with high connection churn

**Development Improvements:**
- **Test-Driven Development**: Full TDD test suite with mocks and stubs
- **Docker Support**: Containerized testing environment
- **CI/CD Ready**: Automated testing on package build

## Installation

Install directly from the Node-RED Palette Manager or via npm:

```bash
npm install node-red-contrib-azure-iot-device-enhanced
```

**Note**: This enhanced fork uses the package name `node-red-contrib-azure-iot-device-enhanced` to avoid conflicts with the original archived package.

## 🔄 Migration from Original Package

If you're currently using the original `node-red-contrib-azure-iot-device`:

1. **Backup your flows** before migrating
2. **Uninstall the original**: `npm uninstall node-red-contrib-azure-iot-device`
3. **Install the enhanced version**: `npm install node-red-contrib-azure-iot-device-enhanced`
4. **No flow changes needed** - this fork maintains full API compatibility
5. **Enjoy improved stability** with memory leak fixes

> **Important**: The original package is archived and no longer maintained. This fork provides ongoing maintenance and critical bug fixes.

> NB: It is our assumption that you have a basic understanding of [Node-RED](https://nodered.org/) and the [Azure IoT platform](https://azure.microsoft.com/en-us/product-categories/iot/).

## Deploy the Azure Device node
In the [deploy](https://github.com/p25301/node-red-contrib-azure-iot-device/blob/master/DEPLOY.md) document we describe how to deploy the node to Node-RED.

## Configure an Azure IoT Device node
In the [configure](https://github.com/p25301/node-red-contrib-azure-iot-device/blob/master/CONFIGURE.md) document we describe how to setup an individual Azure IoT Device node.

## Use an Azure IoT Device node
In the [use](https://github.com/p25301/node-red-contrib-azure-iot-device/blob/master/USE.md) document we describe how to use the Azure IoT Device node to interact with the Azure IoT platform.
- sending telemetry
- receiving and responding to commands
- receiving desired properties
- updating reported properties
- receiving C2D messages

## Resilience
The node is developed to resist network loss. If there is no connectivity, the node will try to re-establish a device connection based on the set retry interval using exponential backoff. The node doesn't store and forward. All messages and properties sent during a loss of connectivity will be lost.

## Testing and Development

This package includes comprehensive TDD (Test-Driven Development) testing:

```bash
# Run tests locally
npm test

# Run tests in Docker (recommended for CI/CD)
docker build -t node-red-azure-iot-device:latest .
docker run --rm node-red-azure-iot-device:latest npm test
```

## Memory Leak Prevention

Version 0.3.0+ includes robust memory leak prevention:
- Automatic cleanup of event listeners on disconnect
- Proper resource disposal for Azure IoT SDK clients
- Exponential backoff reconnection strategy
- Method response cleanup to prevent accumulation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass: `npm test`
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

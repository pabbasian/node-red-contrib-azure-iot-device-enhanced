# Release notes

## Release 0.4.4 (Critical Memory Leak Fixes):
- **MAJOR MEMORY LEAK FIXES**:
    - **Fixed Event Handler Multiplication**: Prevented multiple `close` and `input` event handlers being registered on every reconnection
    - **Fixed Cascading Reconnections**: Eliminated race conditions between `closeAll()` and `initiateDevice()` that created connection leaks  
    - **Added Connection State Management**: Introduced `_closing` flag to prevent reconnection attempts during shutdown
    - **Improved Resource Cleanup**: Enhanced disconnect handler to only clean Azure IoT SDK resources, preserving Node-RED level handlers
    - **Handler Registration Control**: Added `_handlersRegistered` flag to ensure Node-RED event handlers are registered only once
- **Production Stability**:
    - Resolves Node-RED crashes and system reboots caused by memory accumulation
    - Fixes infinite memory growth in long-running deployments with frequent disconnections
    - Prevents resource exhaustion in high-connection-churn environments
    - Eliminates zombie timeout and interval objects

## Release 0.4.3 (Compatibility Update):
- **Broader Node.js Compatibility**:
    - Reduced minimum Node.js requirement from 16.0.0 to 14.0.0
    - Compatible with older Node-RED installations (Node-RED 3.x supports Node.js 14+)
    - Maintains compatibility with all current LTS versions (14.x, 16.x, 18.x, 20.x, 22.x)
    - Supports legacy production environments with older Node.js versions

## Release 0.4.2 (Critical Bug Fix Release):
- **Message Validation Fix**:
    - Fixed overly strict message validation that was rejecting valid telemetry payloads containing arrays
    - Updated validateMessage function to allow arrays, nested objects, and all JSON-serializable data
    - Resolved "Invalid telemetry format" errors for legitimate IoT telemetry messages
    - Now supports complex telemetry structures including wind farm data with subAssets arrays

## Release 0.4.1 (Bug Fix Release):
- **Critical Bug Fix**:
    - Removed unwanted timestamp validation that was blocking valid telemetry messages
    - Fixed issue where telemetry messages were rejected due to timestamp format validation
    - Restored original telemetry processing behavior without timestamp constraints

## Release 0.4.0 (Major Enhancement Release):
- **Enhanced Production Reliability**:
    - Infinite reconnection with exponential backoff (2s → 4s → 8s → 16s → 30s cap)
    - Comprehensive configuration validation (Device ID, Scope ID requirements)
    - Improved JSON parsing with graceful error handling
    - Enhanced message validation with array rejection and nested object support
    - Connection state tracking with timestamps
- **Memory Management & Cleanup**:
    - Enhanced `closeAll()` function with complete resource cleanup
    - Proper timeout and interval management
    - Memory leak prevention for long-running deployments
    - Automatic cleanup of reconnection timeouts and health check intervals
- **Error Handling & Validation**:
    - Robust input validation for all message types
    - Safe JSON parsing with detailed error messages
    - Configuration validation with early error detection
    - Comprehensive logging with attempt counters
- **Code Quality & Testing**:
    - Comprehensive stress testing suite
    - Logic validation for all core algorithms
    - Production-ready code with extensive error boundaries
    - Enhanced documentation and attribution

## Release 0.3.0 (Enhanced Fork by Payman Abbasian):
- **BREAKING CHANGE**: Package name changed to `node-red-contrib-azure-iot-device-enhanced`
- **Critical Memory Leak Fixes**:
    - Fixed memory leaks that caused Node-RED crashes and system reboots
    - Proper cleanup of Azure IoT SDK event listeners on disconnect
    - Method response cleanup to prevent memory accumulation
    - Resource disposal with timeout protection
- **Enhanced Reliability**:
    - Exponential backoff reconnection strategy
    - Improved error handling and recovery
    - Connection timeout protection
- **Development & Testing**:
    - Complete TDD test suite with Mocha, Chai, Sinon
    - Docker-based testing environment
    - Comprehensive mocking of Azure IoT SDK components
    - CI/CD ready with pre-publish testing
- **Fork Information**:
    - Forked from original archived repository by Eric van Uum
    - Maintains full API compatibility with original
    - Enhanced for production environments with high connection churn
    - Repository: https://github.com/p25301/node-red-contrib-azure-iot-device

---

## Original Repository Releases (by Eric van Uum):

## Release 0.2.6:
- Updates:
    - Updated to latest version of Azure IOT SDK (1.9.0 for device)

## Release 0.2.5:
- Bug fixes:
    - [#27](https://github.com/iotblackbelt/node-red-contrib-azure-iot-device/issues/27): Incorrect azure-iot-device-amqp version in 0.2.4?
        - Wrong version in package.json, has been fixed

## Release 0.2.4:
- Bug fixes:
    - [#26](https://github.com/iotblackbelt/node-red-contrib-azure-iot-device/issues/26): Why is SAS key visible in logging bug?
        - Connection string logging removed.
    - [#25](https://github.com/iotblackbelt/node-red-contrib-azure-iot-device/issues/25): New device on another flow: message "leakage" between devices?
        - Bug in node code, has been fixed
    - [#24](https://github.com/iotblackbelt/node-red-contrib-azure-iot-device/issues/24): TypeError exception with desired properties message
        -  Bug in node code, has been fixed
    - [#21](https://github.com/iotblackbelt/node-red-contrib-azure-iot-device/issues/21): Node-Red device fails provisioning using CA certificates
        -  Bug in node code, has been fixed. Be aware only CA based X.509 certificates (self-signed or from a certificate authority) are supported.

- Updates:
    - Automatic response on desired property changes for IoT Central and PnP devices has been removed. It is up to the flow-logic in Node-Red to confirm receipt. The change has been made because the logic in Node-Red should determine whether action is taken based on desired property updates. Similar to the command (direct method) approach. Examples of root and component the confirmation messages are added to the [use](https://github.com/iotblackbelt/node-red-contrib-azure-iot-device/blob/master/USE.md) document.
    - Documentation: 
        - CONFIGURE.md added: "Currently only CA based X.509 (group) certificates are supported. Individual device certificates are not. Both individual and group SAS Keys are supported."
        - USE.md added: description of "Azure IoT Central and PnP require a specific reported property"

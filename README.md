[![npm](https://badgen.net/npm/v/homebridge-optoma-projector-telnet/latest)](https://www.npmjs.com/package/homebridge-optoma-projector-telnet) 
[![npm](https://badgen.net/npm/dt/homebridge-optoma-projector-telnet)](https://www.npmjs.com/package/homebridge-optoma-projector-telnet)


# Homebridge Optoma Projector Telnet

A plugin for Homebridge, to control Optoma Projectors via Telnet.

## Installation and configuration

Install the plugin:

```
sudo npm install -g --unsafe-perm homebridge-optoma-projector-telnet
```

Add your projector in your Hombridge `config.js`:

```
"accessories": [
    {
        "accessory": "OptomaProjectorTelnet",
        "name": "My Projector",
        "address": "10.0.0.90"
    }
]
```

### Settings

  * `accessory` - has to be `OptomaProjectorTelnet`
  * `name` - the accessories name
  * `address` - IP address of the projector
  * `port` (optional) - Telnet port of the projector (default value: `23`)
  * `projectorId` (optional) - The ID of the projector (default value: `1`)
  * `model` (optional) - The projectors model (default value: `unkown`)
  * `serialNumber` (optional) - The projectors serial number (default value: `unknown`)
  * `logLevel` (optional) - 0: off, 1: default, 3: verbose (default value: `1`)
  
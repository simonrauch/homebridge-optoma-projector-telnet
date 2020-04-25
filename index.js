'use strict'

let Service, Characteristic

const net = require('net');

module.exports = (homebridge) => {
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  homebridge.registerAccessory('homebridge-optoma-projector-telnet', 'OptomaProjectorTelnet', ProjectorAccessory)
}

class ProjectorAccessory {
  constructor(log, config) {
    this.log = log
    this.config = config

    this.socket = new net.Socket();

    this.socket.connect({ host: config.address, port: config.port || 23 }, () => {
      this.socket.on('data', this.handleData.bind(this));
    });

    this.service = new Service.Switch(this.config.name)
  }

  handleData(data) {
    if (data.includes('INFO1')) {
      this.isOn = 1;
    }
    if (data.includes('INFO0')) {
      this.isOn = 0;
    }
  }

  getServices() {
    const informationService = new Service.AccessoryInformation()
      .setCharacteristic(Characteristic.Manufacturer, 'Optoma')
      .setCharacteristic(Characteristic.Model, this.config.model || 'unknown')
      .setCharacteristic(Characteristic.SerialNumber, this.config.serialNumber || 'unknown')

    this.service.getCharacteristic(Characteristic.On)
      .on('get', this.getOnCharacteristicHandler.bind(this))
      .on('set', this.setOnCharacteristicHandler.bind(this))

    return [informationService, this.service]
  }

  setOnCharacteristicHandler(value, callback) {
    if (value) {
      this.socket.write('~0100 1\r\n');
    } else {
      this.socket.write('~0100 2\r\n');
    }
    callback(null)
  }

  getOnCharacteristicHandler(callback) {
    callback(null, this.isOn)
  }
}

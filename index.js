'use strict'

let Service, Characteristic

const net = require('net')

module.exports = (homebridge) => {
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  homebridge.registerAccessory('homebridge-optoma-projector-telnet', 'OptomaProjectorTelnet', ProjectorAccessory)
}

class ProjectorAccessory {
  constructor(log, config) {
    this.log = log
    this.config = config
    this.service = new Service.Switch(this.config.name)
  }

  getSocketOptions() {
    return {
      host: this.config.address,
      port: parseInt(this.config.port) || 23
    }
  }

  handleError() {
    this.log('Socket error')
    this.isOn = 0
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
    if (this.commandInProgress) {
      callback('command already running')
      return
    }

    this.commandInProgress = true;

    setTimeout(() => {
      this.commandInProgress = false;
    }, 3500)

    let socket = this.getDefaultCommandSocket()

    socket.on('close', (hadError) => {
      callback((hadError) ? 'error' : null, this.isOn)
      return
    })

    socket.on('data', (data) => {
      if (data.includes('P') || data.includes('F')) {
        this.isOn = value
        socket.end()
      }
    })

    socket.connect(this.getSocketOptions(), () => {
      if (value) {
        socket.write(this.getBootCommand());
        this.log('Sending boot command')
      } else {
        socket.write(this.getShutdownCommand())
        this.log('Sending shutdown command')
      }
    })
  }

  getOnCharacteristicHandler(callback) {
    if (this.fetchInProgress) {
      callback(null, this.isOn)
      return
    }
    this.fetchInProgress = true;
    setTimeout(() => {
      this.fetchInProgress = false;
    }, 3500)

    let socket = this.getDefaultCommandSocket()

    socket.on('close', (hadError) => {
      callback((hadError) ? 'error' : null, this.isOn)
      return
    })

    socket.on('data', (data) => {
      if (data.includes('OK1') || data.includes('Ok1')) {
        this.isOn = 1
      }
      if (data.includes('OK0') || data.includes('Ok0')) {
        this.isOn = 0
      }
      if (data.includes('P') || data.includes('F')) {
        socket.end()
      }
    })

    socket.connect(this.getSocketOptions(), () => {
      socket.write(this.getStatusCommand())
    })
  }

  getBootCommand() {
    return `~${this.getProjectorId()}00 1\r\n`
  }

  getShutdownCommand() {
    return `~${this.getProjectorId()}00 2\r\n`
  }

  getStatusCommand() {
    return `~${this.getProjectorId()}150 1\r\n`
  }

  getProjectorId() {
    let id = parseInt(this.config.projectorId) || 1
    return ("0" + id).slice(-2)
  }

  getDefaultCommandSocket() {
    let socket = new net.Socket()

    socket.setTimeout(3000);

    socket.on('timeout', () => {
      socket.end();
    });

    socket.on('error', this.handleError.bind(this))

    return socket
  }
}

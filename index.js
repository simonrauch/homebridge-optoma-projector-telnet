'use strict'

let Service, Characteristic

const net = require('net')


const UP_MESSAGES = [
  'INFO1',
  'OK1',
  'Ok1'
]

const DOWN_MESSAGES = [
  'INFO0',
  'OK0',
  'Ok0'
]

module.exports = (homebridge) => {
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  homebridge.registerAccessory('homebridge-optoma-projector-telnet', 'OptomaProjectorTelnet', ProjectorAccessory)
}

class ProjectorAccessory {

  constructor(log, config) {
    this.connectionTimeout = 30000
    this.log = log
    this.config = config
    this.error = true
    this.connect()
    this.service = new Service.Switch(this.config.name)
    this.updateStatus(0)
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

  connect() {
    if (this.socket) {
      this.socket.end()
      this.socket.destroy()
    }

    const socketOptions = {
      host: this.config.address,
      port: parseInt(this.config.port) || 23
    }

    this.socket = new net.Socket();
    this.socket.on('error', this.handleError.bind(this))
    this.socket.on('timeout', this.handleError.bind(this))
    this.socket.on('data', this.handleData.bind(this))
    this.socket.setTimeout(this.connectionTimeout)

    this.log('Trying to connect...')
    this.socket.connect(socketOptions, () => {
      this.socket.setTimeout(0)
      this.log('Projector is connected.')
      this.error = false
      this.socket.write(this.getStatusCommand())
    })

  }

  updateStatus(status) {
    this.isOn = status;
    this.service.getCharacteristic(Characteristic.On).updateValue(status);
  }

  getSocketOptions() {
    return {
      host: this.config.address,
      port: parseInt(this.config.port) || 23
    }
  }

  handleError() {
    this.log('Socket error')
    this.error = true
    this.updateStatus(0)
    this.connect()
  }

  handleData(data) {
    if (this.messageInData(data, UP_MESSAGES)) {
      this.log('Received UP message.')
      this.updateStatus(1)
    }

    if (this.messageInData(data, DOWN_MESSAGES)) {
      this.log('Received DOWN message.')
      this.updateStatus(0)
    }

    if (this.commandCallback) {
      if (data.includes('P')) {
        this.commandCallback(null)
      }
      if (data.includes('F')) {
        this.commandCallback(true)
      }
      this.commandCallback = null
    }
  }

  messageInData(data, messages) {
    for (const message of messages) {
      if (data.includes(message)) {
        return true
      }
    }
    return false
  }

  setOnCharacteristicHandler(value, callback) {
    if (this.error) {
      callback(true)
      return
    }
    let oldValue = value

    if (value) {
      this.socket.write(this.getBootCommand());
      this.log('Sending boot command')
    } else {
      this.socket.write(this.getShutdownCommand())
      this.log('Sending shutdown command')
    }

    this.commandCallback = callback
    setTimeout(() => {
      if (this.commandCallback) {
        this.handleError()
        this.updateStatus(oldValue)
        this.commandCallback(true)
        this.commandCallback = null
      }
    }, 5000)

    this.updateStatus(value)
  }

  getOnCharacteristicHandler(callback) {
    if (this.error) {
      callback(true)
      return
    }
    callback(null, this.isOn)
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
}

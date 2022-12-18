'use strict'

let Service, Characteristic

const net = require('net')

const PORT = 23 
const POLL = 5000
const CONNECTION_TIMEOUT = 30000

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
    this.log = log
    this.config = config
    this.poll = true
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
      port: parseInt(this.config.port) || PORT
    }

    this.socket = new net.Socket()
    this.socket.on('error', this.handleError.bind(this))
    this.socket.on('timeout', this.handleTimeout.bind(this))
    this.socket.on('data', this.handleData.bind(this))
    this.socket.setTimeout(CONNECTION_TIMEOUT)

    this.log('Trying to connect...')
    this.socket.connect(socketOptions, () => {
      this.socket.setTimeout(0)
      this.log('is connected.')
      this.error = false
      this.socket.write(this.getStatusCommand())
      setInterval(this.pollStatus.bind(this), POLL)
    })
  }

  pollStatus() {
    if (!this.poll) return
    this.socket.write(this.getStatusCommand())
  }

  updateStatus(status) {
    if (this.isOn === status || !this.poll) return
    this.isOn = status
    this.service.getCharacteristic(Characteristic.On).updateValue(status)
    this.log(!!this.isOn ? 'ON' : 'OFF')
  }

  getSocketOptions() {
    return {
      host: this.config.address,
      port: parseInt(this.config.port) || PORT
    }
  }

  handleError() {
    this.log('Socket error')
    this.resetConnection()
  }

  handleTimeout() {
    this.log('Socket timeout')
    this.resetConnection()
  }

  resetConnection() {
    this.log('Reset Connection')
    this.error = true
    this.updateStatus(0)
    this.connect()
    this.poll = true
  }

  formatResponse(data) {
    return String(data).split('\r\n').slice(0, -1).join()
  }

  handleCallback(data, value) {
    this.log(`Response ${formatResponse(data)}`)
    this.poll = true
    this.commandCallback(value)
    this.commandCallback = null
  }

  handleData(data) {
    if (this.messageInData(data, UP_MESSAGES)) {
      this.updateStatus(1)
    }

    if (this.messageInData(data, DOWN_MESSAGES)) {
      this.updateStatus(0)
    }

    // this.log(`${formatResponse(data)}`)

    if (this.commandCallback) {
      if (data.includes('P')) {
        handleCallback(data, null)
      } else if (data.includes('F')) {
        handleCallback(data, true)
      }
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
      this.log('ERROR: setOnCharacteristicHandler')
      callback(true)
      return
    }

    let oldValue = value

    if (value) {
      this.log(`Sending boot command ${this.getBootCommand()}`)
      this.socket.write(this.getBootCommand())
    } else {
      this.log(`Sending shutdown command ${this.getShutdownCommand()}`)
      this.socket.write(this.getShutdownCommand())
    }

    this.commandCallback = callback
    setTimeout(() => {
      this.poll = true
      if (this.commandCallback) {
        this.updateStatus(oldValue)
        this.handleTimeout()
        this.commandCallback(true)
        this.commandCallback = null
      }
    }, CONNECTION_TIMEOUT)

    this.updateStatus(value)
    this.poll = false
  }

  getOnCharacteristicHandler(callback) {
    if (this.error) {
      this.log('ERROR: getOnCharacteristicHandler')
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

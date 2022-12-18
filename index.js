'use strict'

let Service, Characteristic

const net = require('net')

const PORT = 23 
const PAUSE_UPDATE_TIME = 3000
const CONNECTION_TIMEOUT = 30000
const DEFAULT_LOG_LEVEL = 1

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

const formatData = (data) => String(data).split('\r\n').slice(0, -1).join()

module.exports = (homebridge) => {
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  homebridge.registerAccessory('homebridge-optoma-projector-telnet', 'OptomaProjectorTelnet', ProjectorAccessory)
}

class ProjectorAccessory {

  constructor(log, config) {
    this.config = config
    this.logLevel = config.logLevel || DEFAULT_LOG_LEVEL

    this.log = (msg, level = DEFAULT_LOG_LEVEL) => {
      if (level<=this.logLevel) log(msg)
    }

    this.enableStatusUpdates = true
    this.connected = false
    this.data = null

    this.log(`Log level: ${this.logLevel}`)
    this.connect()
    this.service = new Service.Switch(this.config.name)
    // this.updateStatus(0)
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
      port: parseInt(this.config.port) || PORT,
      noDelay: true,
    }

    this.socket = new net.Socket()
    this.socket.on('error', this.handleError.bind(this))
    this.socket.on('timeout', this.handleTimeout.bind(this))
    this.socket.on('data', this.handleData.bind(this))
    this.socket.on('ready', () => this.log('Connected'))
    this.socket.setTimeout(CONNECTION_TIMEOUT)

    this.log('Trying to connect...')
    this.socket.connect(socketOptions, () => {
      this.socket.setTimeout(0)
      this.connected = true
      this.socket.write(this.getStatusCommand())
    })
  }

  updateStatus(status) {
    if (this.isOn === status || !this.enableStatusUpdates) return
    this.isOn = status
    this.service.getCharacteristic(Characteristic.On).updateValue(status)
    this.log(!!status ? 'ON' : 'OFF')
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
    this.connected = false
    // this.updateStatus(0)
    this.connect()
    
  }

  handleCallback(data, value) {
    this.commandCallback(value)
    this.commandCallback = null
  }

  handleData(data) {
    if (this.data !== String(data)) this.log(`Received: ${formatData(data)}`, 2)
    this.data = String(data)
    
    if (this.messageInData(data, UP_MESSAGES)) {
      this.updateStatus(1)
    }

    if (this.messageInData(data, DOWN_MESSAGES)) {
      this.updateStatus(0)
    }

    if (this.commandCallback) {
      if (data.includes('P')) {
        this.handleCallback(data, null)
      } else if (data.includes('F')) {
        this.handleCallback(data, true)
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

  pauseUpdate() {
    this.log('Disable status updates', 2)
    this.enableStatusUpdates = false
    setTimeout(() => {
      this.log('Enable status updates', 2)
      this.enableStatusUpdates = true
    }, PAUSE_UPDATE_TIME)
  }

  setOnCharacteristicHandler(value, callback) {
    if (this.connected) {
      callback(true)
      return
    }

    if (value) {
      this.updateStatus(1)
      const bootCommand = this.getBootCommand()
      this.log(`Sending boot command (${formatData(bootCommand)})`, 2)
      this.socket.write(bootCommand)
    } else {
      this.updateStatus(0)
      const shutdownCommand = this.getShutdownCommand()
      this.log(`Sending shutdown command (${formatData(shutdownCommand)})`, 2)
      this.socket.write(shutdownCommand)
    }

    this.pauseUpdate()

    let oldValue = value
    this.commandCallback = callback
    setTimeout(() => {
      if (this.commandCallback) {
        this.updateStatus(oldValue)
        this.handleTimeout()
        this.commandCallback(true)
        this.commandCallback = null
      }
    }, CONNECTION_TIMEOUT)
  }

  getOnCharacteristicHandler(callback) {
    if (this.connected) {
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

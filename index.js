'use strict'

let Service, Characteristic

const net = require('net')

const ON = 1
const OFF = 0
const PORT = 23
const POLL_INTERVAL = 1000
const PAUSE_UPDATE_TIME = 9000
const CONNECTION_TIMEOUT = 1000
const DEFAULT_LOG_LEVEL = 1
const DEBUG = 2

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
    this.isOn = null
    this.poll = null

    this.log(`Log level: ${this.logLevel}`)
    this.connect()
    this.service = new Service.Switch(this.config.name)
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

    if (this.poll) {
      clearInterval(this.poll)
    }

    const socketOptions = {
      host: this.config.address,
      port: Number(this.config.port) || PORT,
      noDelay: true,
      keepAlive: true,
    }

    this.socket = new net.Socket()
    this.socket.on('error', this.handleError.bind(this))
    this.socket.on('timeout', this.handleTimeout.bind(this))
    this.socket.on('data', this.handleData.bind(this))
    this.socket.on('ready', this.handleReady.bind(this))
    
    this.log('Trying to connect...')
    this.socket.connect(socketOptions, () => {
      this.socket.setTimeout(0)
      this.connected = true
      this.socket.write(this.getStatusCommand())
    })
  }

  pollStatus() {
    if (this.enableStatusUpdates){
      this.socket.write(this.getStatusCommand())
    }
  }

  updateStatus(status) {
    if (this.isOn === status || !this.enableStatusUpdates) return
    this.isOn = status
    this.service.getCharacteristic(Characteristic.On).updateValue(status)
    this.log(!!status ? 'ON' : 'OFF')
  }

  handleReady() {
    this.log('Connected')
    this.poll = setInterval(this.pollStatus.bind(this), POLL_INTERVAL)
    if (this.isOn !== null) {
      this.sendStatusCmd[Number(this.isOn)].bind(this)()
    }
  }

  handleError() {
    this.log('Socket error', DEBUG)
    this.resetConnection()
  }

  handleTimeout() {
    this.log('Socket timeout', DEBUG)
    this.resetConnection()
  }

  resetConnection() {
    this.log('Reset Connection')
    this.connected = false
    this.connect()
    
  }

  handleCallback(data, value) {
    this.commandCallback(value)
    this.commandCallback = null
  }

  handleData(data) {
    this.log(`Received: ${formatData(data)}`, DEBUG)
    if (this.data !== String(data) && this.logLevel !== DEBUG) {
      this.log(`Received: ${formatData(data)}`)
      this.data = String(data)
    }
    
    if (this.messageInData(data, UP_MESSAGES)) {
      this.updateStatus(ON)
    }

    if (this.messageInData(data, DOWN_MESSAGES)) {
      this.updateStatus(OFF)
    }

    if (this.commandCallback) {
      if (data.includes('P')) {
        this.handleCallback(data, null)
      } else if (data.includes('F')) {
        this.handleCallback(data, true)
      }
    }
  }

  messageInData = (data, messages) => messages.some(message => data.includes(message))

  pauseUpdate() {
    this.log('Disable status updates', DEBUG)
    this.enableStatusUpdates = false
    setTimeout(() => {
      this.log('Enable status updates', DEBUG)
      this.enableStatusUpdates = true
    }, PAUSE_UPDATE_TIME)
  }

  sendStatusCmd = [
    () => {
      const shutdownCommand = this.getShutdownCommand()
      this.log(`Sending shutdown command (${formatData(shutdownCommand)})`, DEBUG)
      this.socket.write(shutdownCommand)
      this.updateStatus(OFF)
    },
    () => {
      const bootCommand = this.getBootCommand()
      this.log(`Sending boot command (${formatData(bootCommand)})`, DEBUG)
      this.socket.write(bootCommand)
      this.updateStatus(ON)
    },
  ]

  setOnCharacteristicHandler(value, callback) {
    if (!this.connected) {
      callback(true)
      return
    }

    this.sendStatusCmd[Number(value)].bind(this)()

    this.pauseUpdate()

    this.commandCallback = callback

    setTimeout(() => {
      if (this.commandCallback) {
        this.log('No Respose', DEBUG)
        this.resetConnection()
      }
    }, CONNECTION_TIMEOUT)
  }

  getOnCharacteristicHandler(callback) {
    if (!this.connected) {
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

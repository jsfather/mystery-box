import mqtt from 'mqtt'

const client = mqtt.connect('mqtt://localhost:1883')

let lastMessage = ''

client.on('connect', () => {
  console.log('✅ MQTT connected')
  client.subscribe('message', (err) => {
    if (err) console.error('❌ Subscribe error', err)
  })
})

client.on('message', (topic, message) => {
  console.log(`📩 Received: ${message.toString()}`)
  lastMessage = message.toString()
})

export function publishMessage(msg: string) {
  client.publish('message', msg)
}

export function getLastMessage() {
  return lastMessage
}

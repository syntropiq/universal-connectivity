import { createHeadlessLibp2p } from './lib/libp2p-core'

async function runHeadlessDemo() {
  // Create a headless libp2p node
  const { events, ...libp2p } = await createHeadlessLibp2p()

  // Listen for various events
  events.on('peer:discovery', ({ id, multiaddrs }) => {
    console.log('Discovered peer:', id.toString())
    console.log('Available multiaddrs:', multiaddrs.map(m => m.toString()))
  })

  events.on('connection:open', (connection) => {
    console.log('New connection opened with peer:', connection.remotePeer.toString())
  })

  events.on('connection:close', (connection) => {
    console.log('Connection closed with peer:', connection.remotePeer.toString())
  })

  // Subscribe to chat topics
  libp2p.services.pubsub.subscribe('chat', (message) => {
    console.log('Chat message received:', new TextDecoder().decode(message.data))
  })

  // Log our own peer ID and multiaddrs
  console.log('Our peer ID:', libp2p.peerId.toString())
  console.log('Listen addresses:', libp2p.getMultiaddrs().map(m => m.toString()))
  
  // Keep the process running
  process.stdin.resume()
  
  // Cleanup on exit
  process.on('SIGINT', async () => {
    console.log('Shutting down...')
    await libp2p.stop()
    process.exit(0)
  })
}

// Run the demo
runHeadlessDemo().catch(console.error)
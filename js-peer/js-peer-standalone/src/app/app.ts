import { P2PNode } from '@/lib/libp2p'
import { forComponent } from '@/lib/logger'

const log = forComponent('app')

async function main() {
  const node = new P2PNode()

  // Listen for peer discovery events
  node.on('peer:discovery', (detail) => {
    log('Discovered peer:', detail.id.toString())
  })

  // Listen for peer updates
  node.on('peer:update', ({ peer }) => {
    log('Peer info changed:', peer.id.toString())
  })

  try {
    const libp2p = await node.start()
    log('Node started with PeerId:', libp2p.peerId.toString())

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      log('Shutting down...')
      await node.stop()
      process.exit(0)
    })
  } catch (error) {
    console.error('Failed to start node:', error)
    process.exit(1)
  }
}

main()
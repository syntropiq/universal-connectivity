import { P2PNode } from '@universal-connectivity/js-peer-lib'
import debug from 'debug'
import type { PeerInfo, Connection } from '@libp2p/interface'

const log = debug('ui:node-server')
log.log = console.log.bind(console)

async function main() {
  const node = new P2PNode()
  
  try {
    const libp2p = await node.start()
    log('Node started successfully')
    log('PeerID:', libp2p.peerId.toString())
    
    // Log when we discover new peers
    libp2p.addEventListener('peer:discovery', (evt: { detail: PeerInfo }) => {
      const peer = evt.detail
      log('Discovered peer:', peer.id.toString())
    })

    // Log when we establish new connections
    libp2p.addEventListener('connection:open', (evt: { detail: Connection }) => {
      const connection = evt.detail
      log('New connection established with:', connection.remotePeer.toString())
    })

    // Handle shutdown gracefully
    const shutdown = async () => {
      log('Shutting down...')
      await node.stop()
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

  } catch (err) {
    log('Failed to start node:', err)
    process.exit(1)
  }
}

main().catch(console.error)
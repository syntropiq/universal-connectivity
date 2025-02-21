import { EventEmitter } from 'events'
import {
  createDelegatedRoutingV1HttpApiClient,
  DelegatedRoutingV1HttpApiClient,
} from '@helia/delegated-routing-v1-http-api-client'
import { createLibp2p } from 'libp2p'
import { identify } from '@libp2p/identify'
import { peerIdFromString } from '@libp2p/peer-id'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { Multiaddr } from '@multiformats/multiaddr'
import { sha256 } from 'multiformats/hashes/sha2'
import type { Connection, Message, SignedMessage, PeerId, Libp2p } from '@libp2p/interface'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { webSockets } from '@libp2p/websockets'
import { webTransport } from '@libp2p/webtransport'
import { webRTC, webRTCDirect } from '@libp2p/webrtc'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery'
import { ping } from '@libp2p/ping'
import { BOOTSTRAP_PEER_IDS, CHAT_FILE_TOPIC, CHAT_TOPIC, PUBSUB_PEER_DISCOVERY } from '@/lib/constants'
import first from 'it-first'
import { forComponent } from '@/lib/logger'
import { directMessage } from '@/lib/direct-message'
import type { Libp2pType } from '@/context/ctx'

const log = forComponent('libp2p-core')

export interface Libp2pWithEvents extends Libp2pType {
  events: EventEmitter
}

export async function createHeadlessLibp2p(): Promise<Libp2pWithEvents> {
  const events = new EventEmitter()
  const delegatedClient = createDelegatedRoutingV1HttpApiClient('https://delegated-ipfs.dev')
  const relayListenAddrs = await getBootstrapMultiaddrs(delegatedClient)
  
  log('starting libp2p with relayListenAddrs: %o', relayListenAddrs)

  const libp2p = await createLibp2p({
    addresses: {
      listen: [
        '/webrtc',
        ...relayListenAddrs,
      ],
    },
    transports: [
      webTransport(),
      webSockets(),
      webRTC(),
      webRTCDirect(),
      circuitRelayTransport(),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: {
      denyDialMultiaddr: async () => false,
    },
    peerDiscovery: [
      pubsubPeerDiscovery({
        interval: 10_000,
        topics: [PUBSUB_PEER_DISCOVERY],
        listenOnly: false,
      }),
    ],
    services: {
      pubsub: gossipsub({
        allowPublishToZeroTopicPeers: true,
        msgIdFn: msgIdFnStrictNoSign,
        ignoreDuplicatePublishError: true,
      }),
      delegatedRouting: () => delegatedClient,
      identify: identify(),
      directMessage: directMessage(),
      ping: ping(),
    },
  }) as Libp2pType

  if (!libp2p) {
    throw new Error('Failed to create libp2p node')
  }

  // Subscribe to chat topics
  libp2p.services.pubsub.subscribe(CHAT_TOPIC)
  libp2p.services.pubsub.subscribe(CHAT_FILE_TOPIC)

  // Set up event forwarding
  libp2p.addEventListener('self:peer:update', (evt) => {
    events.emit('self:peer:update', evt.detail)
  })

  libp2p.addEventListener('peer:discovery', (evt) => {
    events.emit('peer:discovery', evt.detail)
    const { multiaddrs, id } = evt.detail

    if (libp2p.getConnections(id)?.length > 0) {
      log('Already connected to peer %s. Will not try dialling', id)
      return
    }

    dialWebRTCMaddrs(libp2p, multiaddrs)
  })

  // Forward connection events
  libp2p.addEventListener('connection:open', (evt) => {
    events.emit('connection:open', evt.detail)
  })

  libp2p.addEventListener('connection:close', (evt) => {
    events.emit('connection:close', evt.detail)
  })

  return Object.assign(libp2p, { events })
}

// Helper functions
async function msgIdFnStrictNoSign(msg: Message): Promise<Uint8Array> {
  var enc = new TextEncoder()
  const signedMessage = msg as SignedMessage
  const encodedSeqNum = enc.encode(signedMessage.sequenceNumber.toString())
  return await sha256.encode(encodedSeqNum)
}

async function dialWebRTCMaddrs(libp2p: Libp2p, multiaddrs: Multiaddr[]): Promise<void> {
  const webRTCMadrs = multiaddrs.filter((maddr) => maddr.protoNames().includes('webrtc'))
  log('dialling WebRTC multiaddrs: %o', webRTCMadrs)

  for (const addr of webRTCMadrs) {
    try {
      log('attempting to dial webrtc multiaddr: %o', addr)
      await libp2p.dial(addr)
      return
    } catch (error) {
      log.error('failed to dial webrtc multiaddr: %o', addr)
    }
  }
}

export async function connectToMultiaddr(libp2p: Libp2p, multiaddr: Multiaddr) {
  log('dialling: %a', multiaddr)
  try {
    const conn = await libp2p.dial(multiaddr)
    log('connected to %p on %a', conn.remotePeer, conn.remoteAddr)
    return conn
  } catch (e) {
    console.error(e)
    throw e
  }
}

async function getBootstrapMultiaddrs(client: DelegatedRoutingV1HttpApiClient): Promise<string[]> {
  const peers = await Promise.all(BOOTSTRAP_PEER_IDS.map((peerId) => first(client.getPeers(peerIdFromString(peerId)))))
  const relayListenAddrs = []
  
  for (const p of peers) {
    if (p && p.Addrs.length > 0) {
      for (const maddr of p.Addrs) {
        const protos = maddr.protoNames()
        if (protos.includes('tls') && protos.includes('ws') && protos.includes('ip4')) {
          if (maddr.nodeAddress().address === '127.0.0.1') continue
          relayListenAddrs.push(getRelayListenAddr(maddr, p.ID))
        }
      }
    }
  }
  return relayListenAddrs
}

const getRelayListenAddr = (maddr: Multiaddr, peer: PeerId): string =>
  `${maddr.toString()}/p2p/${peer.toString()}/p2p-circuit`

export const getFormattedConnections = (connections: Connection[]) =>
  connections.map((conn) => ({
    peerId: conn.remotePeer,
    protocols: [...new Set(conn.remoteAddr.protoNames())],
  }))
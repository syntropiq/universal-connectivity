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
import type { Connection, Message, SignedMessage, PeerId } from '@libp2p/interface'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { webSockets } from '@libp2p/websockets'
import { webTransport } from '@libp2p/webtransport'
import { webRTC, webRTCDirect } from '@libp2p/webrtc'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery'
import { ping } from '@libp2p/ping'
import { BOOTSTRAP_PEER_IDS, CHAT_FILE_TOPIC, CHAT_TOPIC, PUBSUB_PEER_DISCOVERY } from './constants'
import first from 'it-first'
import { forComponent, enable } from './logger'
import { directMessage } from './direct-message'
import type { Libp2pType } from './types'
import EventEmitter from 'events'

const log = forComponent('libp2p')

export class P2PNode extends EventEmitter {
  private node: Libp2pType | null = null;

  async start(): Promise<Libp2pType> {
    enable('ui*,libp2p*,-libp2p:connection-manager*,-*:trace')

    const delegatedClient = createDelegatedRoutingV1HttpApiClient('https://delegated-ipfs.dev')
    const relayListenAddrs = await this.getBootstrapMultiaddrs(delegatedClient)
    log('starting libp2p with relayListenAddrs: %o', relayListenAddrs)

    this.node = await createLibp2p({
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
          msgIdFn: this.msgIdFnStrictNoSign,
          ignoreDuplicatePublishError: true,
        }),
        delegatedRouting: () => delegatedClient,
        identify: identify(),
        directMessage: directMessage(),
        ping: ping(),
      },
    })

    if (!this.node) {
      throw new Error('Failed to create libp2p node')
    }

    this.node.services.pubsub.subscribe(CHAT_TOPIC)
    this.node.services.pubsub.subscribe(CHAT_FILE_TOPIC)

    this.node.addEventListener('self:peer:update', ({ detail: { peer } }) => {
      const multiaddrs = peer.addresses.map(({ multiaddr }) => multiaddr)
      log('changed multiaddrs: peer %s multiaddrs: %s', peer.id.toString(), multiaddrs)
      this.emit('peer:update', { peer })
    })

    this.node.addEventListener('peer:discovery', (event) => {
      const { multiaddrs, id } = event.detail

      if (!this.node || this.node.getConnections(id).length > 0) {
        log('Already connected to peer %s. Will not try dialling', id)
        return
      }

      this.dialWebRTCMaddrs(multiaddrs)
      this.emit('peer:discovery', event.detail)
    })

    return this.node
  }

  async stop(): Promise<void> {
    if (this.node) {
      await this.node.stop()
      this.node = null
    }
  }

  public getNode(): Libp2pType | null {
    return this.node
  }

  private async msgIdFnStrictNoSign(msg: Message): Promise<Uint8Array> {
    const enc = new TextEncoder()
    const signedMessage = msg as SignedMessage
    const encodedSeqNum = enc.encode(signedMessage.sequenceNumber.toString())
    return await sha256.encode(encodedSeqNum)
  }

  private async dialWebRTCMaddrs(multiaddrs: Multiaddr[]): Promise<void> {
    if (!this.node) return

    const webRTCMadrs = multiaddrs.filter((maddr) => maddr.protoNames().includes('webrtc'))
    log('dialling WebRTC multiaddrs: %o', webRTCMadrs)

    for (const addr of webRTCMadrs) {
      try {
        log('attempting to dial webrtc multiaddr: %o', addr)
        await this.node.dial(addr)
        return
      } catch (error) {
        log('failed to dial webrtc multiaddr: %o', addr)
      }
    }
  }

  public async connectToMultiaddr(multiaddr: Multiaddr): Promise<Connection | undefined> {
    if (!this.node) return

    log('dialling: %s', multiaddr.toString())
    try {
      const conn = await this.node.dial(multiaddr)
      log('connected to %s on %s', conn.remotePeer.toString(), conn.remoteAddr.toString())
      return conn
    } catch (e) {
      console.error(e)
      throw e
    }
  }

  private async getBootstrapMultiaddrs(client: DelegatedRoutingV1HttpApiClient): Promise<string[]> {
    const peers = await Promise.all(BOOTSTRAP_PEER_IDS.map((peerId) => 
      first(client.getPeers(peerIdFromString(peerId)))
    ))

    const relayListenAddrs = []
    for (const p of peers) {
      if (p && p.Addrs.length > 0) {
        for (const maddr of p.Addrs) {
          const protos = maddr.protoNames()
          if (protos.includes('tls') && protos.includes('ws') && protos.includes('ip4')) {
            if (maddr.nodeAddress().address === '127.0.0.1') continue
            relayListenAddrs.push(this.getRelayListenAddr(maddr, p.ID))
          }
        }
      }
    }
    return relayListenAddrs
  }

  private getRelayListenAddr(maddr: Multiaddr, peer: PeerId): string {
    return `${maddr.toString()}/p2p/${peer.toString()}/p2p-circuit`
  }

  public getFormattedConnections(): Array<{ peerId: PeerId; protocols: string[] }> {
    if (!this.node) return []
    
    return this.node.getConnections().map((conn) => ({
      peerId: conn.remotePeer,
      protocols: [...new Set(conn.remoteAddr.protoNames())],
    }))
  }
}
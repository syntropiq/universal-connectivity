import { XCircleIcon } from '@heroicons/react/24/solid'
import type { PeerId, Connection } from '@libp2p/interface'
import { Badge } from './badge'
import { useCallback, useMemo } from 'react'
import { useLibp2pContext } from '@/context/ctx'

interface PeerListProps {
  connections: Connection[]
}

export default function PeerList({ connections }: PeerListProps) {
  // Sort connections by peer ID for consistent display
  const sortedConnections = useMemo(() => {
    return [...connections].sort((a, b) => 
      a.remotePeer.toString().localeCompare(b.remotePeer.toString())
    )
  }, [connections])

  return (
    <ul role="list" className="divide-y divide-gray-100">
      {sortedConnections.map((connection) => (
        <Peer key={connection.id} connection={connection} />
      ))}
    </ul>
  )
}

interface PeerProps {
  connection: Connection
}

function Peer({ connection }: PeerProps) {
  const { libp2p } = useLibp2pContext()

  const handleDisconnectPeer = useCallback(
    async (peerId: PeerId) => {
      const node = libp2p.getNode()
      if (!node) return

      try {
        await node.disconnect(peerId)
      } catch (e) {
        console.error('Failed to disconnect from peer:', e)
      }
    },
    [libp2p]
  )

  const { ipAddr, protocol } = useMemo(() => {
    try {
      const nodeAddr = connection.remoteAddr?.nodeAddress()
      return {
        ipAddr: nodeAddr ? `${nodeAddr.address}:${nodeAddr.port}` : null,
        protocol: connection.remoteAddr?.protoNames().join(', ') || 'unknown'
      }
    } catch {
      return { ipAddr: null, protocol: 'unknown' }
    }
  }, [connection])

  const isDirectMessageCapable = useMemo(() => {
    const node = libp2p.getNode()
    return node?.services.directMessage.isDmCapable(connection.remotePeer) || false
  }, [connection.remotePeer, libp2p])

  return (
    <li className="flex justify-between gap-x-6 py-3 px-4 hover:bg-gray-50">
      <div className="flex min-w-0 gap-x-4">
        <div className="mt-1 flex items-center gap-x-1.5">
          <div className={`flex-none rounded-full ${isDirectMessageCapable ? 'bg-emerald-500/20' : 'bg-gray-300/20'} p-1`}>
            <div className={`h-1.5 w-1.5 rounded-full ${isDirectMessageCapable ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          </div>
        </div>
        <div className="min-w-0 flex-auto">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900">
              {connection.remotePeer.toString().slice(-7)}
            </p>
            {ipAddr && <Badge text={ipAddr} />}
            {connection.remoteAddr?.protoNames().includes('webrtc') && 
              <Badge text="P2P Browser" variant="indigo" />
            }
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {protocol}
            <span className="mx-2">•</span>
            <Badge text={connection.direction} variant={connection.direction === 'inbound' ? 'green' : 'blue'} />
          </p>
        </div>
      </div>
      <div className="flex items-center gap-x-4">
        <button
          className="rounded p-2 bg-red-50 hover:bg-red-100 transition-colors group"
          onClick={() => handleDisconnectPeer(connection.remotePeer)}
          title="Disconnect peer"
        >
          <XCircleIcon className="h-5 w-5 text-red-400 group-hover:text-red-500" />
        </button>
      </div>
    </li>
  )
}

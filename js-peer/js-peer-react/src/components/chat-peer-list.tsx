import { useLibp2pContext } from '@/context/ctx'
import { CHAT_TOPIC } from '@/lib/constants'
import React, { useEffect, useState } from 'react'
import type { PeerId } from '@libp2p/interface'
import { PeerWrapper } from './peer'

export function ChatPeerList() {
  const { libp2p } = useLibp2pContext()
  const [subscribers, setSubscribers] = useState<PeerId[]>([])

  useEffect(() => {
    const onSubscriptionChange = () => {
      // Access the underlying node to get subscribers since P2PNode wraps a libp2p node
      const node = libp2p.getNode()
      if (!node) return
      const subscribers = node.services.pubsub.getSubscribers(CHAT_TOPIC) as PeerId[]
      setSubscribers(subscribers)
    }
    onSubscriptionChange()

    const node = libp2p.getNode()
    if (!node) return

    node.services.pubsub.addEventListener('subscription-change', onSubscriptionChange)
    return () => {
      const node = libp2p.getNode()
      if (!node) return
      node.services.pubsub.removeEventListener('subscription-change', onSubscriptionChange)
    }
  }, [libp2p])

  // Get the peerId from the underlying node
  const node = libp2p.getNode()
  if (!node) return null

  return (
    <div className="border-l border-gray-300 lg:col-span-1">
      <h2 className="my-2 mb-2 ml-2 text-lg text-gray-600">Peers</h2>
      <div className="overflow-auto h-[32rem]">
        <div className="px-3 py-2 border-b border-gray-300 focus:outline-none">
          {<PeerWrapper peer={node.peerId} self withName={true} withUnread={false} />}
        </div>
        {subscribers.map((p) => (
          <div key={p.toString()} className="px-3 py-2 border-b border-gray-300 focus:outline-none">
            <PeerWrapper peer={p} self={false} withName={true} withUnread={true} />
          </div>
        ))}
      </div>
    </div>
  )
}

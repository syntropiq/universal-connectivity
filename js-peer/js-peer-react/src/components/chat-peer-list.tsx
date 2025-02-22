import { useLibp2pContext } from '@/context/ctx'
import { CHAT_TOPIC } from '@universal-connectivity/js-peer-lib'
import React, { useEffect, useState, useMemo } from 'react'
import type { PeerId } from '@libp2p/interface'
import { PeerWrapper } from './peer'
import { useChatContext } from '@/context/chat-ctx'

export function ChatPeerList() {
  const { libp2p } = useLibp2pContext()
  const { directMessages } = useChatContext()
  const [subscribers, setSubscribers] = useState<PeerId[]>([])

  useEffect(() => {
    const onSubscriptionChange = () => {
      const node = libp2p.getNode()
      if (!node) return

      // Get current subscribers and filter out self
      const allSubscribers = node.services.pubsub.getSubscribers(CHAT_TOPIC) as PeerId[]
      const filteredSubscribers = allSubscribers.filter(
        peer => peer.toString() !== node.peerId.toString()
      )
      setSubscribers(filteredSubscribers)
    }

    const node = libp2p.getNode()
    if (!node) return

    // Initial subscription check
    onSubscriptionChange()

    // Subscribe to changes
    node.services.pubsub.addEventListener('subscription-change', onSubscriptionChange)

    return () => {
      const node = libp2p.getNode()
      if (!node) return
      node.services.pubsub.removeEventListener('subscription-change', onSubscriptionChange)
    }
  }, [libp2p])

  const sortedPeers = useMemo(() => {
    return [...subscribers].sort((a, b) => {
      // Sort by unread messages first
      const aUnread = (directMessages[a.toString()] || []).some(msg => !msg.read)
      const bUnread = (directMessages[b.toString()] || []).some(msg => !msg.read)
      if (aUnread !== bUnread) return bUnread ? 1 : -1

      // Then by peer ID
      return a.toString().localeCompare(b.toString())
    })
  }, [subscribers, directMessages])

  const node = libp2p.getNode()
  if (!node) return null

  return (
    <div className="border-l border-gray-300 lg:col-span-1">
      <h2 className="px-4 py-3 text-lg font-medium text-gray-900 border-b border-gray-200">
        Chat Peers
      </h2>
      <div className="overflow-auto h-[32rem]">
        {/* Current peer */}
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <PeerWrapper 
            peer={node.peerId} 
            self 
            withName={true} 
            withUnread={false} 
            connected={true}
          />
        </div>

        {/* Other peers */}
        {sortedPeers.map(peer => {
          const isConnected = node.services.directMessage.isDmCapable(peer)
          const hasUnread = (directMessages[peer.toString()] || []).some(msg => !msg.read)
          
          return (
            <div 
              key={peer.toString()} 
              className={`px-4 py-3 border-b border-gray-200 ${hasUnread ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            >
              <PeerWrapper 
                peer={peer} 
                self={false} 
                withName={true} 
                withUnread={hasUnread}
                connected={isConnected}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

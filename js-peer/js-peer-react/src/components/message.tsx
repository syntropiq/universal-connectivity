import React from 'react'
import { useLibp2pContext } from '@/context/ctx'
import { PeerWrapper } from './peer'
import { peerIdFromString } from '@libp2p/peer-id'
import { useMarkAsRead } from '@/hooks/useMarkAsRead'
import type { ChatMessage } from '@/context/chat-ctx'

interface Props extends ChatMessage {
  dm: boolean
}

export const Message = ({ msgId, msg, fileObjectUrl, peerId, read, dm, receivedAt }: Props) => {
  const { libp2p } = useLibp2pContext()

  // Mark message as read if needed
  useMarkAsRead(msgId, peerId, read, dm)

  const node = libp2p.getNode()
  if (!node) return null

  const isSelf = node.peerId.toString() === peerId
  const timestamp = new Date(receivedAt).toLocaleString()
  const peerIdObj = peerIdFromString(peerId)

  return (
    <li className={`flex ${isSelf && 'flex-row-reverse'} gap-2`}>
      <PeerWrapper key={peerId} peer={peerIdObj} self={isSelf} withName={false} withUnread={false} />
      <div className="flex relative max-w-xl px-4 py-2 text-gray-700 rounded shadow bg-white">
        <div className="block">
          <div className="mb-2">{msg}</div>
          {fileObjectUrl && (
            <div className="mt-2 border-t pt-2">
              <a 
                href={fileObjectUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                Download File
              </a>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
            {!dm && !isSelf && (
              <span className="italic">from: {peerId.slice(-7)}</span>
            )}
            <span>{timestamp}</span>
          </div>
        </div>
      </div>
    </li>
  )
}

import { useLibp2pContext } from '@/context/ctx'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CHAT_FILE_TOPIC, CHAT_TOPIC } from '@universal-connectivity/js-peer-lib'
import { ChatFile, ChatMessage, useChatContext } from '../context/chat-ctx'
import { v4 as uuidv4 } from 'uuid'
import { Message } from './message'
import { forComponent } from '@/lib/logger'
import { ChatPeerList } from './chat-peer-list'
import { ChevronLeftIcon } from '@heroicons/react/20/solid'
import Blockies from 'react-18-blockies'
import { peerIdFromString } from '@libp2p/peer-id'

const log = forComponent('chat')

export const PUBLIC_CHAT_ROOM_ID = ''
const PUBLIC_CHAT_ROOM_NAME = 'Public Chat'

export default function ChatContainer() {
  const { libp2p } = useLibp2pContext()
  const { roomId, setRoomId } = useChatContext()
  const { messageHistory, setMessageHistory, directMessages, setDirectMessages, files, setFiles } = useChatContext()
  const [input, setInput] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])

  // Send message to public chat over gossipsub
  const sendPublicMessage = useCallback(async () => {
    if (input === '') return
    const node = libp2p.getNode()
    if (!node) return

    try {
      // Create message object
      const msg: ChatMessage = {
        msgId: crypto.randomUUID(),
        msg: input,
        fileObjectUrl: undefined,
        peerId: node.peerId.toString(),
        read: true,
        receivedAt: Date.now(),
      }

      // Publish message
      log(`Publishing to ${CHAT_TOPIC}`)
      const res = await node.services.pubsub.publish(CHAT_TOPIC, new TextEncoder().encode(input))
      log('Message sent to:', res.recipients.map(peerId => peerId.toString()).join(', '))

      // Update local state
      setMessageHistory(prev => [...prev, msg])
      setInput('')
    } catch (e) {
      log('Failed to send public message:', e)
    }
  }, [input, libp2p, setInput, setMessageHistory])

  // Send direct message over custom protocol
  const sendDirectMessage = useCallback(async () => {
    if (input === '') return
    const node = libp2p.getNode()
    if (!node) return

    try {
      // Create message object
      const msg: ChatMessage = {
        msgId: crypto.randomUUID(),
        msg: input,
        fileObjectUrl: undefined,
        peerId: node.peerId.toString(),
        read: true,
        receivedAt: Date.now(),
      }

      // Send message
      log(`Sending direct message to ${roomId}`)
      const success = await node.services.directMessage.send(peerIdFromString(roomId), input)
      if (!success) {
        throw new Error('Failed to send direct message')
      }

      // Update local state
      setDirectMessages(prev => {
        const peerMessages = prev[roomId] || []
        return {
          ...prev,
          [roomId]: [...peerMessages, msg],
        }
      })
      setInput('')
    } catch (e) {
      log('Failed to send direct message:', e)
    }
  }, [input, roomId, libp2p, setDirectMessages, setInput])

  const sendFile = useCallback(
    async (readerEvent: ProgressEvent<FileReader>) => {
      const node = libp2p.getNode()
      if (!node) return

      try {
        // Create file object
        const fileBody = readerEvent.target?.result as ArrayBuffer
        if (!fileBody) {
          throw new Error('No file data received')
        }

        const file: ChatFile = {
          id: uuidv4(),
          body: new Uint8Array(fileBody),
          sender: node.peerId.toString(),
        }

        // Store file locally
        setFiles(new Map(files.set(file.id, file)))

        // Create initial message
        const msg: ChatMessage = {
          msgId: crypto.randomUUID(),
          msg: `Sending file: ${file.id}...`,
          fileObjectUrl: undefined,
          peerId: node.peerId.toString(),
          read: true,
          receivedAt: Date.now(),
        }
        setMessageHistory(prev => [...prev, msg])

        // Publish file ID
        log(`Publishing file ${file.id} to ${CHAT_FILE_TOPIC}`)
        const res = await node.services.pubsub.publish(CHAT_FILE_TOPIC, new TextEncoder().encode(file.id))
        log('File sent to:', res.recipients.map(peerId => peerId.toString()).join(', '))

        // Create success message with file URL
        const successMsg: ChatMessage = {
          msgId: crypto.randomUUID(),
          msg: `File sent: ${file.id} (${file.body.length} bytes)`,
          fileObjectUrl: URL.createObjectURL(new Blob([file.body])),
          peerId: node.peerId.toString(),
          read: true,
          receivedAt: Date.now(),
        }
        setMessageHistory(prev => [...prev, successMsg])
      } catch (e) {
        log('Failed to send file:', e)
        // Create error message
        const errorMsg: ChatMessage = {
          msgId: crypto.randomUUID(),
          msg: `Failed to send file: ${e}`,
          fileObjectUrl: undefined,
          peerId: node.peerId.toString(),
          read: true,
          receivedAt: Date.now(),
        }
        setMessageHistory(prev => [...prev, errorMsg])
      }
    },
    [libp2p, files, setFiles, setMessageHistory],
  )

  const handleKeyUp = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') {
        return
      }
      if (roomId === PUBLIC_CHAT_ROOM_ID) {
        sendPublicMessage()
      } else {
        sendDirectMessage()
      }
    },
    [sendPublicMessage, sendDirectMessage, roomId],
  )

  const handleSend = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      if (roomId === PUBLIC_CHAT_ROOM_ID) {
        sendPublicMessage()
      } else {
        sendDirectMessage()
      }
    },
    [sendPublicMessage, sendDirectMessage, roomId],
  )

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInput(e.target.value)
    },
    [setInput],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const reader = new FileReader()
        reader.readAsArrayBuffer(e.target.files[0])
        reader.onload = (readerEvent) => {
          sendFile(readerEvent)
        }
      }
    },
    [sendFile],
  )

  const handleFileSend = useCallback(
    async (_e: React.MouseEvent<HTMLButtonElement>) => {
      fileRef?.current?.click()
    },
    [fileRef],
  )

  const handleBackToPublic = useCallback(() => {
    setRoomId(PUBLIC_CHAT_ROOM_ID)
  }, [setRoomId])

  useEffect(() => {
    // Filter messages based on room type
    if (roomId === PUBLIC_CHAT_ROOM_ID) {
      // Public chat shows all messages from messageHistory
      setMessages(messageHistory)
    } else {
      // Direct messages are filtered by peer ID
      const peerMessages = directMessages[roomId] || []
      setMessages(peerMessages)
    }
  }, [roomId, directMessages, messageHistory])

  return (
    <div className="container mx-auto">
      <div className="min-w-full border rounded lg:grid lg:grid-cols-6">
        <div className="lg:col-span-5 lg:block">
          <div className="w-full">
            <div className="relative flex items-center p-3 border-b border-gray-300">
              {roomId === PUBLIC_CHAT_ROOM_ID && (
                <span className="block ml-2 font-bold text-gray-600">{PUBLIC_CHAT_ROOM_NAME}</span>
              )}
              {roomId !== PUBLIC_CHAT_ROOM_ID && (
                <>
                  <Blockies seed={roomId} size={8} scale={3} className="rounded mr-2 max-h-10 max-w-10" />
                  <span className={`text-gray-500 flex`}>{roomId.toString().slice(-7)}</span>
                  <button onClick={handleBackToPublic} className="text-gray-500 flex ml-auto">
                    <ChevronLeftIcon className="w-6 h-6 text-gray-500" />
                    <span>Back to Public Chat</span>
                  </button>
                </>
              )}
            </div>
            <div className="relative w-full flex flex-col-reverse p-3 overflow-y-auto h-[40rem] bg-gray-100">
              <ul className="space-y-2">
                {messages.map(({ msgId, msg, fileObjectUrl, peerId, read, receivedAt }: ChatMessage) => (
                  <Message
                    key={msgId}
                    dm={roomId !== ''}
                    msg={msg}
                    fileObjectUrl={fileObjectUrl}
                    peerId={peerId}
                    read={read}
                    msgId={msgId}
                    receivedAt={receivedAt}
                  />
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between w-full p-3 border-t border-gray-300">
              <input
                ref={fileRef}
                className="hidden"
                type="file"
                onChange={handleFileInput}
                disabled={roomId !== PUBLIC_CHAT_ROOM_ID}
              />
              <button
                onClick={handleFileSend}
                disabled={roomId !== PUBLIC_CHAT_ROOM_ID}
                title={roomId === PUBLIC_CHAT_ROOM_ID ? 'Upload file' : "Unsupported in DM's"}
                className={roomId === PUBLIC_CHAT_ROOM_ID ? '' : 'cursor-not-allowed'}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5 text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                  />
                </svg>
              </button>

              <input
                value={input}
                onKeyUp={handleKeyUp}
                onChange={handleInput}
                type="text"
                placeholder="Message"
                className="block w-full py-2 pl-4 mx-3 bg-gray-100 rounded-full outline-none focus:text-gray-700"
                name="message"
                required
              />
              <button onClick={handleSend} type="submit">
                <svg
                  className="w-5 h-5 text-gray-500 origin-center transform rotate-90"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <ChatPeerList />
      </div>
    </div>
  )
}

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useLibp2pContext } from './ctx'
import type { Message, SignedMessage } from '@libp2p/interface'
import type { DirectMessageEvent } from '@universal-connectivity/js-peer-lib'
import {
  CHAT_FILE_TOPIC,
  CHAT_TOPIC,
  FILE_EXCHANGE_PROTOCOL,
  MIME_TEXT_PLAIN,
  PUBSUB_PEER_DISCOVERY,
} from '@universal-connectivity/js-peer-lib'
import { toString as uint8ArrayToString } from 'uint8arrays/to-string'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { pipe } from 'it-pipe'
import map from 'it-map'
import * as lp from 'it-length-prefixed'
import { forComponent } from '@/lib/logger'

const log = forComponent('chat-context')

// UI-specific message formatting, kept in React app
const formatChatFileMessage = (fileId: string, body: Uint8Array) => {
  return `File received: ${fileId} (${body.length} bytes)`
}

export interface ChatMessage {
  msgId: string
  msg: string
  fileObjectUrl: string | undefined
  peerId: string
  read: boolean
  receivedAt: number
}

export interface ChatFile {
  id: string
  body: Uint8Array
  sender: string
}

export interface DirectMessages {
  [peerId: string]: ChatMessage[]
}

type Chatroom = string

export interface ChatContextInterface {
  messageHistory: ChatMessage[]
  setMessageHistory: (messageHistory: ChatMessage[] | ((prevMessages: ChatMessage[]) => ChatMessage[])) => void
  directMessages: DirectMessages
  setDirectMessages: (directMessages: DirectMessages | ((prevMessages: DirectMessages) => DirectMessages)) => void
  roomId: Chatroom
  setRoomId: (chatRoom: Chatroom) => void
  files: Map<string, ChatFile>
  setFiles: (files: Map<string, ChatFile>) => void
}

export const chatContext = createContext<ChatContextInterface>({
  messageHistory: [],
  setMessageHistory: () => {},
  directMessages: {},
  setDirectMessages: () => {},
  roomId: '',
  setRoomId: () => {},
  files: new Map<string, ChatFile>(),
  setFiles: () => {},
})

export const useChatContext = () => {
  return useContext(chatContext)
}

export const ChatProvider = ({ children }: any) => {
  const [messageHistory, setMessageHistory] = useState<ChatMessage[]>([])
  const [directMessages, setDirectMessages] = useState<DirectMessages>({})
  const [files, setFiles] = useState<Map<string, ChatFile>>(new Map<string, ChatFile>())
  const [roomId, setRoomId] = useState<Chatroom>('')

  const { libp2p } = useLibp2pContext()

  const chatMessageCB = useCallback((evt: CustomEvent<Message>, topic: string, data: Uint8Array) => {
    const msg = new TextDecoder().decode(data)
    const node = libp2p.getNode()
    if (!node) return
    
    log(`${topic}: ${msg}`)
    
    // Only process signed messages
    if (evt.detail.type !== 'signed') return

    const signedMsg = evt.detail as SignedMessage
    const chatMsg: ChatMessage = {
      msgId: crypto.randomUUID(),
      msg,
      fileObjectUrl: undefined,
      peerId: signedMsg.from.toString(),
      read: false,
      receivedAt: Date.now(),
    }

    setMessageHistory((prev) => [...prev, chatMsg])
  }, [libp2p, setMessageHistory])

  const chatFileMessageCB = useCallback(async (evt: CustomEvent<Message>, topic: string, data: Uint8Array) => {
    const node = libp2p.getNode()
    if (!node) return
    
    // Only process signed messages
    if (evt.detail.type !== 'signed') return
    const signedMsg = evt.detail as SignedMessage

    const fileId = new TextDecoder().decode(data)
    const senderPeerId = signedMsg.from

    try {
      // Create file message before downloading
      const chatMsg: ChatMessage = {
        msgId: crypto.randomUUID(),
        msg: `Receiving file: ${fileId}...`,
        fileObjectUrl: undefined,
        peerId: senderPeerId.toString(),
        read: false,
        receivedAt: Date.now(),
      }
      setMessageHistory((prev) => [...prev, chatMsg])

      // Download file
      const stream = await node.dialProtocol(senderPeerId, FILE_EXCHANGE_PROTOCOL)
      await pipe(
        [uint8ArrayFromString(fileId)],
        (source) => lp.encode(source),
        stream,
        (source) => lp.decode(source),
        async function (source) {
          for await (const data of source) {
            const body: Uint8Array = data.subarray()
            log(`chat file message request_response: response received: size:${body.length}`)

            const msg: ChatMessage = {
              msgId: crypto.randomUUID(),
              msg: formatChatFileMessage(fileId, body),
              fileObjectUrl: window.URL.createObjectURL(new Blob([body])),
              peerId: senderPeerId.toString(),
              read: false,
              receivedAt: Date.now(),
            }
            setMessageHistory((prev) => [...prev, msg])
          }
        },
      )
    } catch (e) {
      console.error(e)
    }
  }, [libp2p, setMessageHistory])

  const messageCB = useCallback((evt: CustomEvent<Message>) => {
    const { topic, data } = evt.detail

    switch (topic) {
      case CHAT_TOPIC: {
        chatMessageCB(evt, topic, data)
        break
      }
      case CHAT_FILE_TOPIC: {
        chatFileMessageCB(evt, topic, data)
        break
      }
      case PUBSUB_PEER_DISCOVERY: {
        break
      }
      default: {
        console.error(`Unexpected event %o on gossipsub topic: ${topic}`, evt)
      }
    }
  }, [chatMessageCB, chatFileMessageCB])

  useEffect(() => {
    const node = libp2p.getNode()
    if (!node) return

    const handleDirectMessage = (evt: CustomEvent<DirectMessageEvent>) => {
      const { detail } = evt
      if (detail.message.type !== MIME_TEXT_PLAIN) return

      const msg: ChatMessage = {
        msgId: crypto.randomUUID(),
        msg: detail.message.data,
        fileObjectUrl: undefined,
        peerId: detail.from.toString(),
        read: false,
        receivedAt: Date.now(),
      }

      setDirectMessages((prev) => {
        const peerMessages = prev[detail.from.toString()] || []
        return {
          ...prev,
          [detail.from.toString()]: [...peerMessages, msg],
        }
      })
    }

    node.services.directMessage.addEventListener('message', handleDirectMessage)

    return () => {
      const node = libp2p.getNode()
      if (!node) return
      node.services.directMessage.removeEventListener('message', handleDirectMessage)
    }
  }, [libp2p])

  useEffect(() => {
    const node = libp2p.getNode()
    if (!node) return

    // Subscribe to chat topics
    node.services.pubsub.subscribe(CHAT_TOPIC)
    node.services.pubsub.subscribe(CHAT_FILE_TOPIC)

    // Set up message handlers
    node.services.pubsub.addEventListener('message', messageCB)

    // Set up file exchange handler
    node.handle(FILE_EXCHANGE_PROTOCOL, ({ stream }: { stream: any }) => {
      pipe(
        stream.source,
        (source) => lp.decode(source),
        (source) =>
          map(source, async (msg) => {
            const fileId = uint8ArrayToString(msg.subarray())
            const file = files.get(fileId)!
            return file.body
          }),
        (source) => lp.encode(source),
        stream.sink,
      )
    })

    // Set up direct message handler
    node.services.directMessage.addEventListener('message', (evt: CustomEvent<DirectMessageEvent>) => {
      const { from, message } = evt.detail
      if (message.type !== MIME_TEXT_PLAIN) return

      const msg: ChatMessage = {
        msgId: crypto.randomUUID(),
        msg: message.data,
        fileObjectUrl: undefined,
        peerId: from.toString(),
        read: false,
        receivedAt: Date.now(),
      }

      setDirectMessages((prev) => {
        const peerMessages = prev[from.toString()] || []
        return {
          ...prev,
          [from.toString()]: [...peerMessages, msg],
        }
      })
    })

    return () => {
      ;(async () => {
        const node = libp2p.getNode()
        if (!node) return
        // Cleanup handlers
        node.services.pubsub.removeEventListener('message', messageCB)
        await node.unhandle(FILE_EXCHANGE_PROTOCOL)
        node.services.pubsub.unsubscribe(CHAT_TOPIC)
        node.services.pubsub.unsubscribe(CHAT_FILE_TOPIC)
      })()
    }
  }, [files, libp2p, messageCB])

  return (
    <chatContext.Provider
      value={{
        roomId,
        setRoomId,
        messageHistory,
        setMessageHistory,
        directMessages,
        setDirectMessages,
        files,
        setFiles,
      }}
    >
      {children}
    </chatContext.Provider>
  )
}

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { P2PNode } from '@universal-connectivity/js-peer-lib';
import { ChatProvider } from './chat-ctx';
import { Booting } from '@/components/booting';

export type Libp2pType = P2PNode;

export const libp2pContext = createContext<{ libp2p: Libp2pType }>({
  // @ts-ignore to avoid having to check isn't undefined everywhere. Can't be undefined because children are conditionally rendered
  libp2p: undefined,
});

interface WrapperProps {
  children?: ReactNode;
}

// This is needed to prevent libp2p from instantiating more than once
let loaded = false;

export function AppWrapper({ children }: WrapperProps) {
  const [libp2p, setLibp2p] = useState<Libp2pType | undefined>(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    const init = async () => {
      if (loaded) return;
      try {
        loaded = true;
        const node = new P2PNode();
        await node.start();
        // @ts-ignore
        window.libp2p = node;
        setLibp2p(node as Libp2pType);
      } catch (e) {
        console.error('failed to start libp2p', e);
        setError(`failed to start libp2p ${e}`);
      }
    };
    init();
  }, []);

  if (!libp2p) {
    return <Booting error={error} />;
  }

  return (
    <libp2pContext.Provider value={{ libp2p }}>
      <ChatProvider>{children}</ChatProvider>
    </libp2pContext.Provider>
  );
}

export function useLibp2pContext() {
  return useContext(libp2pContext);
}

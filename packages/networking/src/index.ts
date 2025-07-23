export { P2PNetwork } from './p2p-network';
export { RPCServer } from './rpc-server';
export { MessageBroadcaster } from './message-broadcaster';
export * from './types';

// packages/networking/src/types.ts
import { Block, Transaction } from '@mcb/shared';

export interface NetworkMessage {
  type: 'block' | 'transaction' | 'consensus' | 'handshake';
  payload: any;
  timestamp: number;
  from: string;
}

export interface PeerInfo {
  id: string;
  multiaddr: string;
  lastSeen: number;
  isConnected: boolean;
  reputation: number;
}

export interface NetworkConfig {
  port: number;
  bindAddress?: string;
  bootstrapPeers?: string[];
  maxPeers?: number;
  enableDHT?: boolean;
}

export interface RPCRequest {
  jsonrpc: string;
  method: string;
  params: any[];
  id: string | number;
}

export interface RPCResponse {
  jsonrpc: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number;
}
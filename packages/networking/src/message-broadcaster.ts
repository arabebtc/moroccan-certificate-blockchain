import { EventEmitter } from 'eventemitter3';
import { P2PNetwork } from './p2p-network';
import { NetworkMessage } from './types';
import { logger } from '@mcb/shared';

export class MessageBroadcaster extends EventEmitter {
  private messageCache: Map<string, number> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute

  constructor(private network: P2PNetwork) {
    super();
    this.network.on('message', this.handleIncomingMessage.bind(this));
  }

  async broadcastBlock(block: any): Promise<void> {
    const message: NetworkMessage = {
      type: 'block',
      payload: block,
      timestamp: Date.now(),
      from: this.network.libp2p?.peerId?.toString() || 'unknown'
    };

    await this.network.broadcast(message);
    logger.info(`Broadcasted block ${block.number} to network`);
  }

  async broadcastTransaction(transaction: any): Promise<void> {
    const message: NetworkMessage = {
      type: 'transaction',
      payload: transaction,
      timestamp: Date.now(),
      from: this.network.libp2p?.peerId?.toString() || 'unknown'
    };

    await this.network.broadcast(message);
    logger.info(`Broadcasted transaction ${transaction.hash} to network`);
  }

  async broadcastConsensusMessage(consensusMsg: any): Promise<void> {
    const message: NetworkMessage = {
      type: 'consensus',
      payload: consensusMsg,
      timestamp: Date.now(),
      from: this.network.libp2p?.peerId?.toString() || 'unknown'
    };

    await this.network.broadcast(message);
  }

  private handleIncomingMessage(message: NetworkMessage): void {
    const messageId = this.getMessageId(message);
    
    // Check if we've seen this message recently (prevent loops)
    if (this.messageCache.has(messageId)) {
      return;
    }

    // Cache the message
    this.messageCache.set(messageId, Date.now());
    this.cleanupCache();

    // Emit to application layer
    this.emit(`message:${message.type}`, message.payload);
    this.emit('message', message);
  }

  private getMessageId(message: NetworkMessage): string {
    return `${message.type}:${message.from}:${message.timestamp}`;
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [messageId, timestamp] of this.messageCache.entries()) {
      if (now - timestamp > this.CACHE_TTL) {
        this.messageCache.delete(messageId);
      }
    }
  }
}
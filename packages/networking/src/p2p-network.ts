import { createLibp2p, Libp2pOptions } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@libp2p/noise';
import { mplex } from '@libp2p/mplex';
import { bootstrap } from '@libp2p/bootstrap';
import { kadDHT } from '@libp2p/kad-dht';
import { EventEmitter } from 'eventemitter3';
import { multiaddr } from 'multiaddr';
import { logger } from '@mcb/shared';
import { NetworkConfig, NetworkMessage, PeerInfo } from './types';

export class P2PNetwork extends EventEmitter {
  private libp2p: any;
  private peers: Map<string, PeerInfo> = new Map();
  private isStarted = false;

  constructor(private config: NetworkConfig) {
    super();
  }

  async start(): Promise<void> {
    if (this.isStarted) return;

    logger.info('Starting P2P network...');

    const libp2pConfig: Libp2pOptions = {
      addresses: {
        listen: [
          `/ip4/${this.config.bindAddress || '0.0.0.0'}/tcp/${this.config.port}`,
          `/ip4/${this.config.bindAddress || '0.0.0.0'}/tcp/${this.config.port + 1}/ws`
        ]
      },
      transports: [tcp(), webSockets()],
      connectionEncryption: [noise()],
      streamMuxers: [mplex()],
      peerDiscovery: this.config.bootstrapPeers?.length ? [
        bootstrap({
          list: this.config.bootstrapPeers.map(addr => multiaddr(addr))
        })
      ] : [],
      services: this.config.enableDHT ? {
        dht: kadDHT()
      } : {}
    };

    this.libp2p = await createLibp2p(libp2pConfig);

    // Set up event handlers
    this.libp2p.addEventListener('peer:connect', this.handlePeerConnect.bind(this));
    this.libp2p.addEventListener('peer:disconnect', this.handlePeerDisconnect.bind(this));

    // Handle custom protocol messages
    await this.libp2p.handle('/mcb/1.0.0', this.handleIncomingMessage.bind(this));

    await this.libp2p.start();
    this.isStarted = true;

    logger.info(`P2P network started on port ${this.config.port}`);
    logger.info(`Peer ID: ${this.libp2p.peerId.toString()}`);
    
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this.isStarted) return;

    await this.libp2p.stop();
    this.isStarted = false;
    this.peers.clear();
    
    logger.info('P2P network stopped');
    this.emit('stopped');
  }

  async broadcast(message: NetworkMessage): Promise<void> {
    if (!this.isStarted) {
      throw new Error('Network not started');
    }

    const messageBuffer = Buffer.from(JSON.stringify(message));
    const connections = this.libp2p.getConnections();

    for (const connection of connections) {
      try {
        const stream = await connection.newStream('/mcb/1.0.0');
        await stream.sink([messageBuffer]);
        await stream.close();
      } catch (error) {
        logger.error(`Failed to send message to peer ${connection.remotePeer}:`, error);
      }
    }
  }

  async sendToPeer(peerId: string, message: NetworkMessage): Promise<void> {
    if (!this.isStarted) {
      throw new Error('Network not started');
    }

    try {
      const connection = this.libp2p.getConnections().find(
        (conn: any) => conn.remotePeer.toString() === peerId
      );

      if (!connection) {
        throw new Error(`No connection to peer ${peerId}`);
      }

      const messageBuffer = Buffer.from(JSON.stringify(message));
      const stream = await connection.newStream('/mcb/1.0.0');
      await stream.sink([messageBuffer]);
      await stream.close();
    } catch (error) {
      logger.error(`Failed to send message to peer ${peerId}:`, error);
      throw error;
    }
  }

  getConnectedPeers(): PeerInfo[] {
    return Array.from(this.peers.values()).filter(peer => peer.isConnected);
  }

  getPeerCount(): number {
    return this.getConnectedPeers().length;
  }

  private handlePeerConnect(event: any): void {
    const peerId = event.detail.toString();
    const peerInfo: PeerInfo = {
      id: peerId,
      multiaddr: '', // Would be filled from connection info
      lastSeen: Date.now(),
      isConnected: true,
      reputation: 100 // Initial reputation
    };

    this.peers.set(peerId, peerInfo);
    logger.info(`Peer connected: ${peerId}`);
    this.emit('peer:connected', peerInfo);
  }

  private handlePeerDisconnect(event: any): void {
    const peerId = event.detail.toString();
    const peer = this.peers.get(peerId);
    
    if (peer) {
      peer.isConnected = false;
      peer.lastSeen = Date.now();
      logger.info(`Peer disconnected: ${peerId}`);
      this.emit('peer:disconnected', peer);
    }
  }

  private async handleIncomingMessage(data: any): Promise<void> {
    try {
      const chunks: Uint8Array[] = [];
      
      for await (const chunk of data.stream.source) {
        chunks.push(chunk.slice());
      }

      const messageBuffer = Buffer.concat(chunks);
      const message: NetworkMessage = JSON.parse(messageBuffer.toString());

      // Update peer reputation based on message validity
      this.updatePeerReputation(data.connection.remotePeer.toString(), true);

      logger.info(`Received ${message.type} message from ${message.from}`);
      this.emit('message', message);
    } catch (error) {
      logger.error('Failed to handle incoming message:', error);
      this.updatePeerReputation(data.connection.remotePeer.toString(), false);
    }
  }

  private updatePeerReputation(peerId: string, positive: boolean): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.reputation += positive ? 1 : -5;
      peer.reputation = Math.max(0, Math.min(100, peer.reputation));
      
      // Disconnect peers with very low reputation
      if (peer.reputation < 10) {
        this.disconnectPeer(peerId);
      }
    }
  }

  private async disconnectPeer(peerId: string): Promise<void> {
    try {
      const connections = this.libp2p.getConnections();
      const connection = connections.find((conn: any) => 
        conn.remotePeer.toString() === peerId
      );
      
      if (connection) {
        await connection.close();
        logger.info(`Disconnected peer with low reputation: ${peerId}`);
      }
    } catch (error) {
      logger.error(`Failed to disconnect peer ${peerId}:`, error);
    }
  }
}
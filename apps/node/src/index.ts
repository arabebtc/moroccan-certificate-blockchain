#!/usr/bin/env node
import { Command } from 'commander';
import { MCBNode } from './node';
import { logger } from '@mcb/shared';
import { GenesisBlockBuilder } from '@mcb/blockchain';

const program = new Command();

program
  .name('mcb-node')
  .description('MCB Blockchain Node')
  .version('0.1.0');

program
  .command('start')
  .description('Start the blockchain node')
  .option('-p, --port <port>', 'RPC server port', '8545')
  .option('--p2p-port <port>', 'P2P network port', '30303')
  .option('-d, --data-dir <path>', 'Data directory', './data')
  .option('--validator', 'Run as validator node')
  .option('--bootstrap <peers>', 'Bootstrap peers (comma-separated)')
  .action(async (options) => {
    try {
      const bootstrapPeers = options.bootstrap ? options.bootstrap.split(',') : [];
      
      const node = new MCBNode({
        rpcPort: parseInt(options.port),
        p2pPort: parseInt(options.p2pPort),
        dataDir: options.dataDir,
        isValidator: options.validator,
        bootstrapPeers,
      });

      await node.start();
      logger.info(`MCB node started`);
      logger.info(`RPC server: http://localhost:${options.port}`);
      logger.info(`P2P network: port ${options.p2pPort}`);

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        logger.info('Shutting down node...');
        await node.stop();
        process.exit(0);
      });

      // Keep process alive
      process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception:', error);
        process.exit(1);
      });

    } catch (error) {
      logger.error('Failed to start node:', error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize node configuration and genesis block')
  .option('-d, --data-dir <path>', 'Data directory', './data')
  .option('--chain-id <id>', 'Chain ID', '1337')
  .action(async (options) => {
    try {
      logger.info(`Initializing MCB node in ${options.dataDir}`);
      
      // Create genesis configuration
      const genesisConfig = GenesisBlockBuilder.createDefaultGenesis();
      genesisConfig.chainId = parseInt(options.chainId);
      
      // Create genesis block
      const genesisBlock = GenesisBlockBuilder.createGenesisBlock(genesisConfig);
      
      // Save genesis to file
      const fs = await import('fs/promises');
      await fs.mkdir(options.dataDir, { recursive: true });
      await fs.writeFile(
        `${options.dataDir}/genesis.json`, 
        JSON.stringify(genesisConfig, null, 2)
      );
      
      logger.info(`Genesis block created: ${genesisBlock.hash}`);
      logger.info(`Chain ID: ${genesisConfig.chainId}`);
      logger.info(`Genesis configuration saved to ${options.dataDir}/genesis.json`);
      
    } catch (error) {
      logger.error('Failed to initialize node:', error);
      process.exit(1);
    }
  });

program
  .command('account')
  .description('Account management')
  .option('--new', 'Create new account')
  .option('--list', 'List accounts')
  .action(async (options) => {
    if (options.new) {
      // Generate new account
      const { randomBytes } = await import('crypto');
      const { secp256k1 } = await import('ethereum-cryptography/secp256k1');
      const { keccak256 } = await import('ethereum-cryptography/keccak');
      const { bytesToHex } = await import('ethereum-cryptography/utils');
      
      const privateKey = randomBytes(32);
      const publicKey = secp256k1.getPublicKey(privateKey, false);
      const address = '0x' + bytesToHex(keccak256(publicKey.slice(1)).slice(-20));
      
      logger.info(`New account created:`);
      logger.info(`Address: ${address}`);
      logger.info(`Private Key: 0x${bytesToHex(privateKey)}`);
      logger.warn(`IMPORTANT: Save your private key securely!`);
      
    } else if (options.list) {
      logger.info('Account listing not implemented yet');
    } else {
      logger.error('Please specify --new or --list');
    }
  });

program.parse();

// Create apps/node/src/node.ts
import { EventEmitter } from 'eventemitter3';
import { P2PNetwork, RPCServer, MessageBroadcaster, RPCHandlers } from '@mcb/networking';
import { Blockchain, TransactionPool, BlockBuilder, GenesisBlockBuilder } from '@mcb/blockchain';
import { ChonkyBFTConsensus } from '@mcb/consensus';
import { logger } from '@mcb/shared';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface MCBNodeConfig {
  rpcPort: number;
  p2pPort: number;
  dataDir: string;
  isValidator: boolean;
  bootstrapPeers: string[];
}

export class MCBNode extends EventEmitter {
  private network: P2PNetwork;
  private rpcServer: RPCServer;
  private blockchain: Blockchain;
  private txPool: TransactionPool;
  private consensus: ChonkyBFTConsensus;
  private messageBroadcaster: MessageBroadcaster;
  private blockBuilder: BlockBuilder;
  private isRunning = false;

  constructor(private config: MCBNodeConfig) {
    super();

    // Initialize components
    this.network = new P2PNetwork({
      port: config.p2pPort,
      bootstrapPeers: config.bootstrapPeers,
      maxPeers: 50,
      enableDHT: true,
    });

    this.blockchain = new Blockchain({
      dataDir: path.join(config.dataDir, 'blockchain'),
    });

    this.txPool = new TransactionPool({
      maxSize: 4096,
      maxTxPerAccount: 64,
      priceLimit: BigInt(1),
    });

    this.consensus = new ChonkyBFTConsensus(
      'validator-' + Math.random().toString(36).substring(7),
      Buffer.from('0'.repeat(64), 'hex'), // Mock private key
      [] // Mock validators
    );

    this.messageBroadcaster = new MessageBroadcaster(this.network);
    
    this.blockBuilder = new BlockBuilder({
      gasLimit: BigInt(8000000),
      extraData: '0x4d4342',
      miner: '0x0000000000000000000000000000000000000000',
    });

    this.rpcServer = new RPCServer(config.rpcPort);

    this.setupEventHandlers();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    logger.info('Starting MCB node...');

    try {
      // Ensure data directory exists
      await fs.mkdir(this.config.dataDir, { recursive: true });

      // Load or create genesis
      await this.initializeGenesis();

      // Initialize blockchain
      await this.blockchain.initialize();

      // Setup RPC handlers
      const rpcHandlers = new RPCHandlers(this.blockchain, this.txPool, this.network);
      const handlers = rpcHandlers.getHandlers();
      for (const [method, handler] of handlers) {
        this.rpcServer.registerHandler(method, handler);
      }

      // Start components
      await this.rpcServer.start();
      await this.network.start();
      
      if (this.config.isValidator) {
        await this.consensus.start();
        this.startBlockProduction();
      }

      this.isRunning = true;
      logger.info('MCB node started successfully');
      this.emit('started');

    } catch (error) {
      logger.error('Failed to start node:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping MCB node...');

    try {
      await this.consensus.stop();
      await this.network.stop();
      await this.rpcServer.stop();

      this.isRunning = false;
      logger.info('MCB node stopped');
      this.emit('stopped');

    } catch (error) {
      logger.error('Error stopping node:', error);
      throw error;
    }
  }

  private async initializeGenesis(): Promise<void> {
    const genesisPath = path.join(this.config.dataDir, 'genesis.json');

    try {
      // Try to load existing genesis
      const genesisData = await fs.readFile(genesisPath, 'utf-8');
      const genesisConfig = JSON.parse(genesisData);
      const genesisBlock = GenesisBlockBuilder.createGenesisBlock(genesisConfig);
      this.blockchain = new Blockchain({
        dataDir: path.join(this.config.dataDir, 'blockchain'),
        genesisBlock,
      });
      logger.info(`Loaded genesis from ${genesisPath}`);
    } catch (error) {
      // Create default genesis
      const genesisConfig = GenesisBlockBuilder.createDefaultGenesis();
      const genesisBlock = GenesisBlockBuilder.createGenesisBlock(genesisConfig);
      
      await fs.writeFile(genesisPath, JSON.stringify(genesisConfig, null, 2));
      
      this.blockchain = new Blockchain({
        dataDir: path.join(this.config.dataDir, 'blockchain'),
        genesisBlock,
      });
      
      logger.info(`Created default genesis at ${genesisPath}`);
    }
  }

  private setupEventHandlers(): void {
    // Handle new transactions from network
    this.messageBroadcaster.on('message:transaction', async (tx) => {
      try {
        await this.txPool.addTransaction(tx);
        logger.info(`Added transaction ${tx.hash} from network`);
      } catch (error) {
        logger.warn(`Failed to add transaction from network: ${error.message}`);
      }
    });

    // Handle new blocks from network
    this.messageBroadcaster.on('message:block', async (block) => {
      try {
        await this.blockchain.addBlock(block);
        logger.info(`Added block ${block.number} from network`);
        
        // Remove included transactions from pool
        const txHashes = block.transactions.map((tx: any) => tx.hash);
        this.txPool.removeIncludedTransactions(txHashes);
      } catch (error) {
        logger.warn(`Failed to add block from network: ${error.message}`);
      }
    });

    // Handle consensus messages
    this.messageBroadcaster.on('message:consensus', (msg) => {
      // Forward to consensus engine
      logger.info(`Received consensus message: ${msg.type}`);
    });

    // Handle new blocks from consensus
    this.consensus.on('blockProposed', async (block) => {
      try {
        await this.blockchain.addBlock(block);
        await this.messageBroadcaster.broadcastBlock(block);
        logger.info(`Proposed and broadcasted block ${block.number}`);
      } catch (error) {
        logger.error(`Failed to handle proposed block: ${error.message}`);
      }
    });
  }

  private startBlockProduction(): void {
    // Simple block production every 3 seconds
    setInterval(async () => {
      try {
        const currentBlock = this.blockchain.getCurrentBlock();
        if (!currentBlock) return;

        const newBlock = await this.blockBuilder.buildBlock(currentBlock, this.txPool);
        await this.consensus.proposeBlock(newBlock);
        
      } catch (error) {
        logger.error('Block production error:', error);
      }
    }, 3000);
  }
}
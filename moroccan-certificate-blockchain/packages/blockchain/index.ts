export { Blockchain } from './blockchain';
export { TransactionPool } from './transaction-pool';
export { BlockBuilder } from './block-builder';
export { GenesisBlockBuilder } from './genesis';
export * from './types';

// packages/blockchain/src/blockchain.ts
import { Level } from 'level';
import { Block, Transaction, TransactionReceipt } from '@mcb/shared';
import { EventEmitter } from 'eventemitter3';
import { logger } from '@mcb/shared';
import { BlockValidator } from './block-validator';
import { StateManager } from './state-manager';

export interface BlockchainConfig {
  dataDir: string;
  genesisBlock?: Block;
}

export class Blockchain extends EventEmitter {
  private db: Level;
  private blocksByHash: Map<string, Block> = new Map();
  private blocksByNumber: Map<number, Block> = new Map();
  private receipts: Map<string, TransactionReceipt> = new Map();
  private currentBlock: Block | null = null;
  private validator: BlockValidator;
  private stateManager: StateManager;

  constructor(private config: BlockchainConfig) {
    super();
    this.db = new Level(config.dataDir + '/blockchain');
    this.validator = new BlockValidator(this);
    this.stateManager = new StateManager(config.dataDir + '/state');
  }

  async initialize(): Promise<void> {
    logger.info('Initializing blockchain...');
    
    try {
      // Try to load existing blockchain
      const headHash = await this.db.get('HEAD');
      const headBlock = await this.getBlock(headHash);
      this.currentBlock = headBlock;
      
      logger.info(`Loaded blockchain with head block #${headBlock.number}`);
    } catch (error) {
      // No existing blockchain, create genesis
      if (this.config.genesisBlock) {
        await this.initializeWithGenesis(this.config.genesisBlock);
      } else {
        throw new Error('No genesis block provided for new blockchain');
      }
    }

    await this.stateManager.initialize();
    this.emit('initialized');
  }

  async addBlock(block: Block): Promise<void> {
    // Validate block
    const isValid = await this.validator.validateBlock(block);
    if (!isValid) {
      throw new Error(`Invalid block ${block.hash}`);
    }

    // Check if block already exists
    if (this.blocksByHash.has(block.hash)) {
      logger.warn(`Block ${block.hash} already exists`);
      return;
    }

    // Store block
    await this.storeBlock(block);
    
    // Update current head if this block extends the chain
    if (this.shouldUpdateHead(block)) {
      await this.updateHead(block);
    }

    logger.info(`Added block #${block.number} (${block.hash})`);
    this.emit('blockAdded', block);
  }

  async getBlock(hash: string): Promise<Block> {
    // Check memory cache first
    if (this.blocksByHash.has(hash)) {
      return this.blocksByHash.get(hash)!;
    }

    // Try database
    try {
      const blockData = await this.db.get(`block:${hash}`);
      const block = JSON.parse(blockData) as Block;
      this.blocksByHash.set(hash, block);
      this.blocksByNumber.set(block.number, block);
      return block;
    } catch (error) {
      throw new Error(`Block not found: ${hash}`);
    }
  }

  async getBlockByNumber(number: number): Promise<Block> {
    // Check memory cache first
    if (this.blocksByNumber.has(number)) {
      return this.blocksByNumber.get(number)!;
    }

    // Get block hash from number index
    try {
      const blockHash = await this.db.get(`number:${number}`);
      return await this.getBlock(blockHash);
    } catch (error) {
      throw new Error(`Block not found at height ${number}`);
    }
  }

  async getTransaction(hash: string): Promise<Transaction | null> {
    try {
      const txData = await this.db.get(`tx:${hash}`);
      return JSON.parse(txData) as Transaction;
    } catch (error) {
      return null;
    }
  }

  async getTransactionReceipt(hash: string): Promise<TransactionReceipt | null> {
    if (this.receipts.has(hash)) {
      return this.receipts.get(hash)!;
    }

    try {
      const receiptData = await this.db.get(`receipt:${hash}`);
      const receipt = JSON.parse(receiptData) as TransactionReceipt;
      this.receipts.set(hash, receipt);
      return receipt;
    } catch (error) {
      return null;
    }
  }

  getCurrentBlock(): Block | null {
    return this.currentBlock;
  }

  getBlockHeight(): number {
    return this.currentBlock?.number || 0;
  }

  async getTotalDifficulty(): Promise<bigint> {
    try {
      const difficultyData = await this.db.get('totalDifficulty');
      return BigInt(difficultyData);
    } catch (error) {
      return BigInt(0);
    }
  }

  private async initializeWithGenesis(genesisBlock: Block): Promise<void> {
    logger.info('Creating genesis block...');
    
    await this.storeBlock(genesisBlock);
    await this.updateHead(genesisBlock);
    
    logger.info(`Genesis block created: ${genesisBlock.hash}`);
  }

  private async storeBlock(block: Block): Promise<void> {
    const batch = this.db.batch();

    // Store block data
    batch.put(`block:${block.hash}`, JSON.stringify(block));
    batch.put(`number:${block.number}`, block.hash);

    // Store transactions
    for (let i = 0; i < block.transactions.length; i++) {
      const tx = block.transactions[i];
      batch.put(`tx:${tx.hash}`, JSON.stringify(tx));
      batch.put(`txIndex:${tx.hash}`, JSON.stringify({
        blockHash: block.hash,
        blockNumber: block.number,
        transactionIndex: i
      }));
    }

    await batch.write();

    // Cache in memory
    this.blocksByHash.set(block.hash, block);
    this.blocksByNumber.set(block.number, block);
  }

  private shouldUpdateHead(block: Block): boolean {
    if (!this.currentBlock) return true;
    
    // Simple rule: highest block number wins
    // In real implementation, would consider total difficulty
    return block.number > this.currentBlock.number;
  }

  private async updateHead(block: Block): Promise<void> {
    this.currentBlock = block;
    
    // Update database
    await this.db.put('HEAD', block.hash);
    await this.db.put('totalDifficulty', (await this.getTotalDifficulty() + block.difficulty).toString());
    
    this.emit('headUpdated', block);
  }
}

import { Transaction } from '@mcb/shared';
import { EventEmitter } from 'eventemitter3';
import { logger } from '@mcb/shared';

export interface TransactionPoolConfig {
  maxSize: number;
  maxTxPerAccount: number;
  priceLimit: bigint;
  priceBump: number; // Percentage
}

export class TransactionPool extends EventEmitter {
  private pending: Map<string, Transaction[]> = new Map(); // by account
  private queued: Map<string, Transaction[]> = new Map(); // by account
  private all: Map<string, Transaction> = new Map(); // by hash
  private prices: Map<string, bigint> = new Map(); // by hash -> gas price
  private config: TransactionPoolConfig;

  constructor(config: Partial<TransactionPoolConfig> = {}) {
    super();
    this.config = {
      maxSize: config.maxSize || 4096,
      maxTxPerAccount: config.maxTxPerAccount || 64,
      priceLimit: config.priceLimit || BigInt(1),
      priceBump: config.priceBump || 10,
    };
  }

  async addTransaction(tx: Transaction): Promise<void> {
    // Basic validation
    if (this.all.has(tx.hash)) {
      throw new Error(`Transaction ${tx.hash} already in pool`);
    }

    // Check pool size limit
    if (this.all.size >= this.config.maxSize) {
      await this.evictCheapest();
    }

    // Check gas price minimum
    if (tx.gasPrice < this.config.priceLimit) {
      throw new Error(`Gas price too low: ${tx.gasPrice} < ${this.config.priceLimit}`);
    }

    // Check per-account limit
    const accountTxs = (this.pending.get(tx.from) || []).length + 
                      (this.queued.get(tx.from) || []).length;
    
    if (accountTxs >= this.config.maxTxPerAccount) {
      throw new Error(`Too many transactions for account ${tx.from}`);
    }

    // Add to pool
    this.all.set(tx.hash, tx);
    this.prices.set(tx.hash, tx.gasPrice);

    // Determine if it should go to pending or queued
    await this.scheduleTx(tx);

    logger.info(`Added transaction ${tx.hash} to pool (${this.all.size} total)`);
    this.emit('transactionAdded', tx);
  }

  removeTransaction(hash: string): void {
    const tx = this.all.get(hash);
    if (!tx) return;

    this.all.delete(hash);
    this.prices.delete(hash);

    // Remove from pending/queued
    this.removeFromAccount(tx.from, hash);

    logger.info(`Removed transaction ${hash} from pool`);
    this.emit('transactionRemoved', tx);
  }

  getPendingTransactions(limit?: number): Transaction[] {
    const transactions: Transaction[] = [];
    
    // Get all pending transactions sorted by gas price (descending)
    for (const accountTxs of this.pending.values()) {
      transactions.push(...accountTxs);
    }

    // Sort by gas price (highest first)
    transactions.sort((a, b) => {
      if (a.gasPrice > b.gasPrice) return -1;
      if (a.gasPrice < b.gasPrice) return 1;
      return 0;
    });

    return limit ? transactions.slice(0, limit) : transactions;
  }

  getTransactionsByAccount(account: string): Transaction[] {
    const pending = this.pending.get(account) || [];
    const queued = this.queued.get(account) || [];
    return [...pending, ...queued];
  }

  getTransaction(hash: string): Transaction | undefined {
    return this.all.get(hash);
  }

  getPoolStatus(): {
    pending: number;
    queued: number;
    total: number;
  } {
    let pending = 0;
    let queued = 0;

    for (const txs of this.pending.values()) {
      pending += txs.length;
    }

    for (const txs of this.queued.values()) {
      queued += txs.length;
    }

    return { pending, queued, total: this.all.size };
  }

  // Called when a new block is added to promote queued transactions
  async promoteTransactions(accountNonces: Map<string, number>): Promise<void> {
    for (const [account, expectedNonce] of accountNonces.entries()) {
      await this.promoteAccountTransactions(account, expectedNonce);
    }
  }

  // Called when a block is added to remove included transactions
  removeIncludedTransactions(includedTxs: string[]): void {
    for (const txHash of includedTxs) {
      this.removeTransaction(txHash);
    }
  }

  private async scheduleTx(tx: Transaction): Promise<void> {
    // For now, simple logic: all go to pending
    // In real implementation, would check account nonce
    if (!this.pending.has(tx.from)) {
      this.pending.set(tx.from, []);
    }

    const accountTxs = this.pending.get(tx.from)!;
    
    // Insert in nonce order
    let insertIndex = accountTxs.length;
    for (let i = 0; i < accountTxs.length; i++) {
      if (tx.nonce < accountTxs[i].nonce) {
        insertIndex = i;
        break;
      }
    }

    accountTxs.splice(insertIndex, 0, tx);
  }

  private removeFromAccount(account: string, txHash: string): void {
    // Remove from pending
    const pending = this.pending.get(account);
    if (pending) {
      const index = pending.findIndex(tx => tx.hash === txHash);
      if (index !== -1) {
        pending.splice(index, 1);
        if (pending.length === 0) {
          this.pending.delete(account);
        }
        return;
      }
    }

    // Remove from queued
    const queued = this.queued.get(account);
    if (queued) {
      const index = queued.findIndex(tx => tx.hash === txHash);
      if (index !== -1) {
        queued.splice(index, 1);
        if (queued.length === 0) {
          this.queued.delete(account);
        }
      }
    }
  }

  private async promoteAccountTransactions(account: string, expectedNonce: number): Promise<void> {
    const queued = this.queued.get(account);
    if (!queued || queued.length === 0) return;

    const promoted: Transaction[] = [];
    let currentNonce = expectedNonce;

    // Find consecutive transactions starting from expected nonce
    for (let i = 0; i < queued.length; i++) {
      if (queued[i].nonce === currentNonce) {
        promoted.push(queued[i]);
        currentNonce++;
      } else {
        break;
      }
    }

    if (promoted.length > 0) {
      // Remove from queued
      queued.splice(0, promoted.length);
      if (queued.length === 0) {
        this.queued.delete(account);
      }

      // Add to pending
      if (!this.pending.has(account)) {
        this.pending.set(account, []);
      }
      this.pending.get(account)!.push(...promoted);

      logger.info(`Promoted ${promoted.length} transactions for account ${account}`);
    }
  }

  private async evictCheapest(): Promise<void> {
    if (this.all.size === 0) return;

    // Find transaction with lowest gas price
    let cheapestHash = '';
    let cheapestPrice = BigInt(Number.MAX_SAFE_INTEGER);

    for (const [hash, price] of this.prices.entries()) {
      if (price < cheapestPrice) {
        cheapestPrice = price;
        cheapestHash = hash;
      }
    }

    if (cheapestHash) {
      this.removeTransaction(cheapestHash);
    }
  }
}
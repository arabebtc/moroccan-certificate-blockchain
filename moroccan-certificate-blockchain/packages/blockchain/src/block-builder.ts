import { Block, Transaction, logger } from '@mcb/shared';
import { TransactionPool } from './transaction-pool';
import { keccak256 } from 'ethereum-cryptography/keccak';
import { bytesToHex } from 'ethereum-cryptography/utils';

export interface BlockBuilderConfig {
  gasLimit: bigint;
  extraData: string;
  miner: string;
}

export class BlockBuilder {
  constructor(private config: BlockBuilderConfig) {}

  async buildBlock(
    parentBlock: Block,
    txPool: TransactionPool,
    timestamp?: number
  ): Promise<Block> {
    const blockTimestamp = timestamp || Math.floor(Date.now() / 1000);
    
    // Get transactions from pool
    const availableTxs = txPool.getPendingTransactions();
    const selectedTxs: Transaction[] = [];
    let gasUsed = BigInt(0);

    // Select transactions that fit in block
    for (const tx of availableTxs) {
      if (gasUsed + tx.gas <= this.config.gasLimit) {
        selectedTxs.push(tx);
        gasUsed += tx.gas;
      }
    }

    // Calculate merkle roots
    const transactionsRoot = this.calculateTransactionsRoot(selectedTxs);
    const receiptsRoot = this.calculateReceiptsRoot(selectedTxs); // Simplified
    
    // Build block
    const block: Block = {
      number: parentBlock.number + 1,
      hash: '', // Will be calculated
      parentHash: parentBlock.hash,
      timestamp: blockTimestamp,
      transactions: selectedTxs,
      stateRoot: parentBlock.stateRoot, // Would be updated after execution
      receiptsRoot,
      transactionsRoot,
      miner: this.config.miner,
      difficulty: this.calculateDifficulty(parentBlock),
      gasLimit: this.config.gasLimit,
      gasUsed,
      extraData: this.config.extraData,
      nonce: 0, // Would be set by consensus
      size: 0, // Would be calculated
    };

    // Calculate block hash
    block.hash = this.calculateBlockHash(block);
    block.size = this.calculateBlockSize(block);

    logger.info(`Built block #${block.number} with ${selectedTxs.length} transactions`);
    return block;
  }

  private calculateTransactionsRoot(transactions: Transaction[]): string {
    if (transactions.length === 0) {
      return '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421';
    }

    // Simplified: just hash all transaction hashes together
    const txHashes = transactions.map(tx => tx.hash).join('');
    const hash = keccak256(Buffer.from(txHashes, 'hex'));
    return '0x' + bytesToHex(hash);
  }

  private calculateReceiptsRoot(transactions: Transaction[]): string {
    // Simplified implementation
    if (transactions.length === 0) {
      return '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421';
    }
    
    const receiptsData = transactions.map(tx => tx.hash).join('');
    const hash = keccak256(Buffer.from(receiptsData, 'hex'));
    return '0x' + bytesToHex(hash);
  }

  private calculateDifficulty(parentBlock: Block): bigint {
    // Simplified difficulty adjustment
    // In real implementation, would consider block time and parent difficulty
    return parentBlock.difficulty;
  }

  private calculateBlockHash(block: Block): string {
    // Simplified block hash calculation
    const blockData = {
      number: block.number,
      parentHash: block.parentHash,
      timestamp: block.timestamp,
      transactionsRoot: block.transactionsRoot,
      stateRoot: block.stateRoot,
      receiptsRoot: block.receiptsRoot,
      miner: block.miner,
      difficulty: block.difficulty.toString(),
      gasLimit: block.gasLimit.toString(),
      gasUsed: block.gasUsed.toString(),
      extraData: block.extraData,
      nonce: block.nonce,
    };

    const blockString = JSON.stringify(blockData);
    const hash = keccak256(Buffer.from(blockString));
    return '0x' + bytesToHex(hash);
  }

  private calculateBlockSize(block: Block): number {
    // Simplified size calculation
    return JSON.stringify(block).length;
  }
}
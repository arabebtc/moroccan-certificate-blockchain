import { Block, Transaction } from '@mcb/shared';
import { Blockchain } from './blockchain';
import { logger } from '@mcb/shared';

export class BlockValidator {
  constructor(private blockchain: Blockchain) {}

  async validateBlock(block: Block): Promise<boolean> {
    try {
      // Basic structure validation
      if (!this.validateBlockStructure(block)) {
        logger.error(`Block ${block.hash} has invalid structure`);
        return false;
      }

      // Parent validation
      if (!(await this.validateParent(block))) {
        logger.error(`Block ${block.hash} has invalid parent`);
        return false;
      }

      // Transaction validation
      if (!this.validateTransactions(block.transactions)) {
        logger.error(`Block ${block.hash} has invalid transactions`);
        return false;
      }

      // Gas validation
      if (!this.validateGasUsage(block)) {
        logger.error(`Block ${block.hash} has invalid gas usage`);
        return false;
      }

      // Timestamp validation
      if (!this.validateTimestamp(block)) {
        logger.error(`Block ${block.hash} has invalid timestamp`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error(`Block validation error:`, error);
      return false;
    }
  }

  private validateBlockStructure(block: Block): boolean {
    return !!(
      block.hash &&
      block.parentHash &&
      typeof block.number === 'number' &&
      typeof block.timestamp === 'number' &&
      Array.isArray(block.transactions) &&
      block.stateRoot &&
      block.receiptsRoot &&
      block.transactionsRoot
    );
  }

  private async validateParent(block: Block): Promise<boolean> {
    if (block.number === 0) {
      // Genesis block
      return block.parentHash === '0x0000000000000000000000000000000000000000000000000000000000000000';
    }

    try {
      const parent = await this.blockchain.getBlock(block.parentHash);
      return parent.number === block.number - 1;
    } catch (error) {
      return false;
    }
  }

  private validateTransactions(transactions: Transaction[]): boolean {
    for (const tx of transactions) {
      if (!this.validateTransaction(tx)) {
        return false;
      }
    }
    return true;
  }

  private validateTransaction(tx: Transaction): boolean {
    return !!(
      tx.hash &&
      tx.from &&
      typeof tx.value === 'bigint' &&
      typeof tx.gas === 'bigint' &&
      typeof tx.gasPrice === 'bigint' &&
      typeof tx.nonce === 'number'
    );
  }

  private validateGasUsage(block: Block): boolean {
    let totalGas = BigInt(0);
    for (const tx of block.transactions) {
      totalGas += tx.gas;
    }

    return totalGas <= block.gasLimit && totalGas === block.gasUsed;
  }

  private validateTimestamp(block: Block): boolean {
    const now = Math.floor(Date.now() / 1000);
    const maxFutureTime = 15; // 15 seconds in future allowed

    return block.timestamp <= now + maxFutureTime;
  }
}

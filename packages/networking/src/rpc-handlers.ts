import { RPCHandler } from './rpc-server';
import { Blockchain } from '@mcb/blockchain';
import { TransactionPool } from '@mcb/blockchain';
import { P2PNetwork } from './p2p-network';
import { logger } from '@mcb/shared';

export class RPCHandlers {
  constructor(
    private blockchain: Blockchain,
    private txPool: TransactionPool,
    private network: P2PNetwork
  ) {}

  getHandlers(): Map<string, RPCHandler> {
    const handlers = new Map<string, RPCHandler>();

    // Blockchain methods
    handlers.set('eth_blockNumber', this.getBlockNumber.bind(this));
    handlers.set('eth_getBlockByNumber', this.getBlockByNumber.bind(this));
    handlers.set('eth_getBlockByHash', this.getBlockByHash.bind(this));
    handlers.set('eth_getTransactionByHash', this.getTransactionByHash.bind(this));
    handlers.set('eth_getTransactionReceipt', this.getTransactionReceipt.bind(this));
    handlers.set('eth_getBalance', this.getBalance.bind(this));
    handlers.set('eth_getTransactionCount', this.getTransactionCount.bind(this));

    // Transaction pool methods
    handlers.set('eth_sendRawTransaction', this.sendRawTransaction.bind(this));
    handlers.set('eth_sendTransaction', this.sendTransaction.bind(this));
    handlers.set('eth_pendingTransactions', this.getPendingTransactions.bind(this));

    // Network methods
    handlers.set('net_version', this.getNetworkVersion.bind(this));
    handlers.set('net_peerCount', this.getPeerCount.bind(this));
    handlers.set('net_listening', this.isNetworkListening.bind(this));

    // Gas methods
    handlers.set('eth_gasPrice', this.getGasPrice.bind(this));
    handlers.set('eth_estimateGas', this.estimateGas.bind(this));

    // Chain info
    handlers.set('eth_chainId', this.getChainId.bind(this));
    handlers.set('web3_clientVersion', this.getClientVersion.bind(this));

    // MCB specific methods
    handlers.set('mcb_getPoolStatus', this.getPoolStatus.bind(this));
    handlers.set('mcb_getNetworkInfo', this.getNetworkInfo.bind(this));
    handlers.set('mcb_getConsensusInfo', this.getConsensusInfo.bind(this));

    return handlers;
  }

  // Blockchain methods
  private async getBlockNumber(): Promise<string> {
    const blockHeight = this.blockchain.getBlockHeight();
    return '0x' + blockHeight.toString(16);
  }

  private async getBlockByNumber(params: any[]): Promise<any> {
    const [blockNumber, includeTransactions] = params;
    
    let blockNum: number;
    if (blockNumber === 'latest') {
      blockNum = this.blockchain.getBlockHeight();
    } else if (blockNumber === 'earliest') {
      blockNum = 0;
    } else if (blockNumber === 'pending') {
      blockNum = this.blockchain.getBlockHeight();
    } else {
      blockNum = parseInt(blockNumber, 16);
    }

    try {
      const block = await this.blockchain.getBlockByNumber(blockNum);
      return this.formatBlock(block, includeTransactions);
    } catch (error) {
      return null;
    }
  }

  private async getBlockByHash(params: any[]): Promise<any> {
    const [blockHash, includeTransactions] = params;
    
    try {
      const block = await this.blockchain.getBlock(blockHash);
      return this.formatBlock(block, includeTransactions);
    } catch (error) {
      return null;
    }
  }

  private async getTransactionByHash(params: any[]): Promise<any> {
    const [txHash] = params;
    
    // Check pool first
    const poolTx = this.txPool.getTransaction(txHash);
    if (poolTx) {
      return this.formatTransaction(poolTx, null, null, null);
    }

    // Check blockchain
    const tx = await this.blockchain.getTransaction(txHash);
    if (tx) {
      // Get block info for transaction
      const receipt = await this.blockchain.getTransactionReceipt(txHash);
      if (receipt) {
        return this.formatTransaction(tx, receipt.blockHash, receipt.blockNumber, receipt.transactionIndex);
      }
    }

    return null;
  }

  private async getTransactionReceipt(params: any[]): Promise<any> {
    const [txHash] = params;
    const receipt = await this.blockchain.getTransactionReceipt(txHash);
    return receipt ? this.formatReceipt(receipt) : null;
  }

  private async getBalance(params: any[]): Promise<string> {
    const [address, blockNumber] = params;
    // Simplified: return 0 for now
    // In real implementation, would query state
    return '0x0';
  }

  private async getTransactionCount(params: any[]): Promise<string> {
    const [address, blockNumber] = params;
    // Simplified: return 0 for now
    // In real implementation, would query state for nonce
    return '0x0';
  }

  // Transaction methods
  private async sendRawTransaction(params: any[]): Promise<string> {
    const [rawTx] = params;
    
    try {
      // Parse raw transaction
      const tx = this.parseRawTransaction(rawTx);
      
      // Add to transaction pool
      await this.txPool.addTransaction(tx);
      
      logger.info(`Received transaction ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      throw new Error(`Failed to add transaction: ${error.message}`);
    }
  }

  private async sendTransaction(params: any[]): Promise<string> {
    const [txObject] = params;
    
    // This would require account management and signing
    // For now, just return an error
    throw new Error('eth_sendTransaction not implemented - use eth_sendRawTransaction');
  }

  private async getPendingTransactions(): Promise<any[]> {
    const transactions = this.txPool.getPendingTransactions(100);
    return transactions.map(tx => this.formatTransaction(tx, null, null, null));
  }

  // Network methods
  private async getNetworkVersion(): Promise<string> {
    return '1337'; // MCB chain ID
  }

  private async getPeerCount(): Promise<string> {
    const peerCount = this.network.getPeerCount();
    return '0x' + peerCount.toString(16);
  }

  private async isNetworkListening(): Promise<boolean> {
    return true; // Simplified
  }

  // Gas methods
  private async getGasPrice(): Promise<string> {
    // Simplified: return fixed gas price
    return '0x3b9aca00'; // 1 gwei
  }

  private async estimateGas(params: any[]): Promise<string> {
    const [txObject] = params;
    // Simplified: return fixed estimate
    return '0x5208'; // 21000 gas
  }

  // Chain info
  private async getChainId(): Promise<string> {
    return '0x539'; // 1337 in hex
  }

  private async getClientVersion(): Promise<string> {
    return 'MCB/v0.1.0/typescript';
  }

  // MCB specific methods
  private async getPoolStatus(): Promise<any> {
    return this.txPool.getPoolStatus();
  }

  private async getNetworkInfo(): Promise<any> {
    return {
      peerId: this.network.libp2p?.peerId?.toString() || 'unknown',
      peers: this.network.getConnectedPeers().map(peer => ({
        id: peer.id,
        reputation: peer.reputation,
        lastSeen: peer.lastSeen
      })),
      listening: true
    };
  }

  private async getConsensusInfo(): Promise<any> {
    return {
      consensusType: 'ChonkyBFT',
      blockTime: 1000, // 1 second
      validators: [], // Would be populated by consensus
      currentView: 0
    };
  }

  // Helper methods
  private formatBlock(block: any, includeTransactions: boolean): any {
    return {
      number: '0x' + block.number.toString(16),
      hash: block.hash,
      parentHash: block.parentHash,
      nonce: '0x' + block.nonce.toString(16),
      sha3Uncles: '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347',
      logsBloom: '0x' + '0'.repeat(512),
      transactionsRoot: block.transactionsRoot,
      stateRoot: block.stateRoot,
      receiptsRoot: block.receiptsRoot,
      miner: block.miner,
      difficulty: '0x' + block.difficulty.toString(16),
      totalDifficulty: '0x' + block.difficulty.toString(16),
      extraData: block.extraData,
      size: '0x' + block.size.toString(16),
      gasLimit: '0x' + block.gasLimit.toString(16),
      gasUsed: '0x' + block.gasUsed.toString(16),
      timestamp: '0x' + block.timestamp.toString(16),
      transactions: includeTransactions 
        ? block.transactions.map((tx: any, index: number) => 
            this.formatTransaction(tx, block.hash, block.number, index))
        : block.transactions.map((tx: any) => tx.hash),
      uncles: []
    };
  }

  private formatTransaction(tx: any, blockHash: string | null, blockNumber: number | null, transactionIndex: number | null): any {
    return {
      hash: tx.hash,
      nonce: '0x' + tx.nonce.toString(16),
      blockHash,
      blockNumber: blockNumber !== null ? '0x' + blockNumber.toString(16) : null,
      transactionIndex: transactionIndex !== null ? '0x' + transactionIndex.toString(16) : null,
      from: tx.from,
      to: tx.to,
      value: '0x' + tx.value.toString(16),
      gasPrice: '0x' + tx.gasPrice.toString(16),
      gas: '0x' + tx.gas.toString(16),
      input: tx.data,
      v: '0x' + tx.v.toString(16),
      r: tx.r,
      s: tx.s,
      type: '0x' + tx.type.toString(16),
      chainId: tx.chainId ? '0x' + tx.chainId.toString(16) : null
    };
  }

  private formatReceipt(receipt: any): any {
    return {
      transactionHash: receipt.transactionHash,
      transactionIndex: '0x' + receipt.transactionIndex.toString(16),
      blockHash: receipt.blockHash,
      blockNumber: '0x' + receipt.blockNumber.toString(16),
      from: receipt.from,
      to: receipt.to,
      cumulativeGasUsed: '0x' + receipt.cumulativeGasUsed.toString(16),
      gasUsed: '0x' + receipt.gasUsed.toString(16),
      contractAddress: receipt.contractAddress,
      logs: receipt.logs || [],
      logsBloom: '0x' + '0'.repeat(512),
      status: '0x' + receipt.status.toString(16),
      effectiveGasPrice: '0x' + receipt.effectiveGasPrice.toString(16),
      type: '0x' + receipt.type.toString(16)
    };
  }

  private parseRawTransaction(rawTx: string): any {
    // Simplified raw transaction parsing
    // In real implementation, would use RLP decoding
    
    // For now, create a mock transaction
    const hash = '0x' + Math.random().toString(16).substring(2).padStart(64, '0');
    
    return {
      hash,
      from: '0x7df9a875a174b3bc565e6424a0050ebc1b2d1d82',
      to: '0xf17f52151EbEF6C7334FAD080c5704D77216b732',
      value: BigInt(1000000000000000000), // 1 ETH
      gas: BigInt(21000),
      gasPrice: BigInt(1000000000), // 1 gwei
      data: '0x',
      nonce: 0,
      type: 0,
      v: 27,
      r: '0x' + '1'.repeat(64),
      s: '0x' + '2'.repeat(64),
      chainId: 1337
    };
  }
}
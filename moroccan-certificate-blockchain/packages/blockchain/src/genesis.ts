import { Block, GenesisConfig } from '@mcb/shared';
import { keccak256 } from 'ethereum-cryptography/keccak';
import { bytesToHex } from 'ethereum-cryptography/utils';

export class GenesisBlockBuilder {
  static createGenesisBlock(config: GenesisConfig): Block {
    const genesisBlock: Block = {
      number: 0,
      hash: '',
      parentHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      timestamp: parseInt(config.timestamp),
      transactions: [],
      stateRoot: this.calculateInitialStateRoot(config),
      receiptsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
      transactionsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
      miner: '0x0000000000000000000000000000000000000000',
      difficulty: BigInt(config.difficulty),
      gasLimit: BigInt(config.gasLimit),
      gasUsed: BigInt(0),
      extraData: config.extraData,
      nonce: 0,
      size: 0,
    };

    // Calculate genesis hash
    genesisBlock.hash = this.calculateGenesisHash(genesisBlock, config);
    genesisBlock.size = JSON.stringify(genesisBlock).length;

    return genesisBlock;
  }

  private static calculateInitialStateRoot(config: GenesisConfig): string {
    // Calculate state root from genesis allocations
    const allocData = JSON.stringify(config.alloc);
    const hash = keccak256(Buffer.from(allocData));
    return '0x' + bytesToHex(hash);
  }

  private static calculateGenesisHash(block: Block, config: GenesisConfig): string {
    const genesisData = {
      ...block,
      chainId: config.chainId,
      alloc: config.alloc,
    };
    delete (genesisData as any).hash;
    delete (genesisData as any).size;

    const genesisString = JSON.stringify(genesisData);
    const hash = keccak256(Buffer.from(genesisString));
    return '0x' + bytesToHex(hash);
  }

  static createDefaultGenesis(): GenesisConfig {
    return {
      chainId: 1337,
      homesteadBlock: 0,
      eip150Block: 0,
      eip155Block: 0,
      eip158Block: 0,
      byzantiumBlock: 0,
      constantinopleBlock: 0,
      petersburgBlock: 0,
      istanbulBlock: 0,
      berlinBlock: 0,
      londonBlock: 0,
      shanghaiBlock: 0,
      alloc: {
        '0x7df9a875a174b3bc565e6424a0050ebc1b2d1d82': {
          balance: '0x200000000000000000000',
        },
        '0xf17f52151EbEF6C7334FAD080c5704D77216b732': {
          balance: '0x200000000000000000000',
        },
      },
      difficulty: '0x400000000',
      gasLimit: '0x8000000',
      timestamp: '0x00',
      extraData: '0x4d4342202d204d6f726f6363616e2043657274696669636174652042', // "MCB - Moroccan Certificate B"
    };
  }
}

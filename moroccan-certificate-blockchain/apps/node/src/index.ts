// Update apps/node/src/index.ts
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
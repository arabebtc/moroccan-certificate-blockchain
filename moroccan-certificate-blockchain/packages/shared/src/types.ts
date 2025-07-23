export interface Block {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
  transactions: Transaction[];
  stateRoot: string;
  receiptsRoot: string;
  transactionsRoot: string;
  miner: string;
  difficulty: bigint;
  gasLimit: bigint;
  gasUsed: bigint;
  extraData: string;
  nonce: number;
  size: number;
}

export interface Transaction {
  hash: string;
  from: string;
  to: string | null;
  value: bigint;
  gas: bigint;
  gasPrice: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  data: string;
  nonce: number;
  type: number; // 0 = legacy, 1 = EIP-2930, 2 = EIP-1559
  accessList?: AccessListItem[];
  v: number;
  r: string;
  s: string;
  chainId?: number;
}

export interface AccessListItem {
  address: string;
  storageKeys: string[];
}

export interface TransactionReceipt {
  transactionHash: string;
  transactionIndex: number;
  blockHash: string;
  blockNumber: number;
  from: string;
  to: string | null;
  gasUsed: bigint;
  cumulativeGasUsed: bigint;
  contractAddress: string | null;
  logs: Log[];
  status: number; // 1 = success, 0 = failure
  effectiveGasPrice: bigint;
  type: number;
}

export interface Log {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  transactionIndex: number;
  blockHash: string;
  logIndex: number;
  removed: boolean;
}

export interface GenesisConfig {
  chainId: number;
  homesteadBlock: number;
  eip150Block: number;
  eip155Block: number;
  eip158Block: number;
  byzantiumBlock: number;
  constantinopleBlock: number;
  petersburgBlock: number;
  istanbulBlock: number;
  berlinBlock: number;
  londonBlock: number;
  shanghaiBlock: number;
  alloc: { [address: string]: GenesisAccount };
  difficulty: string;
  gasLimit: string;
  timestamp: string;
  extraData: string;
}

export interface GenesisAccount {
  balance: string;
  code?: string;
  storage?: { [key: string]: string };
  nonce?: string;
}
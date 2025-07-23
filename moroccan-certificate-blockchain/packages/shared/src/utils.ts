// Utility functions
export const logger = {
  info: (msg: string, ...args: any[]) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(`[WARN] ${msg}`, ...args),
};

export const constants = {
  CHAIN_ID: 1337,
  BLOCK_TIME: 1000, // 1 second
  MAX_BLOCK_SIZE: 1000000,
};

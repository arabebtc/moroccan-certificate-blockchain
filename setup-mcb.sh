#!/bin/bash
set -e

echo "🚀 Setting up complete MCB project..."

# Create main directory
PROJECT_NAME="moroccan-certificate-blockchain"
mkdir -p $PROJECT_NAME
cd $PROJECT_NAME

# Initialize git
git init -b main

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p .github/workflows
mkdir -p .github/ISSUE_TEMPLATE
mkdir -p packages/{shared,consensus,networking,executor,contracts,sdk,cli}/src
mkdir -p apps/{node,explorer,certificate-portal}/src
mkdir -p tools/{scripts,config}
mkdir -p docs

# Create root package.json
echo "📦 Creating root package.json..."
cat > package.json << 'EOF'
{
  "name": "moroccan-certificate-blockchain",
  "version": "0.1.0",
  "description": "A scalable, low-cost ZK-Rollup blockchain for educational certificate verification",
  "private": true,
  "author": "MCB Team",
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  },
  "packageManager": "pnpm@8.15.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "lint:fix": "turbo run lint:fix",
    "format": "prettier --write \"**/*.{js,ts,tsx,md,json}\"",
    "type-check": "turbo run type-check",
    "clean": "turbo run clean && rm -rf node_modules"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.1",
    "@types/jest": "^29.5.8",
    "@types/node": "^20.10.0",
    "@typescript-eslint/eslint-plugin": "^6.13.1",
    "@typescript-eslint/parser": "^6.13.1",
    "eslint": "^8.54.0",
    "eslint-config-prettier": "^9.0.0",
    "jest": "^29.7.0",
    "prettier": "^3.1.0",
    "ts-jest": "^29.1.1",
    "turbo": "^1.11.0",
    "typescript": "^5.3.2"
  }
}
EOF

# Create pnpm workspace
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - "packages/*"
  - "apps/*"
  - "tools/*"
EOF

# Create turbo config
cat > turbo.json << 'EOF'
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    }
  }
}
EOF

# Create shared package
echo "🔧 Creating shared package..."
cat > packages/shared/package.json << 'EOF'
{
  "name": "@mcb/shared",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "jest",
    "lint": "eslint src --ext .ts",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "ethers": "^6.8.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "typescript": "^5.3.2"
  }
}
EOF

cat > packages/shared/src/index.ts << 'EOF'
// Shared types and utilities
export * from './types';
export * from './utils';
EOF

cat > packages/shared/src/types.ts << 'EOF'
// Common blockchain types
export interface Block {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
  transactions: Transaction[];
}

export interface Transaction {
  hash: string;
  from: string;
  to: string | null;
  value: bigint;
  data: string;
}

// Certificate types
export interface Certificate {
  id: string;
  hash: string;
  issuer: string;
  recipient: string;
  issuedAt: number;
}
EOF

cat > packages/shared/src/utils.ts << 'EOF'
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
EOF

# Create consensus package
echo "⚡ Creating consensus package..."
cat > packages/consensus/package.json << 'EOF'
{
  "name": "@mcb/consensus",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "jest",
    "lint": "eslint src --ext .ts",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@mcb/shared": "workspace:*",
    "eventemitter3": "^5.0.1"
  },
  "devDependencies": {
    "typescript": "^5.3.2"
  }
}
EOF

cat > packages/consensus/src/index.ts << 'EOF'
export { ChonkyBFTConsensus } from './consensus';
export * from './types';
EOF

cat > packages/consensus/src/consensus.ts << 'EOF'
import { EventEmitter } from 'eventemitter3';
import { Block } from '@mcb/shared';

export class ChonkyBFTConsensus extends EventEmitter {
  private currentView: number = 0;
  
  constructor(private validatorAddress: string) {
    super();
  }

  async start(): Promise<void> {
    console.log('Starting ChonkyBFT consensus...');
    this.emit('started');
  }

  async proposeBlock(block: Block): Promise<void> {
    console.log(`Proposing block ${block.number}`);
    this.emit('blockProposed', block);
  }
}
EOF

cat > packages/consensus/src/types.ts << 'EOF'
export interface ConsensusMessage {
  type: 'prepare' | 'commit' | 'view-change';
  view: number;
  sender: string;
}
EOF

# Create node app
echo "🖥️ Creating node application..."
cat > apps/node/package.json << 'EOF'
{
  "name": "@mcb/node",
  "version": "0.1.0",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js",
    "test": "jest",
    "lint": "eslint src --ext .ts",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@mcb/shared": "workspace:*",
    "@mcb/consensus": "workspace:*",
    "commander": "^11.1.0"
  },
  "devDependencies": {
    "tsx": "^4.6.0",
    "typescript": "^5.3.2"
  }
}
EOF

cat > apps/node/src/index.ts << 'EOF'
#!/usr/bin/env node
import { Command } from 'commander';
import { ChonkyBFTConsensus } from '@mcb/consensus';
import { logger } from '@mcb/shared';

const program = new Command();

program
  .name('mcb-node')
  .description('MCB Blockchain Node')
  .version('0.1.0');

program
  .command('start')
  .description('Start the node')
  .action(async () => {
    logger.info('Starting MCB node...');
    const consensus = new ChonkyBFTConsensus('validator-1');
    await consensus.start();
    logger.info('Node started successfully!');
  });

program.parse();
EOF

# Create TypeScript configs for packages
for pkg in shared consensus; do
  cat > packages/$pkg/tsconfig.json << 'EOF'
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
EOF
done

# Create TypeScript config for node app
cat > apps/node/tsconfig.json << 'EOF'
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
EOF

# Create root TypeScript config
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@mcb/shared/*": ["./packages/shared/src/*"],
      "@mcb/consensus/*": ["./packages/consensus/src/*"]
    }
  },
  "references": [
    { "path": "./packages/shared" },
    { "path": "./packages/consensus" },
    { "path": "./apps/node" }
  ]
}
EOF

# Create ESLint config
cat > .eslintrc.js << 'EOF'
module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'prettier'
  ],
  plugins: ['@typescript-eslint'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.json', './packages/*/tsconfig.json', './apps/*/tsconfig.json']
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
  }
};
EOF

# Create Prettier config
cat > .prettierrc << 'EOF'
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
EOF

# Create .gitignore
cat > .gitignore << 'EOF'
node_modules/
dist/
.env
.env.local
*.log
coverage/
.DS_Store
EOF

# Create GitHub workflow
cat > .github/workflows/ci.yml << 'EOF'
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm type-check  
      - run: pnpm test
      - run: pnpm build
EOF

# Create README
cat > README.md << 'EOF'
# Moroccan Certificate Blockchain (MCB)

A scalable, low-cost ZK-Rollup blockchain for educational certificate verification.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development
pnpm dev

# Run tests
pnpm test

# Build all packages
pnpm build
```

## Packages

- `@mcb/shared` - Common types and utilities
- `@mcb/consensus` - ChonkyBFT consensus implementation
- `@mcb/node` - Blockchain node application

## Development

```bash
# Start the node
pnpm --filter @mcb/node dev

# Run specific package tests
pnpm --filter @mcb/consensus test
```
EOF

echo "✅ MCB project structure created!"
echo "📁 Project location: $(pwd)"
echo ""
echo "🚀 Next steps:"
echo "1. cd $PROJECT_NAME"
echo "2. pnpm install"
echo "3. pnpm dev"
echo ""
echo "🎯 You now have:"
echo "   - Complete monorepo structure"
echo "   - Working shared package with types"
echo "   - Basic consensus package"
echo "   - Node application that can start"
echo "   - CI/CD pipeline ready"
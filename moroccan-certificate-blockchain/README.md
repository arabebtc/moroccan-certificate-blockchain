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

#!/bin/bash
set -e

echo "🚀 Setting up MCB development environment..."

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"

if ! node -e "process.exit(require('semver').gte('$NODE_VERSION', '$REQUIRED_VERSION') ? 0 : 1)" 2>/dev/null; then
    echo "❌ Node.js version $NODE_VERSION is not supported. Please upgrade to Node.js 18+ first."
    exit 1
fi

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm@8
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Setup git hooks (optional)
if [ -d ".git" ]; then
    echo "🔧 Setting up git hooks..."
    cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
pnpm lint:fix
pnpm format
EOF
    chmod +x .git/hooks/pre-commit
fi

echo "✅ Setup complete! You can now run:"
echo "  pnpm dev     # Start development"
echo "  pnpm test    # Run tests"
echo "  pnpm build   # Build all packages"
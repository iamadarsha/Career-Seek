#!/bin/bash
set -e

echo "Starting JobHunt India macOS Installation..."

# 1. Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js 20+ LTS first."
    exit 1
fi

NODE_VERSION=$(node -v)
echo "Found Node.js $NODE_VERSION"

# 2. Install dependencies
echo "Installing application dependencies..."
npm install

# 3. Bootstrap application (Database, config folders)
echo "Bootstrapping local environment..."
npm run db:init
npm run db:generate
npm run db:push

# 4. Success message
echo ""
echo "Installation complete!"
echo "To start the application, run: npm run dev"
echo "Or use the launch script: npm run launch"

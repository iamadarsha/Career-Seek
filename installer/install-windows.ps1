Write-Host "Starting JobHunt India Windows Installation..."

# 1. Check for Node.js
if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js is not installed. Please install Node.js 20+ LTS first." -ForegroundColor Red
    exit 1
}

$NODE_VERSION = node -v
Write-Host "Found Node.js $NODE_VERSION"

# 2. Install dependencies
Write-Host "Installing application dependencies..."
npm install

# 3. Bootstrap application (Database, config folders)
Write-Host "Bootstrapping local environment..."
npm run db:init
npm run db:generate
npm run db:push

# 4. Success message
Write-Host ""
Write-Host "Installation complete!" -ForegroundColor Green
Write-Host "To start the application, run: npm run dev"
Write-Host "Or use the launch script: npm run launch"

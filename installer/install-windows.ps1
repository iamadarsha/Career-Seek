# Career Seek — Windows installer
# Usage: powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/iamadarsha/Career-Seek/main/installer/install-windows.ps1 | iex"
$ErrorActionPreference = "Stop"

$RepoUrl    = if ($env:CAREER_SEEK_REPO)   { $env:CAREER_SEEK_REPO }   else { "https://github.com/iamadarsha/Career-Seek.git" }
$Branch     = if ($env:CAREER_SEEK_BRANCH) { $env:CAREER_SEEK_BRANCH } else { "main" }
$InstallDir = if ($env:CAREER_SEEK_HOME)   { $env:CAREER_SEEK_HOME }   else { Join-Path $HOME "Career-Seek" }
$NoLaunch   = if ($env:CAREER_SEEK_NO_LAUNCH) { $env:CAREER_SEEK_NO_LAUNCH } else { "0" }

function Write-Info($Message)  { Write-Host "[Career Seek] $Message" -ForegroundColor Cyan }
function Write-Warn($Message)  { Write-Host "[Career Seek] $Message" -ForegroundColor Yellow }
function Write-Ok($Message)    { Write-Host "[Career Seek] $Message" -ForegroundColor Green }
function Write-Fail($Message)  { Write-Host "[Career Seek] $Message" -ForegroundColor Red; exit 1 }

function Refresh-Path {
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + `
              [System.Environment]::GetEnvironmentVariable("Path","User")
}

function Has-Command($Name) {
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Require-Winget {
  if (-not (Has-Command "winget")) {
    Write-Fail ("winget (App Installer) is not available on this machine. " +
      "Install it from the Microsoft Store (search 'App Installer') and re-run this script, " +
      "or install Git and Node.js 22 LTS manually from https://git-scm.com and https://nodejs.org.")
  }
}

function Install-Via-Winget($Id, $DisplayName) {
  Write-Info "Installing $DisplayName via winget..."
  $result = winget install --id $Id -e --source winget `
    --accept-source-agreements --accept-package-agreements --silent 2>&1
  Refresh-Path
  return $LASTEXITCODE -eq 0
}

function Require-Command($Name) {
  if (Has-Command $Name) { return }
  Require-Winget
  switch ($Name) {
    "git"  { Install-Via-Winget "Git.Git"         "Git" | Out-Null }
    "node" { Install-Via-Winget "OpenJS.NodeJS.LTS" "Node.js 22 LTS" | Out-Null }
    "npm"  { Install-Via-Winget "OpenJS.NodeJS.LTS" "Node.js 22 LTS" | Out-Null }
    default { Write-Fail "$Name is required. Install it manually and re-run this script." }
  }
  if (-not (Has-Command $Name)) {
    Write-Fail "Could not install $Name automatically. Install it manually and re-run this script."
  }
}

function Assert-NodeVersion {
  $major = [int](node -p "Number(process.versions.node.split('.')[0])")
  if ($major -lt 20 -or $major -ge 26) {
    Write-Warn "Node.js $(node -v) is installed but Career Seek needs Node 20 or 22 LTS."
    Require-Winget
    Install-Via-Winget "OpenJS.NodeJS.LTS" "Node.js 22 LTS" | Out-Null
    $major = [int](node -p "Number(process.versions.node.split('.')[0])")
    if ($major -lt 20 -or $major -ge 26) {
      Write-Fail "Node.js >=20 and <26 is required. Install Node 22 LTS from https://nodejs.org and re-run."
    }
  }
}

# ── Windows version check ────────────────────────────────────────────────────
$winVer = [System.Environment]::OSVersion.Version
if ($winVer.Major -lt 10) {
  Write-Fail "Career Seek requires Windows 10 or later."
}

# ── Main install ─────────────────────────────────────────────────────────────
Write-Info "Career Seek installer — Windows"
Write-Info "Repo:    $RepoUrl"
Write-Info "Branch:  $Branch"
Write-Info "Install: $InstallDir"
Write-Host ""

Require-Command "git"
Require-Command "node"
Require-Command "npm"
Assert-NodeVersion
Write-Ok "Prerequisites ready. Node $(node -v), npm $(npm -v)"

# ── Clone or update ──────────────────────────────────────────────────────────
if (Test-Path (Join-Path $InstallDir ".git")) {
  Write-Info "Existing checkout found at $InstallDir"
  $dirty = git -C $InstallDir status --porcelain 2>$null
  if ($dirty) {
    Write-Warn "Checkout has local changes — skipping git pull to avoid overwriting your work."
  } else {
    Write-Info "Pulling latest changes..."
    git -C $InstallDir fetch origin $Branch
    git -C $InstallDir checkout $Branch
    git -C $InstallDir pull --ff-only origin $Branch
  }
} elseif (Test-Path $InstallDir) {
  Write-Fail "$InstallDir already exists but is not a git checkout. Move it aside or set CAREER_SEEK_HOME=C:\other\path."
} else {
  Write-Info "Cloning Career Seek into $InstallDir ..."
  git clone --branch $Branch --depth 1 $RepoUrl $InstallDir
}

Set-Location $InstallDir
Write-Host ""
Write-Ok "Career Seek source ready at $InstallDir"

if ($NoLaunch -eq "1") {
  Write-Info "Bootstrapping all dependencies (this takes a few minutes on first run)..."
  npm run bootstrap @args
  Write-Host ""
  Write-Ok "Bootstrap complete."
  Write-Info "To launch later:  cd `"$InstallDir`"; .\setup.ps1"
  Write-Info "To reset data:    cd `"$InstallDir`"; .\reset.ps1"
} else {
  $Port = if ($env:CAREER_SEEK_PORT) { $env:CAREER_SEEK_PORT } else { "3000" }
  Write-Info "Running full setup and launching at http://localhost:$Port"
  Write-Info "This takes a few minutes on first run — grab a coffee"
  & .\setup.ps1 @args
}

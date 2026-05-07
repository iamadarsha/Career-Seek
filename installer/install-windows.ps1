# Career Seek — Windows installer (hardened, failsafe)
# Usage: powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/iamadarsha/Career-Seek/main/installer/install-windows.ps1 | iex"
#
# Environment overrides (all optional):
#   $env:CAREER_SEEK_REPO      — git repo URL   (default: GitHub)
#   $env:CAREER_SEEK_BRANCH    — branch to clone (default: main)
#   $env:CAREER_SEEK_HOME      — install dir     (default: ~/Career-Seek)
#   $env:CAREER_SEEK_PORT      — app port        (default: 3000)
#   $env:CAREER_SEEK_NO_LAUNCH — set to 1 to skip launch after bootstrap
#   $env:HTTPS_PROXY           — corporate proxy (applied to git + npm)
$ErrorActionPreference = "Stop"

$RepoUrl    = if ($env:CAREER_SEEK_REPO)      { $env:CAREER_SEEK_REPO }      else { "https://github.com/iamadarsha/Career-Seek.git" }
$Branch     = if ($env:CAREER_SEEK_BRANCH)    { $env:CAREER_SEEK_BRANCH }    else { "main" }
$InstallDir = if ($env:CAREER_SEEK_HOME)      { $env:CAREER_SEEK_HOME }      else { Join-Path $HOME "Career-Seek" }
$NoLaunch   = if ($env:CAREER_SEEK_NO_LAUNCH) { $env:CAREER_SEEK_NO_LAUNCH } else { "0" }
$Port       = if ($env:CAREER_SEEK_PORT)      { $env:CAREER_SEEK_PORT }      else { "3000" }

function Write-Info($m)  { Write-Host "[Career Seek] $m"   -ForegroundColor Cyan }
function Write-Ok($m)    { Write-Host "[Career Seek] v $m" -ForegroundColor Green }
function Write-Warn($m)  { Write-Host "[Career Seek] ! $m" -ForegroundColor Yellow }
function Write-Fail($m)  { Write-Host "[Career Seek] X $m" -ForegroundColor Red; exit 1 }

function Refresh-Path {
  $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $user    = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

function Has-Command($Name) { $null -ne (Get-Command $Name -ErrorAction SilentlyContinue) }

# ── Windows version gate ──────────────────────────────────────────────────────
$winVer = [System.Environment]::OSVersion.Version
if ($winVer.Major -lt 10) { Write-Fail "Career Seek requires Windows 10 or later." }
Write-Ok "Windows $($winVer.Major).$($winVer.Minor)"

# ── Disk space check (~3 GB needed) ──────────────────────────────────────────
try {
  $drive = (Split-Path $InstallDir -Qualifier) -replace ':',''
  $freeGb = [math]::Round((Get-PSDrive -Name $drive -ErrorAction Stop).Free / 1GB, 1)
  if ($freeGb -lt 3) {
    Write-Warn "Low disk space: $freeGb GB free. Career Seek needs ~3 GB. Continuing anyway."
  } else {
    Write-Ok "Disk space: $freeGb GB free."
  }
} catch {
  Write-Warn "Could not check disk space — continuing."
}

# ── Network check ─────────────────────────────────────────────────────────────
function Test-Url($Url) {
  try {
    $req = [System.Net.WebRequest]::Create($Url)
    $req.Method = "HEAD"; $req.Timeout = 6000
    if ($env:HTTPS_PROXY) { $req.Proxy = [System.Net.WebProxy]::new($env:HTTPS_PROXY) }
    $resp = $req.GetResponse(); $resp.Close()
    return $true
  } catch { return $false }
}

if (-not (Test-Url "https://github.com")) {
  Write-Warn "GitHub is not reachable."
  Write-Warn "If on a corporate proxy, set: `$env:HTTPS_PROXY = 'http://proxy:8080'"
  Write-Warn "Then run: git config --global http.proxy http://proxy:8080"
} else { Write-Ok "GitHub reachable." }

if (-not (Test-Url "https://registry.npmjs.org")) {
  Write-Warn "npm registry unreachable."
  Write-Warn "Restricted network? Run: npm config set registry https://registry.npmmirror.com"
} else { Write-Ok "npm registry reachable." }

# ── Proxy propagation ─────────────────────────────────────────────────────────
if ($env:HTTPS_PROXY) {
  Write-Info "Applying proxy $($env:HTTPS_PROXY) to git and npm…"
  git config --global http.proxy $env:HTTPS_PROXY 2>$null
  npm config set proxy $env:HTTPS_PROXY 2>$null
  npm config set https-proxy $env:HTTPS_PROXY 2>$null
}

# ── winget availability ───────────────────────────────────────────────────────
function Require-Winget {
  if (-not (Has-Command "winget")) {
    Write-Warn "winget is not installed. Install 'App Installer' from the Microsoft Store."
    Write-Warn "Or install Git and Node.js 22 LTS manually:"
    Write-Warn "  Git    : https://git-scm.com/download/win"
    Write-Warn "  Node   : https://nodejs.org/en/download"
    Write-Fail "winget is required for automatic dependency installation."
  }
}

function Install-ViaWinget($Id, $Label) {
  Write-Info "Installing $Label via winget…"
  $exitCode = (Start-Process -FilePath winget -ArgumentList @(
    "install", "--id", $Id, "-e", "--source", "winget",
    "--accept-source-agreements", "--accept-package-agreements", "--silent"
  ) -Wait -PassThru -NoNewWindow).ExitCode
  Refresh-Path
  return ($exitCode -eq 0)
}

# ── Visual C++ Build Tools (needed for better-sqlite3) ───────────────────────
function Ensure-BuildTools {
  # Check if MSVC is already present via cl.exe or vswhere
  if (Has-Command "cl") { return }
  $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
  if (Test-Path $vsWhere) {
    $vs = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    if ($vs) { return } # Build tools found
  }
  Write-Warn "Visual C++ Build Tools not found. better-sqlite3 may fail to compile."
  Write-Warn "Install them from: https://aka.ms/vs/17/release/vs_BuildTools.exe"
  Write-Warn "Or run in Admin PowerShell:"
  Write-Warn "  winget install --id Microsoft.VisualStudio.2022.BuildTools -e"
  # Non-fatal — bootstrap will attempt npm rebuild with a clear error if needed
}
Ensure-BuildTools

# ── Git ───────────────────────────────────────────────────────────────────────
if (-not (Has-Command "git")) {
  Require-Winget
  if (-not (Install-ViaWinget "Git.Git" "Git")) {
    Write-Fail "Git installation failed. Install manually from https://git-scm.com and re-run."
  }
  Refresh-Path
  if (-not (Has-Command "git")) {
    Write-Fail "Git still not found after install. Open a new terminal and re-run this script."
  }
}
Write-Ok "Git available."

# ── Node.js ───────────────────────────────────────────────────────────────────
if (-not (Has-Command "node")) {
  Require-Winget
  Install-ViaWinget "OpenJS.NodeJS.LTS" "Node.js 22 LTS" | Out-Null
  Refresh-Path
}

if (-not (Has-Command "node")) {
  Write-Fail "Node.js not found after install. Open a new terminal and re-run this script."
}

$nodeMajor = [int](node -e "process.stdout.write(String(Number(process.versions.node.split('.')[0])))")
if ($nodeMajor -lt 20 -or $nodeMajor -ge 26) {
  Write-Warn "Node.js $(node -v) is outside supported range (>=20 <26). Installing Node 22 LTS…"
  Require-Winget
  Install-ViaWinget "OpenJS.NodeJS.LTS" "Node.js 22 LTS" | Out-Null
  Refresh-Path
  $nodeMajor = [int](node -e "process.stdout.write(String(Number(process.versions.node.split('.')[0])))" 2>$null)
  if ($nodeMajor -lt 20) {
    Write-Fail "Node.js >=20 is required. Install from https://nodejs.org and re-run."
  }
}
Write-Ok "Node.js $(node -v), npm $(npm -v)"

# ── Check for Windows Store Python stub ───────────────────────────────────────
# This is already handled in bootstrap.mjs but we warn early here.
try {
  $pyPath = (Get-Command python3 -ErrorAction SilentlyContinue)?.Source
  if (-not $pyPath) { $pyPath = (Get-Command python -ErrorAction SilentlyContinue)?.Source }
  if ($pyPath -and ($pyPath -like "*WindowsApps*" -or $pyPath -like "*AppData*Local*Microsoft*WindowsApps*")) {
    Write-Warn "python3 resolves to the Windows Store stub: $pyPath"
    Write-Warn "Bootstrap will automatically download a portable Python 3.12 — no action needed."
  }
} catch { }

# ── PowerShell ExecutionPolicy check ─────────────────────────────────────────
$policy = Get-ExecutionPolicy -Scope CurrentUser
if ($policy -eq "Restricted") {
  Write-Warn "PowerShell ExecutionPolicy is Restricted. Some npm scripts may not run."
  Write-Warn "Fix: Set-ExecutionPolicy RemoteSigned -Scope CurrentUser"
}

# ── Clone or update ───────────────────────────────────────────────────────────
Write-Info "──────────────────────────────────────────"
Write-Info "Career Seek Windows Installer"
Write-Info "  Repo  : $RepoUrl"
Write-Info "  Branch: $Branch"
Write-Info "  Dir   : $InstallDir"
Write-Info "  Port  : $Port"
Write-Info "──────────────────────────────────────────"

if (Test-Path (Join-Path $InstallDir ".git")) {
  Write-Info "Existing checkout found at $InstallDir"
  $dirty = git -C $InstallDir status --porcelain 2>$null
  if ($dirty) {
    Write-Warn "Local changes detected — skipping git pull to protect your work."
    Write-Warn "To force update: git -C `"$InstallDir`" pull --ff-only"
  } else {
    Write-Info "Pulling latest changes…"
    git -C $InstallDir fetch origin $Branch 2>$null
    git -C $InstallDir checkout $Branch 2>$null
    git -C $InstallDir pull --ff-only origin $Branch 2>$null
  }
} elseif (Test-Path $InstallDir) {
  Write-Fail "$InstallDir exists but is not a git repo. Move it or set: `$env:CAREER_SEEK_HOME = 'C:\other\path'"
} else {
  Write-Info "Cloning Career Seek (shallow clone)…"
  $cloneOk = $false
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    $exitCode = (Start-Process -FilePath git -ArgumentList @(
      "clone", "--branch", $Branch, "--depth", "1", $RepoUrl, $InstallDir
    ) -Wait -PassThru -NoNewWindow).ExitCode
    if ($exitCode -eq 0) { $cloneOk = $true; break }
    Write-Warn "Clone attempt $attempt failed. Retrying in 5 s…"
    Start-Sleep -Seconds 5
  }
  if (-not $cloneOk) { Write-Fail "git clone failed after 3 attempts. Check your connection." }
}

Set-Location $InstallDir
Write-Ok "Source ready at $InstallDir"

# ── Validate data dir writability ─────────────────────────────────────────────
$dataDir = if ($env:JOBHUNT_DATA_DIR) { $env:JOBHUNT_DATA_DIR } else { Join-Path $HOME ".jobhunt-india" }
try {
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
  $probe = Join-Path $dataDir ".write-probe"
  Set-Content -Path $probe -Value "" -Force
  Remove-Item $probe -Force
  Write-Ok "Data directory writable: $dataDir"
} catch {
  Write-Warn "Data directory not writable: $dataDir"
  Write-Warn "Set JOBHUNT_DATA_DIR in .env.local to a writable path, e.g.:"
  Write-Warn "  JOBHUNT_DATA_DIR=C:\Users\$env:USERNAME\career-seek-data"
}

# ── Bootstrap + launch ────────────────────────────────────────────────────────
if ($NoLaunch -eq "1") {
  Write-Info "Running bootstrap (skipping launch)…"
  $bootstrapExit = (Start-Process -FilePath npm -ArgumentList @("run", "bootstrap") -Wait -PassThru -NoNewWindow).ExitCode
  if ($bootstrapExit -ne 0) {
    Write-Warn "Bootstrap had errors. Attempting repair…"
    $repairExit = (Start-Process -FilePath npm -ArgumentList @("run", "bootstrap", "--", "--repair") -Wait -PassThru -NoNewWindow).ExitCode
    if ($repairExit -ne 0) { Write-Fail "Bootstrap repair failed. Run: npm run preflight" }
  }
  Write-Host ""
  Write-Ok "Bootstrap complete."
  Write-Host ""
  Write-Host "  Next steps:"
  Write-Host "    cd `"$InstallDir`""
  Write-Host "    npm run launch       # start Career Seek"
  Write-Host "    npm run preflight    # run all health checks"
  Write-Host "    npm run doctor       # diagnose issues"
} else {
  Write-Info "Running full setup and launching at http://localhost:$Port …"
  Write-Info "This takes a few minutes on first run — grab a coffee"
  Write-Host ""
  $bootstrapExit = (Start-Process -FilePath npm -ArgumentList @("run", "bootstrap") -Wait -PassThru -NoNewWindow).ExitCode
  if ($bootstrapExit -ne 0) {
    Write-Warn "Bootstrap had errors. Attempting repair…"
    $repairExit = (Start-Process -FilePath npm -ArgumentList @("run", "bootstrap", "--", "--repair") -Wait -PassThru -NoNewWindow).ExitCode
    if ($repairExit -ne 0) { Write-Fail "Bootstrap repair failed. Run: npm run preflight" }
  }
  Write-Ok "Bootstrap complete. Launching Career Seek…"
  npm run launch @args
}

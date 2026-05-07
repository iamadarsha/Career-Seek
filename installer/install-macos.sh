#!/usr/bin/env bash
# Career Seek — macOS installer (hardened, failsafe)
# Usage: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/iamadarsha/Career-Seek/main/installer/install-macos.sh)"
#
# Environment overrides (all optional):
#   CAREER_SEEK_REPO      — git repo URL   (default: GitHub)
#   CAREER_SEEK_BRANCH    — branch to clone (default: main)
#   CAREER_SEEK_HOME      — install dir     (default: ~/Career-Seek)
#   CAREER_SEEK_PORT      — app port        (default: 3000)
#   CAREER_SEEK_NO_LAUNCH — set to 1 to skip launch after bootstrap
#   HTTPS_PROXY           — corporate proxy (also applied to git + npm)
set -Eeuo pipefail

REPO_URL="${CAREER_SEEK_REPO:-https://github.com/iamadarsha/Career-Seek.git}"
BRANCH="${CAREER_SEEK_BRANCH:-main}"
INSTALL_DIR="${CAREER_SEEK_HOME:-$HOME/Career-Seek}"
NO_LAUNCH="${CAREER_SEEK_NO_LAUNCH:-0}"
PORT="${CAREER_SEEK_PORT:-3000}"

# ── colour helpers ────────────────────────────────────────────────────────────
BOLD="\033[1m";  RESET="\033[0m"
CYAN="\033[36m"; GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"
info()  { printf "${CYAN}${BOLD}[Career Seek]${RESET} %s\n" "$*"; }
ok()    { printf "${GREEN}${BOLD}[Career Seek] ✓${RESET} %s\n" "$*"; }
warn()  { printf "${YELLOW}${BOLD}[Career Seek] ⚠${RESET} %s\n" "$*"; }
die()   { printf "${RED}${BOLD}[Career Seek] ✗${RESET} %s\n" "$*" >&2; exit 1; }

# ── macOS version gate ────────────────────────────────────────────────────────
MACOS_MAJOR=$(sw_vers -productVersion | cut -d. -f1)
if (( MACOS_MAJOR < 12 )); then
  die "Career Seek requires macOS 12 Monterey or later. Current: $(sw_vers -productVersion)"
fi
ok "macOS $(sw_vers -productVersion)"

# ── disk space check (need ~3 GB) ─────────────────────────────────────────────
FREE_KB=$(df -k "$HOME" | awk 'NR==2 {print $4}')
FREE_GB=$(echo "scale=1; $FREE_KB / 1048576" | bc)
if (( FREE_KB < 3000000 )); then
  warn "Low disk space: ~${FREE_GB} GB free. Career Seek needs ~3 GB. Continuing anyway."
else
  ok "Disk space: ~${FREE_GB} GB free."
fi

# ── network check ─────────────────────────────────────────────────────────────
check_network() {
  if ! curl -fsS --max-time 6 --head https://github.com -o /dev/null 2>&1; then
    warn "GitHub is not reachable."
    warn "If you are behind a corporate proxy, set:"
    warn "  export HTTPS_PROXY=http://proxy.company.com:8080"
    warn "  git config --global http.proxy http://proxy.company.com:8080"
  else
    ok "Network reachable (GitHub)."
  fi
  if ! curl -fsS --max-time 6 --head https://registry.npmjs.org -o /dev/null 2>&1; then
    warn "npm registry is not reachable."
    warn "Restricted network? Try: npm config set registry https://registry.npmmirror.com"
  else
    ok "npm registry reachable."
  fi
}
check_network

# ── Homebrew ──────────────────────────────────────────────────────────────────
ensure_homebrew() {
  if command -v brew >/dev/null 2>&1; then return 0; fi
  info "Installing Homebrew (you may be prompted for your password)…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add brew to PATH for Apple Silicon and Intel
  if   [[ -x /opt/homebrew/bin/brew ]]; then eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]];    then eval "$(/usr/local/bin/brew shellenv)"
  fi
  command -v brew >/dev/null 2>&1 || die "Homebrew install failed. Visit https://brew.sh and install manually."
  ok "Homebrew installed."
}

refresh_node_path() {
  export PATH="/opt/homebrew/opt/node@22/bin:/usr/local/opt/node@22/bin:$PATH"
}

# ── Node.js ───────────────────────────────────────────────────────────────────
ensure_node() {
  refresh_node_path
  if ! command -v node >/dev/null 2>&1; then
    info "Node.js not found — installing Node 22 LTS via Homebrew…"
    ensure_homebrew
    brew install node@22
    refresh_node_path
  fi

  local major
  major=$(node -e "process.stdout.write(String(Number(process.versions.node.split('.')[0])))")
  if (( major < 20 )) || (( major >= 26 )); then
    warn "Node.js $(node -v) is outside the supported range (>=20 <26). Installing Node 22 LTS…"
    ensure_homebrew
    # Install node@22 without uninstalling the user's existing node
    brew install node@22 2>/dev/null || brew upgrade node@22 2>/dev/null || true
    # Force the brew-managed node@22 onto the PATH for this session only
    refresh_node_path
    # Re-check
    major=$(node -e "process.stdout.write(String(Number(process.versions.node.split('.')[0])))" 2>/dev/null || echo 0)
    if (( major < 20 )); then
      die "Node.js >=20 is required. Install Node 22 LTS from https://nodejs.org and re-run this script."
    fi
  fi
  ok "Node.js $(node -v), npm $(npm -v)"
}

# ── Git ───────────────────────────────────────────────────────────────────────
ensure_git() {
  if command -v git >/dev/null 2>&1; then return 0; fi
  info "Git not found — installing via Homebrew…"
  ensure_homebrew
  brew install git
  command -v git >/dev/null 2>&1 || die "Git installation failed. Install manually from https://git-scm.com."
  ok "Git $(git --version | awk '{print $3}') installed."
}

# ── Proxy propagation to git + npm ────────────────────────────────────────────
if [[ -n "${HTTPS_PROXY:-}" ]]; then
  info "Proxy detected: ${HTTPS_PROXY}. Applying to git and npm for this session."
  git config --global http.proxy "${HTTPS_PROXY}" 2>/dev/null || true
  npm config set proxy "${HTTPS_PROXY}" 2>/dev/null || true
  npm config set https-proxy "${HTTPS_PROXY}" 2>/dev/null || true
fi

# ── xcode command-line tools (needed for better-sqlite3 native build) ─────────
ensure_xcode_clt() {
  if xcode-select -p >/dev/null 2>&1; then return 0; fi
  info "Installing Xcode Command Line Tools (required for native addon compilation)…"
  # This triggers a system UI prompt; we can't fully automate it
  xcode-select --install 2>/dev/null || true
  warn "A system dialog may have appeared asking you to install Xcode Command Line Tools."
  warn "Please accept it, then re-run this installer."
  warn "Or install manually: xcode-select --install"
}
ensure_xcode_clt

# ── Clone or update ───────────────────────────────────────────────────────────
ensure_node
ensure_git

info "──────────────────────────────────────────"
info "Career Seek macOS Installer"
info "  Repo  : $REPO_URL"
info "  Branch: $BRANCH"
info "  Dir   : $INSTALL_DIR"
info "  Port  : $PORT"
info "──────────────────────────────────────────"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Existing checkout found at $INSTALL_DIR"
  DIRTY=$(git -C "$INSTALL_DIR" status --porcelain 2>/dev/null || echo "")
  if [[ -n "$DIRTY" ]]; then
    warn "Local changes detected — skipping git pull to protect your work."
    warn "To force update: git -C \"$INSTALL_DIR\" pull --ff-only"
  else
    info "Pulling latest changes…"
    git -C "$INSTALL_DIR" fetch origin "$BRANCH" || warn "git fetch failed — using existing checkout."
    git -C "$INSTALL_DIR" checkout "$BRANCH" 2>/dev/null || true
    git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH" || warn "git pull failed — using existing checkout."
  fi
elif [[ -e "$INSTALL_DIR" ]]; then
  die "$INSTALL_DIR exists but is not a git repo. Move it or set CAREER_SEEK_HOME=/other/path."
else
  info "Cloning Career Seek (shallow clone)…"
  # Retry clone up to 3 times
  CLONE_OK=0
  for attempt in 1 2 3; do
    if git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$INSTALL_DIR" 2>&1; then
      CLONE_OK=1; break
    fi
    warn "Clone attempt $attempt failed. Retrying in 5 s…"
    sleep 5
  done
  (( CLONE_OK == 1 )) || die "git clone failed after 3 attempts. Check your internet connection."
fi

cd "$INSTALL_DIR"
chmod +x setup.sh reset.sh 2>/dev/null || true
ok "Source ready at $INSTALL_DIR"

# ── Run node-based failsafe checks ────────────────────────────────────────────
info "Running node-based environment validation…"
node - <<'NODESCRIPT'
import('/dev/stdin').catch(() => {});
// Inline check — avoids needing the module to be installed yet
const { execFileSync } = await import('child_process');
const fs = await import('fs');
const path = await import('path');
const os = await import('os');

const root = process.cwd();

// Check data dir writability
const dataDir = process.env.JOBHUNT_DATA_DIR || path.join(os.homedir(), '.jobhunt-india');
try {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, '.write-probe'), '');
  fs.unlinkSync(path.join(dataDir, '.write-probe'));
  console.log('[Career Seek] ✓ Data directory writable: ' + dataDir);
} catch (e) {
  console.warn('[Career Seek] ⚠ Data dir not writable: ' + dataDir);
  console.warn('[Career Seek]   Set JOBHUNT_DATA_DIR to a writable path in .env.local');
}
NODESCRIPT

# ── Bootstrap + launch ───────────────────────────────────────────────────────
if [[ "$NO_LAUNCH" == "1" ]]; then
  info "Running bootstrap (skipping launch)…"
  npm run bootstrap || {
    warn "Bootstrap encountered errors. Attempting repair…"
    npm run bootstrap -- --repair || die "Bootstrap repair also failed. Check the output above."
  }
  echo ""
  ok "Bootstrap complete."
  echo ""
  echo "  Next steps:"
  echo "    cd \"$INSTALL_DIR\" && npm run launch     — start Career Seek"
  echo "    npm run preflight                        — run all health checks"
  echo "    npm run doctor                           — diagnose issues"
else
  info "Running full setup and launching at http://localhost:${PORT}…"
  info "This takes a few minutes on first run — grab a coffee ☕"
  echo ""
  # Bootstrap with fallback to repair
  npm run bootstrap || {
    warn "Bootstrap encountered errors. Attempting repair…"
    npm run bootstrap -- --repair || die "Bootstrap repair failed. Run: npm run preflight"
  }
  echo ""
  ok "Bootstrap complete. Launching Career Seek…"
  exec npm run launch -- "$@"
fi

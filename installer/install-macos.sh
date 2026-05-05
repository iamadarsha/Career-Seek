#!/usr/bin/env bash
# Career Seek — macOS installer
# Usage: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/iamadarsha/Career-Seek/main/installer/install-macos.sh)"
set -Eeuo pipefail

REPO_URL="${CAREER_SEEK_REPO:-https://github.com/iamadarsha/Career-Seek.git}"
BRANCH="${CAREER_SEEK_BRANCH:-main}"
INSTALL_DIR="${CAREER_SEEK_HOME:-$HOME/Career-Seek}"
NO_LAUNCH="${CAREER_SEEK_NO_LAUNCH:-0}"

info() { printf '\033[1;34m[Career Seek]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[Career Seek]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[Career Seek]\033[0m %s\n' "$*" >&2; exit 1; }
ok()   { printf '\033[1;32m[Career Seek]\033[0m %s\n' "$*"; }

# ── Homebrew ────────────────────────────────────────────────────────────────
ensure_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    return 0
  fi
  info "Homebrew not found — installing it now (you may be prompted for your password)..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add to PATH for this session (covers Apple Silicon + Intel)
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
  if ! command -v brew >/dev/null 2>&1; then
    die "Homebrew installation failed. Visit https://brew.sh and install manually, then re-run this script."
  fi
  ok "Homebrew installed."
}

refresh_node_path() {
  export PATH="/opt/homebrew/opt/node@22/bin:/usr/local/opt/node@22/bin:$PATH"
}

# ── Dependency helpers ───────────────────────────────────────────────────────
require_command() {
  local cmd="$1"
  if command -v "$cmd" >/dev/null 2>&1; then
    return 0
  fi
  ensure_homebrew
  case "$cmd" in
    git)
      info "Installing Git via Homebrew..."
      brew install git
      ;;
    node|npm)
      info "Installing Node.js 22 LTS via Homebrew..."
      brew install node@22
      refresh_node_path
      ;;
    *)
      die "$cmd is required but not found and has no automatic installer."
      ;;
  esac
  if ! command -v "$cmd" >/dev/null 2>&1; then
    die "Could not install $cmd. Please install it manually and re-run this script."
  fi
}

check_node() {
  local major
  major="$(node -p "Number(process.versions.node.split('.')[0])")"
  if [[ "$major" -lt 20 || "$major" -ge 26 ]]; then
    warn "Node.js $(node -v) is installed but Career Seek needs Node 20 or 22 LTS."
    info "Installing Node.js 22 LTS via Homebrew..."
    ensure_homebrew
    brew install node@22
    refresh_node_path
    major="$(node -p "Number(process.versions.node.split('.')[0])")"
    if [[ "$major" -lt 20 || "$major" -ge 26 ]]; then
      die "Node.js >=20 and <26 is required. Install Node 22 LTS manually, then re-run."
    fi
  fi
}

# ── macOS version check ──────────────────────────────────────────────────────
macos_major="$(sw_vers -productVersion | cut -d. -f1)"
if [[ "$macos_major" -lt 12 ]]; then
  die "Career Seek requires macOS 12 Monterey or later. Current: $(sw_vers -productVersion)"
fi

# ── Main install ─────────────────────────────────────────────────────────────
info "Career Seek installer — macOS"
info "Repo:    $REPO_URL"
info "Branch:  $BRANCH"
info "Install: $INSTALL_DIR"
echo ""

refresh_node_path
require_command git
require_command node
require_command npm
check_node
ok "Prerequisites ready. Node $(node -v), npm $(npm -v), git $(git --version | awk '{print $3}')"

# ── Clone or update ──────────────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Existing checkout found at $INSTALL_DIR"
  if [[ -n "$(git -C "$INSTALL_DIR" status --porcelain)" ]]; then
    warn "Checkout has local changes — skipping git pull to avoid overwriting your work."
  else
    info "Pulling latest changes..."
    git -C "$INSTALL_DIR" fetch origin "$BRANCH"
    git -C "$INSTALL_DIR" checkout "$BRANCH"
    git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
  fi
elif [[ -e "$INSTALL_DIR" ]]; then
  die "$INSTALL_DIR already exists but is not a git checkout. Move it aside or set CAREER_SEEK_HOME=/other/path."
else
  info "Cloning Career Seek into $INSTALL_DIR ..."
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
chmod +x setup.sh

echo ""
ok "Career Seek source ready at $INSTALL_DIR"

if [[ "$NO_LAUNCH" == "1" ]]; then
  info "Bootstrapping all dependencies (this takes a few minutes on first run)..."
  npm run bootstrap
  echo ""
  ok "Bootstrap complete."
  info "To launch later:  cd \"$INSTALL_DIR\" && ./setup.sh"
  info "To reset data:    cd \"$INSTALL_DIR\" && ./reset.sh"
else
  info "Running full setup and launching at http://localhost:${CAREER_SEEK_PORT:-3000}"
  info "This takes a few minutes on first run — grab a coffee ☕"
  exec ./setup.sh "$@"
fi

#!/usr/bin/env bash
# Career Seek — user data reset
# Deletes all personal data so the platform starts fresh for a new user.
# Does NOT remove the app code, binaries, or Python runtime.
set -euo pipefail

DATA_DIR="${JOBHUNT_DATA_DIR:-$HOME/.jobhunt-india}"

RED='\033[1;31m'
YLW='\033[1;33m'
GRN='\033[1;32m'
BLU='\033[1;34m'
NC='\033[0m'

info() { printf "${BLU}[Career Seek]${NC} %s\n" "$*"; }
warn() { printf "${YLW}[Career Seek]${NC} %s\n" "$*"; }
ok()   { printf "${GRN}[Career Seek]${NC} %s\n" "$*"; }

echo ""
warn "This will PERMANENTLY delete all Career Seek user data:"
echo ""
echo "  • Resume uploads and generated documents"
echo "  • All scan results and saved jobs"
echo "  • AI Coach conversation history"
echo "  • Application tracker entries"
echo "  • Settings and any API keys stored in the app"
echo "  • Meilisearch search index"
echo ""
echo "  Directory: $DATA_DIR"
echo ""
info "The app code, binaries, and Python runtime are NOT affected."
info "Run ./setup.sh after this to start fresh."
echo ""

if [[ "${1:-}" == "--yes" ]]; then
  CONFIRM="reset"
else
  read -rp "Type 'reset' to confirm (anything else cancels): " CONFIRM
fi

if [[ "$CONFIRM" != "reset" ]]; then
  echo "[Career Seek] Reset cancelled."
  exit 0
fi

echo ""
info "Clearing user data in $DATA_DIR ..."

# Also clear Meilisearch data so the search index is rebuilt from scratch
MEILI_DATA="$(dirname "$0")/binaries/meilisearch/data"

if [[ -d "$DATA_DIR" ]]; then
  rm -rf "$DATA_DIR"
  ok "User data cleared."
else
  info "Data directory not found — nothing to remove."
fi

if [[ -d "$MEILI_DATA" ]]; then
  rm -rf "$MEILI_DATA"
  ok "Meilisearch index cleared."
fi

echo ""
ok "Reset complete. Career Seek is ready for a new user."
info "Start the app with:  ./setup.sh"

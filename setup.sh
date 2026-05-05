#!/usr/bin/env bash
set -Eeuo pipefail

PORT="${CAREER_SEEK_PORT:-3000}"
URL="http://localhost:${PORT}"

info() {
  printf '[Career Seek] %s\n' "$*"
}

info "Preparing Career Seek..."
PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
fi

if [ -z "$PYTHON_BIN" ]; then
  info "Compatible Python was not found. Bootstrap will download a portable Python 3.12 runtime for python-jobspy."
else
  if ! "$PYTHON_BIN" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if (3, 9) <= sys.version_info < (3, 13) else 1)
PY
  then
    info "Found $PYTHON_BIN, but python-jobspy currently needs Python 3.9-3.12. Bootstrap will download a portable Python 3.12 runtime instead."
  fi
fi
info "Optional OCR helpers on macOS: brew install poppler tesseract"

info "Running native no-Docker bootstrap..."
npm run bootstrap -- "$@"

info "Launching Career Seek at ${URL}..."
exec npm run launch -- "$@"

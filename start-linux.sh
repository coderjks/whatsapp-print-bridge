#!/usr/bin/env bash
# PrintBridge one-click starter for Linux (Debian/Ubuntu/Raspberry Pi OS).
# First run installs Node.js + CUPS + LibreOffice via apt; every run opens the dashboard.
set -euo pipefail
cd "$(dirname "$0")"

say() { echo "[PrintBridge] $*"; }

if ! command -v apt-get >/dev/null 2>&1; then
  say "No apt-get found. Please install manually: Node.js 20+, CUPS, LibreOffice,"
  say "then run: npm install --allow-git=all && npm run dev"
  exit 1
fi

need_sys=0
command -v node >/dev/null 2>&1 || need_sys=1
command -v lpstat >/dev/null 2>&1 || need_sys=1
command -v soffice >/dev/null 2>&1 || need_sys=1
if [ "$need_sys" = 1 ]; then
  say "Installing Node.js, CUPS + LibreOffice (one time, needs sudo) ..."
  sudo apt-get update
  sudo apt-get install -y nodejs npm cups cups-client libreoffice-writer libreoffice-impress libreoffice-calc
fi

if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  say "WARNING: $(node -v) is older than Node 20 - upgrade from https://nodejs.org for best results."
fi

if ! id -nG "$USER" | grep -qw lpadmin; then
  sudo usermod -aG lpadmin "$USER" || true
  say "Added you to lpadmin - log out/in once for printer admin rights."
fi

if ! lpstat -p -d 2>/dev/null | grep -q .; then
  say "WARNING: no printers found - add one in Settings > Printers (CUPS: http://localhost:631)."
fi

if [ ! -f .env ]; then say "Creating default .env ..."; cp .env.example .env; fi
if [ ! -d node_modules ]; then
  say "First run: installing dependencies (one time, takes a few minutes) ..."
  npm install --allow-git=all --no-audit --no-fund
fi
mkdir -p auth inbox

PORT="$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 || true)"
PORT="${PORT:-3001}"
say "Starting on http://localhost:${PORT} ..."
(xdg-open "http://localhost:${PORT}" 2>/dev/null || true) &
export PORT
npm run dev

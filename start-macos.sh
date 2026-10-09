#!/usr/bin/env bash
# PrintBridge one-click starter for macOS.
# First run installs Node 20 + LibreOffice via Homebrew; every run opens the dashboard.
set -euo pipefail
cd "$(dirname "$0")"

say() { echo "[PrintBridge] $*"; }

if ! command -v brew >/dev/null 2>&1; then
  say "Installing Homebrew (one time, needs your password) ..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
fi

need_node=0
if ! command -v node >/dev/null 2>&1; then
  need_node=1
elif [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  need_node=1
fi
if [ "$need_node" = 1 ]; then
  say "Installing Node.js 20 (one time) ..."
  brew install node@20
  brew link --overwrite node@20 2>/dev/null || true
fi

if ! command -v soffice >/dev/null 2>&1 && [ ! -x "/Applications/LibreOffice.app/Contents/MacOS/soffice" ]; then
  say "Installing LibreOffice for Word/Excel/PowerPoint files (one time) ..."
  brew install --cask libreoffice
fi

if ! lpstat -p -d 2>/dev/null | grep -q .; then
  say "WARNING: no printers found - add one in System Settings > Printers."
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
open "http://localhost:${PORT}" 2>/dev/null || true
export PORT
npm run dev

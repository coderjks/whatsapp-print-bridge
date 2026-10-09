@echo off
REM PrintBridge one-click starter for Windows (cybercafe edition).
REM First run installs dependencies; every run opens the dashboard.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [PrintBridge] Node.js 20+ is required.
  echo Please install it from https://nodejs.org (LTS), then double-click this file again.
  pause
  exit /b 1
)

if not exist .env (
  echo [PrintBridge] Creating default .env ...
  copy .env.example .env >nul
)

if not exist node_modules (
  echo [PrintBridge] First run: installing dependencies (one time, takes a few minutes) ...
  call npm install --allow-git=all --no-audit --no-fund
  if errorlevel 1 (
    echo [PrintBridge] Install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

if not exist auth mkdir auth
if not exist inbox mkdir inbox

echo [PrintBridge] Starting on http://localhost:3001 ...
start "" http://localhost:3001
set PORT=3001
call npm run dev
pause

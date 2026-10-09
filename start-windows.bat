@echo off
REM PrintBridge one-click starter for Windows (cybercafe edition).
REM First run installs dependencies; every run opens the dashboard.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 call :install_node
where node >nul 2>nul
if errorlevel 1 (
  echo [PrintBridge] Automatic install failed. Please install Node.js 20+ LTS from https://nodejs.org,
  echo then double-click this file again.
  pause
  exit /b 1
)

where soffice >nul 2>nul
if errorlevel 1 (
  if not exist "C:\Program Files\LibreOffice\program\soffice.exe" if not exist "C:\Program Files (x86)\LibreOffice\program\soffice.exe" (
    echo [PrintBridge] WARNING: LibreOffice not found - Word/Excel/PowerPoint files won't print.
    echo Install it from https://www.libreoffice.org/download/download-libreoffice/ (PDFs and images work fine without it^).
  )
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
goto :eof

:install_node
echo [PrintBridge] Node.js not found - installing automatically (one time, may show an admin prompt) ...
where winget >nul 2>nul
if not errorlevel 1 goto :have_winget
echo [PrintBridge] winget not found - downloading the latest Node.js LTS from nodejs.org ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$v=(Invoke-RestMethod 'https://nodejs.org/dist/index.json' | Where-Object { $_.lts } | Select-Object -First 1).version; $msi=$env:TEMP+'\node-lts.msi'; Invoke-WebRequest -Uri ('https://nodejs.org/dist/'+$v+'/node-'+$v+'-x64.msi') -OutFile $msi; Start-Process msiexec -ArgumentList '/i',$msi,'/qn','/norestart' -Wait"
goto :node_path_fix
:have_winget
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
:node_path_fix
set "PATH=C:\Program Files\nodejs;%PATH%"
exit /b 0

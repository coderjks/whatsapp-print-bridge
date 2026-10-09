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

REM LibreOffice is optional: only needed for DOCX/PPTX/XLSX. PDFs and images work without it.
set "OFFICE_FOUND=0"
where soffice >nul 2>nul
if not errorlevel 1 set "OFFICE_FOUND=1"
if exist "C:\Program Files\LibreOffice\program\soffice.exe" set "OFFICE_FOUND=1"
if exist "C:\Program Files (x86)\LibreOffice\program\soffice.exe" set "OFFICE_FOUND=1"
if "%OFFICE_FOUND%"=="1" goto office_ok
if /i "%SKIP_OFFICE_CHECK%"=="1" goto office_ok
if "%~1"=="" goto office_ask
if /i "%~1"=="--skip-office-check" goto office_ok
if /i "%~1"=="--no-office" goto office_ok
:office_ask
echo.
echo [PrintBridge] LibreOffice not found - optional component.
echo   Without it: PDFs and images print fine; Word/Excel/PowerPoint files will be skipped.
echo   With it:    DOCX/PPTX/XLSX also print via automatic conversion.
set "INSTALL_OFFICE=n"
set /p "INSTALL_OFFICE=Install LibreOffice now? [y/N]: "
if /i "%INSTALL_OFFICE%"=="y" goto office_install
if /i "%INSTALL_OFFICE%"=="yes" goto office_install
echo [PrintBridge] Skipping LibreOffice - continuing.
echo [PrintBridge] Tip: set SKIP_OFFICE_CHECK=1 to hide this prompt next time.
goto office_ok
:office_install
where winget >nul 2>nul
if errorlevel 1 (
  echo [PrintBridge] winget not found - please install manually from https://www.libreoffice.org/download/download-libreoffice/
  echo [PrintBridge] Continuing without LibreOffice ...
  goto :office_ok
)
echo [PrintBridge] Installing LibreOffice (one time, may take a few minutes) ...
winget install -e --id TheDocumentFoundation.LibreOffice --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
  echo [PrintBridge] LibreOffice install failed or was cancelled - continuing without it.
  echo Get it later from https://www.libreoffice.org/download/download-libreoffice/
)
:office_ok

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

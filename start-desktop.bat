@echo off
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
where npm >nul 2>&1 || (
  echo Node.js and npm are required. Install from https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules call npm install
if not exist build\icon.ico call npm run icon
call npm run desktop

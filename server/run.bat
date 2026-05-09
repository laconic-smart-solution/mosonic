@echo off
setlocal

REM Always run from this folder (Windows-friendly).
cd /d "%~dp0"

REM Kill process using port 3000
echo Checking port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    echo Killing PID %%a ...
    taskkill /PID %%a /F
)

REM Install deps if needed (fast if already installed).
if not exist "node_modules" (
  echo Installing dependencies...
  yarn install
)

echo Starting backend (NestJS, watch mode)...
yarn start:dev

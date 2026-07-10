@echo off
setlocal EnableDelayedExpansion

REM Mosonic API — production startup (Windows)
REM Usage:
REM   run.bat              Build, migrate, start API (+ worker if configured)
REM   run.bat --skip-build Reuse existing dist/ (faster restarts)

cd /d "%~dp0"

set "SKIP_BUILD=0"
if /i "%~1"=="--skip-build" set "SKIP_BUILD=1"

echo.
echo ========================================
echo   Mosonic API - Production
echo ========================================
echo.

if not exist "package.json" (
  echo [ERROR] package.json not found. Run this script from the server folder.
  exit /b 1
)

if not exist ".env" (
  echo [ERROR] Missing .env file.
  echo         Copy .env.example to .env and configure production values.
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not on PATH. Install Node 20+ and try again.
  exit /b 1
)

where yarn >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Yarn is not on PATH. Install Yarn and try again.
  exit /b 1
)

for /f "delims=" %%v in ('node -p "process.version"') do set "NODE_VER=%%v"
echo [INFO] Node %NODE_VER%

if not exist "node_modules" (
  echo [INFO] Installing dependencies...
  call yarn install --frozen-lockfile
  if errorlevel 1 (
    echo [ERROR] yarn install failed.
    exit /b 1
  )
)

echo [INFO] Generating Prisma client...
call yarn prisma:generate
if errorlevel 1 (
  echo [ERROR] prisma generate failed.
  exit /b 1
)

echo [INFO] Applying database migrations...
call yarn prisma:migrate:deploy
if errorlevel 1 (
  echo [ERROR] prisma migrate deploy failed.
  exit /b 1
)

if "%SKIP_BUILD%"=="0" (
  echo [INFO] Building application...
  call yarn build
  if errorlevel 1 (
    echo [ERROR] nest build failed.
    exit /b 1
  )
) else (
  echo [INFO] Skipping build ^(--skip-build^).
  if not exist "dist\main.js" (
    echo [ERROR] dist\main.js not found. Run without --skip-build first.
    exit /b 1
  )
)

set "NODE_ENV=production"

REM Read queue/worker flags from .env (simple key=value lines).
set "RUN_WORKERS_IN_API=true"
set "ORCHESTRATION_USE_QUEUE=false"
set "PORT=3000"
for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
  if /i "%%a"=="RUN_WORKERS_IN_API" set "RUN_WORKERS_IN_API=%%b"
  if /i "%%a"=="ORCHESTRATION_USE_QUEUE" set "ORCHESTRATION_USE_QUEUE=%%b"
  if /i "%%a"=="PORT" set "PORT=%%b"
)

REM Strip surrounding quotes from parsed values.
set "RUN_WORKERS_IN_API=!RUN_WORKERS_IN_API:"=!"
set "ORCHESTRATION_USE_QUEUE=!ORCHESTRATION_USE_QUEUE:"=!"
set "PORT=!PORT:"=!"

if /i "!ORCHESTRATION_USE_QUEUE!"=="true" (
  if /i "!RUN_WORKERS_IN_API!"=="false" (
    echo [INFO] Starting BullMQ worker process ^(RUN_WORKERS_IN_API=false^)...
    start "Mosonic Worker" /min /d "%~dp0" cmd /c "set NODE_ENV=production&& node dist/worker/main.js"
  )
)

echo [INFO] Starting API on port !PORT! ^(NODE_ENV=production^)...
echo [INFO] Press Ctrl+C to stop.
echo.

node dist/main.js
set "EXIT_CODE=!errorlevel!"

if not "!EXIT_CODE!"=="0" (
  echo.
  echo [ERROR] API exited with code !EXIT_CODE!.
)

exit /b !EXIT_CODE!

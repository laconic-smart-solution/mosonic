@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

if not exist "mvnw.cmd" (
  echo [ERROR] mvnw.cmd not found. Run this from the payment folder.
  exit /b 1
)

echo Checking port 8002...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8002') do (
  echo Killing PID %%a ...
  taskkill /PID %%a /F >nul 2>&1
)

if exist ".env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
    if not "%%a"=="" (
      set "%%a=%%b"
    )
  )
)

if not defined PAYMENT_PORT set PAYMENT_PORT=8002

echo [INFO] Starting payment service on port %PAYMENT_PORT%...
echo [INFO] Health: http://localhost:%PAYMENT_PORT%/actuator/health
call mvnw.cmd spring-boot:run %*
exit /b %errorlevel%
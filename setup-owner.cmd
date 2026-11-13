@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python 3.11 or newer is required.
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js and npm are required.
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" python -m venv .venv
if errorlevel 1 exit /b 1
.venv\Scripts\python.exe -m pip install -r apps\owner-api\requirements.txt
if errorlevel 1 exit /b 1
cd apps\owner-web
call npm ci --no-audit --no-fund
if errorlevel 1 exit /b 1
call npm run build
if errorlevel 1 exit /b 1
echo Setup complete. Run start-owner.cmd from the project folder.

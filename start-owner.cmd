@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Run setup-owner.cmd first.
  exit /b 1
)
if not exist "apps\owner-web\node_modules\vite" (
  echo Run setup-owner.cmd first.
  exit /b 1
)
set "ARROW_ROOT=%~dp0"
set "ARROW_DB_PATH=%~dp0runtime\owner.sqlite3"
start "Arrow Owner API" /D "%~dp0apps\owner-api" "%~dp0.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8010
start "Arrow Owner Web" /D "%~dp0apps\owner-web" cmd /c "npm run dev"
echo Owner dashboard: http://127.0.0.1:5180
echo API documentation: http://127.0.0.1:8010/docs
echo Close both Arrow terminal windows when finished.

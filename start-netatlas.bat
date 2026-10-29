@echo off
cd /d %~dp0
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required. Install it from https://nodejs.org/
  pause
  exit /b 1
)
echo Starting NetAtlas on http://localhost:3000
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
npm start
pause

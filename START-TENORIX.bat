@echo off
title TENORIX - Drone Flight Plan Validator
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed on this PC.
  echo Please download and install Node.js LTS from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

if not exist "backend\node_modules" (
  echo Installing backend dependencies...
  call npm --prefix backend install
  if errorlevel 1 (
    echo [ERROR] Failed to install backend dependencies.
    pause
    exit /b 1
  )
)

if not exist "frontend\node_modules" (
  echo Installing frontend dependencies...
  call npm --prefix frontend install
  if errorlevel 1 (
    echo [ERROR] Failed to install frontend dependencies.
    pause
    exit /b 1
  )
)

echo Starting TENORIX Backend API on http://localhost:4000 ...
start "TENORIX Backend" cmd /k "cd /d "%~dp0" && npm run dev:backend"

echo Starting TENORIX Frontend on http://localhost:5173 ...
start "TENORIX Frontend" cmd /k "cd /d "%~dp0" && npm run dev:frontend"

timeout /t 4 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo TENORIX is launching!
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:4000/api/health
echo.
pause

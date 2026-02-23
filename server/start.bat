@echo off
title Aifredo Backend Server
echo.
echo =============================================
echo   Aifredo AI Chat Platform - Backend Server
echo =============================================
echo.

:: Check if .env exists
if not exist "%~dp0.env" (
  echo [SETUP] First run detected - creating .env from template...
  copy "%~dp0.env.example" "%~dp0.env" >nul
  echo [SETUP] .env created! Please edit it to add your API keys.
  echo.
  echo   Open server\.env and add at least ONE API key:
  echo   - GROQ_API_KEY  (free: console.groq.com)
  echo   - GOOGLE_API_KEY (free: aistudio.google.com)
  echo   - OPENAI_API_KEY
  echo   - ANTHROPIC_API_KEY
  echo.
  pause
)

:: Check if node_modules exists
if not exist "%~dp0node_modules\" (
  echo [SETUP] Installing dependencies...
  cd /d "%~dp0"
  npm install
  echo.
)

:: Start server
echo [START] Launching backend on http://localhost:3001
echo [INFO]  Keep this window open while using the chat app.
echo.
cd /d "%~dp0"
node server.js
pause

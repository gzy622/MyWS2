@echo off
:: Use UTF-8 so Chinese file names and console output work correctly.
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [Error] Node.js was not found. Please install Node.js first.
  pause
  exit /b 1
)

node "%~dp0lan-server.js"
pause

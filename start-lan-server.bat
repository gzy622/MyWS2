@echo off
setlocal EnableExtensions
cd /d "%~dp0"
chcp 65001 >nul
title Teacher Workbench - LAN Server

where node >nul 2>&1
if errorlevel 1 (
  echo [Error] Node.js not found. Install Node.js first.
  pause
  exit /b 1
)

echo Starting LAN server...
node "%~dp0lan-server.js"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo [Error] Exit code %EXIT_CODE%
)
pause
exit /b %EXIT_CODE%

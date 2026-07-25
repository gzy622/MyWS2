@echo off
setlocal EnableExtensions
cd /d "%~dp0"
rem Do not chcp 65001 before powershell.exe: legacy conhost then duplicates CJK glyphs.
title Teacher Workbench - Phone Sync

where node >nul 2>&1
if errorlevel 1 (
  echo [Error] Node.js not found. Install Node.js first.
  goto :fail
)

where adb >nul 2>&1
if errorlevel 1 (
  echo [Error] adb not found. Install Android SDK platform-tools and add to PATH.
  goto :fail
)

if not exist "%~dp0node_modules\@capacitor\cli\" (
  echo [Error] Dependencies missing. Run npm install in this folder first.
  goto :fail
)

echo Starting phone sync console...
echo Tip: 1 = save to refresh. 2 = install on phone. 0 = quit. Use -Details for more.
echo.
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sync-phone.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo [Error] Exit code %EXIT_CODE%
  goto :fail
)
pause
exit /b 0

:fail
pause
exit /b 1

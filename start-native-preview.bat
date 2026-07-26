@echo off
setlocal EnableExtensions
cd /d "%~dp0"
chcp 65001 >nul
title Teacher Workbench - Native Preview

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

echo Starting native shell live preview...
echo Wireless adb: LAN IP + file watch reload. USB reverse: npm run preview:native -- -Usb
echo If reload fails: check __health warning, or use npm run deploy:apk
echo.
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\preview-native.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo [Error] Preview failed with exit code %EXIT_CODE%.
  goto :fail
)
pause
exit /b 0

:fail
pause
exit /b 1

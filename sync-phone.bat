@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where pwsh >nul 2>&1
if errorlevel 1 (
  echo [Error] PowerShell 7 ^(pwsh^) not found.
  echo   Install it with: winget install Microsoft.PowerShell
  echo   or open https://aka.ms/powershell and run the MSI installer.
  goto :fail
)

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

if defined WT_SESSION goto :inwt

where wt >nul 2>&1
if errorlevel 1 (
  echo [Error] Windows Terminal ^(wt.exe^) not found.
  echo   Install it with: winget install Microsoft.WindowsTerminal
  echo   or search "Windows Terminal" in the Microsoft Store.
  goto :fail
)

echo Opening phone sync console in Windows Terminal...
start "" wt.exe pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\sync-phone.ps1" %*
exit /b 0

:inwt
rem Already inside Windows Terminal: reuse the current window.
title Teacher Workbench - Phone Sync
echo Opening phone sync console...
echo Tip: press W in the console to pair or connect over Wi-Fi.
pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\sync-phone.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo [Error] Exit code %EXIT_CODE%
  goto :fail
)
exit /b 0

:fail
pause
exit /b 1

@echo off
setlocal EnableExtensions
chcp 65001 >nul
title WYJ Website Launcher 10.0.0

set "SCRIPT_DIR=%~dp0"
set "LAUNCHER=%SCRIPT_DIR%start-wyj.ps1"
set "POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if not exist "%POWERSHELL%" (
  echo Windows PowerShell 5.1 is required.
  pause
  exit /b 2
)
if not exist "%LAUNCHER%" (
  echo Launcher file is missing:
  echo "%LAUNCHER%"
  pause
  exit /b 3
)

pushd "%SCRIPT_DIR%"
"%POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER%" %*
set "EXITCODE=%ERRORLEVEL%"
popd

if not "%EXITCODE%"=="0" (
  echo.
  echo Startup failed. Run this file with -CheckOnly for a component report.
  pause
)
exit /b %EXITCODE%

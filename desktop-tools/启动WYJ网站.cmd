@echo off
setlocal EnableExtensions
title WYJ Website Launcher 8.1
set "ROOT=%~dp0"
set "LAUNCHER=%ROOT%_wyj-tools\start-wyj.ps1"
set "POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%POWERSHELL%" (
  echo Windows PowerShell is missing.
  pause
  exit /b 2
)
if not exist "%LAUNCHER%" (
  echo Launcher file is missing:
  echo "%LAUNCHER%"
  pause
  exit /b 3
)
pushd "%ROOT%"
"%POWERSHELL%" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%LAUNCHER%" %*
set "EXITCODE=%ERRORLEVEL%"
popd
if not "%EXITCODE%"=="0" pause
exit /b %EXITCODE%

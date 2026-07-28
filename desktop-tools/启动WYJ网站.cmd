@echo off
setlocal EnableExtensions
chcp 65001 >nul
title WYJ Website Launcher 10.4.0

set "SCRIPT_DIR=%~dp0"
set "LAUNCHER=%SCRIPT_DIR%start-wyj.ps1"
set "WYJ_LAUNCHER_ENTRY_DIR=%SCRIPT_DIR%"
set "ERROR_REPORT=%SCRIPT_DIR%启动错误报告.txt"
set "POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if not exist "%POWERSHELL%" (
  echo Windows PowerShell 5.1 is required.
  pause
  exit /b 2
)
if not exist "%LAUNCHER%" (
  set "LAUNCHER=%SCRIPT_DIR%_wyj-tools\start-wyj.ps1"
)
if not exist "%LAUNCHER%" (
  echo 启动器文件缺失。请确认 start-wyj.ps1 位于本目录或 _wyj-tools 目录。
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
  echo 启动失败，已自动运行排错。
  echo 错误报告：
  echo "%ERROR_REPORT%"
  pause
  exit /b %EXITCODE%
)

echo.
echo WYJ 网站启动成功。
echo 浏览器已打开；本窗口将在 3 秒后关闭。
timeout /t 3 /nobreak >nul
exit /b %EXITCODE%

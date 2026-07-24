@echo off
setlocal
title Furby Open Installer
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
set "INSTALL_EXIT=%ERRORLEVEL%"
echo.
if "%INSTALL_EXIT%"=="0" (
  echo Furby Open setup finished. You may close this window.
) else (
  echo The installer stopped with an error. Read the message above.
)
pause
exit /b %INSTALL_EXIT%

@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-pilot.ps1"
exit /b %ERRORLEVEL%

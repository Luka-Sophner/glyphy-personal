@echo off
setlocal
rem Let Windows PowerShell locate its own built-in modules when launched from Codex/pwsh.
set "PSModulePath="
cd /d "%~dp0"
if "%~1"=="--check" goto check
if "%~1"=="--login" goto login
if not "%~1"=="" goto usage
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sync-github.ps1" -Fetch -Interactive
if errorlevel 1 goto finish
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\github-upload.ps1"
if errorlevel 1 goto finish
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\github-upload.ps1" -Push
goto finish
:check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\github-upload.ps1" -CheckConnection
goto finish
:login
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\github-upload.ps1" -Login
goto finish
:usage
echo Usage: send-github-update.bat [--check ^| --login]
exit /b 2
:finish
set "GLYPHY_RESULT=%ERRORLEVEL%"
pause
exit /b %GLYPHY_RESULT%

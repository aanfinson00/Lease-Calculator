@echo off
REM RFP Analyzer launcher - Windows.
REM Double-click to run. Opens the app in your default browser.
REM
REM Tries Python first (smallest server). Falls back to PowerShell, which is
REM built into Windows 10/11, so the launcher should always work.

cd /d "%~dp0"
set PORT=3057
set URL=http://localhost:%PORT%

echo.
echo Starting RFP Analyzer...
echo   URL: %URL%
echo   Close this window to stop the server.
echo.

REM Try Python 3 first.
where python >nul 2>nul
if %ERRORLEVEL%==0 (
  start "" %URL%
  python -m http.server %PORT%
  goto :eof
)

REM Some installs use the launcher 'py' instead of 'python'.
where py >nul 2>nul
if %ERRORLEVEL%==0 (
  start "" %URL%
  py -m http.server %PORT%
  goto :eof
)

REM Fallback: pure PowerShell server (always works on Win10/11).
where powershell >nul 2>nul
if %ERRORLEVEL%==0 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
  goto :eof
)

echo Could not find Python or PowerShell on this machine.
echo Please contact whoever sent you this tool.
pause

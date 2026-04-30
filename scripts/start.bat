@echo off
REM RFP Analyzer launcher - Windows.
REM Double-click to run. Opens the app in your default browser.

cd /d "%~dp0"
set PORT=3057
set URL=http://localhost:%PORT%

echo Starting RFP Analyzer...
echo   URL: %URL%
echo   Close this window to stop the server.
echo.

start "" %URL%

where python >nul 2>nul
if %ERRORLEVEL%==0 (
  python -m http.server %PORT%
  goto :eof
)

where py >nul 2>nul
if %ERRORLEVEL%==0 (
  py -m http.server %PORT%
  goto :eof
)

echo Could not find Python. Install Python 3 from https://python.org
pause

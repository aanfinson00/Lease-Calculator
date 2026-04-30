#!/bin/bash
# RFP Analyzer launcher — Mac.
# Double-click to run. Opens the app in your default browser.
#
# Why we need this: modern browsers block ES module loading from file://
# URLs for security reasons, so just double-clicking index.html won't work.
# This script spins up a tiny local web server (using built-in Python) and
# points your browser at it. Nothing leaves your machine.

set -e
cd "$(dirname "$0")"

PORT=3057
URL="http://localhost:$PORT"

echo "Starting RFP Analyzer..."
echo "  URL: $URL"
echo "  Press Ctrl+C in this window to stop the server."
echo ""

# Open the browser shortly after the server starts.
( sleep 1 && open "$URL" ) &

if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  python -m SimpleHTTPServer "$PORT"
else
  echo "Could not find Python. Install Python 3 from https://python.org"
  echo "Press Enter to exit..."
  read
fi

# RFP Analyzer launcher — pure PowerShell static HTTP server.
#
# Why this exists: Windows doesn't ship with Python or Node, and modern
# browsers refuse to load ES modules from file:// URLs. PowerShell IS built
# into Windows 10/11, so this script spins up a tiny local HTTP server using
# .NET's HttpListener — no dependencies, no installs.
#
# Listens on http://localhost:3057 and serves files from this folder.

$ErrorActionPreference = "Stop"
$Port = 3057
$Url  = "http://localhost:$Port/"
$Root = $PSScriptRoot

# Common MIME types — covers everything the static export emits.
$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "application/javascript"
  ".mjs"  = "application/javascript"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".gif"  = "image/gif"
  ".ico"  = "image/x-icon"
  ".woff" = "font/woff"
  ".woff2"= "font/woff2"
  ".ttf"  = "font/ttf"
  ".txt"  = "text/plain; charset=utf-8"
  ".map"  = "application/json"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($Url)

try {
  $listener.Start()
} catch {
  Write-Host "Could not start HTTP server on $Url"
  Write-Host $_.Exception.Message
  Write-Host "Press Enter to exit..."
  [void][System.Console]::ReadLine()
  exit 1
}

Write-Host ""
Write-Host "RFP Analyzer is running at $Url"
Write-Host "Close this window to stop the server."
Write-Host ""

# Open the default browser at the URL.
Start-Process $Url

while ($listener.IsListening) {
  try {
    $context = $listener.GetContext()
    $req  = $context.Request
    $resp = $context.Response

    $relPath = [System.Web.HttpUtility]::UrlDecode($req.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrEmpty($relPath)) { $relPath = "index.html" }

    $candidate = Join-Path $Root $relPath
    # If a directory was requested, serve its index.html (Next "trailingSlash: true").
    if (Test-Path $candidate -PathType Container) {
      $candidate = Join-Path $candidate "index.html"
    }

    if (Test-Path $candidate -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($candidate)
      $ext   = [System.IO.Path]::GetExtension($candidate).ToLower()
      $type  = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }

      $resp.ContentType   = $type
      $resp.ContentLength64 = $bytes.Length
      $resp.StatusCode    = 200
      $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $resp.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("Not found")
      $resp.OutputStream.Write($msg, 0, $msg.Length)
    }

    $resp.OutputStream.Close()
  } catch {
    # Swallow per-request errors so the server keeps running.
    Write-Host "Request error: $($_.Exception.Message)"
  }
}

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root "frontend"

$env:VITE_API_BASE_URL = "http://127.0.0.1:8000/api/v1"

Push-Location $frontend
try {
  npm.cmd run dev -- --host 127.0.0.1 --port 5173
}
finally {
  Pop-Location
}

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\local-env.ps1"
$backend = Join-Path $root "backend"
$python = Join-Path $root "venv\Scripts\python.exe"

& "$PSScriptRoot\start-local-db.ps1"

Push-Location $backend
try {
  & $python manage.py runserver 127.0.0.1:8000
}
finally {
  Pop-Location
}

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\local-env.ps1"
$backend = Join-Path $root "backend"
$python = Join-Path $root "venv\Scripts\python.exe"

Push-Location $backend
try {
  & $python manage.py test $args
}
finally {
  Pop-Location
}

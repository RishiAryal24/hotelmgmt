$ErrorActionPreference = "Stop"

. "$PSScriptRoot\local-env.ps1"
$backend = Join-Path $root "backend"
$python = Join-Path $root "venv\Scripts\python.exe"

Push-Location $backend
try {
  & $python manage.py migrate_schemas --shared
  & $python manage.py bootstrap_public_tenant --include-local-domains
  & $python manage.py bootstrap_tenant_from_env
  & $python manage.py migrate_schemas
  & $python manage.py seed_demo_hotel --domain $env:BOOTSTRAP_TENANT_DOMAIN
  & $python manage.py check
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "Local backend data is ready."
Write-Host "Tenant domain: local.hotel.test"
Write-Host "Login email:   admin@local.test"
Write-Host "Password:      AdminPass12345"

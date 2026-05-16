param(
  [switch]$SkipFrontendBuild
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\local-env.ps1"

$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$python = Join-Path $root "venv\Scripts\python.exe"

function Run-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "==> $Name"
  $global:LASTEXITCODE = 0
  & $Command
  if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE."
  }
  $global:LASTEXITCODE = 0
}

Run-Step "Check local database" {
  & "$PSScriptRoot\start-local-db.ps1"
}

Push-Location $backend
try {
  Run-Step "Django system check" {
    & $python manage.py check
  }

  Run-Step "Check for missing migrations" {
    & $python manage.py makemigrations --check --dry-run
  }

  Run-Step "Apply tenant migrations" {
    & $python manage.py migrate_schemas
  }

  Run-Step "Focused backend tests" {
    & $python manage.py test bookings tenants users
  }
}
finally {
  Pop-Location
}

if (-not $SkipFrontendBuild) {
  Push-Location $frontend
  try {
    Run-Step "Frontend production build" {
      npm.cmd run build
    }
  }
  finally {
    Pop-Location
  }
}

Write-Host ""
Write-Host "Local verification passed."

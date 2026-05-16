$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
. "$PSScriptRoot\local-env.ps1"

$docker = Get-Command docker -ErrorAction SilentlyContinue
if ($docker) {
  Push-Location $root
  try {
    docker compose up -d db redis
  }
  finally {
    Pop-Location
  }

  Write-Host ""
  Write-Host "Local services are running:"
  Write-Host "Postgres: 127.0.0.1:5432"
  Write-Host "Redis:    127.0.0.1:6379"
  exit 0
}

Write-Warning "Docker was not found on PATH. Checking for an existing local PostgreSQL instead."

$postgresPort = Test-NetConnection $env:POSTGRES_HOST -Port ([int]$env:POSTGRES_PORT) -InformationLevel Quiet
if (-not $postgresPort) {
  throw "PostgreSQL is not reachable at $($env:POSTGRES_HOST):$($env:POSTGRES_PORT). Install/start PostgreSQL or Docker, then run scripts\setup-local-postgres.cmd if the database has not been created."
}

$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
  Write-Warning "PostgreSQL is listening, but psql was not found on PATH. Skipping credential check."
}
else {
  $oldPassword = $env:PGPASSWORD
  $env:PGPASSWORD = $env:POSTGRES_PASSWORD
  try {
    psql -h $env:POSTGRES_HOST -p $env:POSTGRES_PORT -U $env:POSTGRES_USER -d $env:POSTGRES_DB -c "select 1;" | Out-Null
  }
  finally {
    $env:PGPASSWORD = $oldPassword
  }
}

$redisPort = Test-NetConnection 127.0.0.1 -Port 6379 -InformationLevel Quiet

Write-Host ""
Write-Host "Local PostgreSQL is ready:"
Write-Host "Postgres: $($env:POSTGRES_HOST):$($env:POSTGRES_PORT)"
Write-Host "Database: $($env:POSTGRES_DB)"
Write-Host "User:     $($env:POSTGRES_USER)"
if ($redisPort) {
  Write-Host "Redis:    127.0.0.1:6379"
}
else {
  Write-Warning "Redis is not reachable at 127.0.0.1:6379. Web/API local development can continue, but Celery workers will need Redis."
}

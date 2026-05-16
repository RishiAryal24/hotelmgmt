param(
  [string]$AdminUser = "postgres",
  [string]$AdminHost = "127.0.0.1",
  [string]$AdminPort = "5432",
  [string]$AdminDatabase = "postgres"
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\local-env.ps1"

$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
  throw "psql was not found on PATH. Install PostgreSQL command-line tools, then try again."
}

$securePassword = Read-Host "PostgreSQL admin password for $AdminUser@$AdminHost" -AsSecureString
$adminPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
)

$oldPassword = $env:PGPASSWORD
$env:PGPASSWORD = $adminPassword

try {
  $roleExists = psql -h $AdminHost -p $AdminPort -U $AdminUser -d $AdminDatabase -tAc "select 1 from pg_roles where rolname = '$($env:POSTGRES_USER)';"
  if (-not $roleExists.Trim()) {
    psql -h $AdminHost -p $AdminPort -U $AdminUser -d $AdminDatabase -c "create role $($env:POSTGRES_USER) with login password '$($env:POSTGRES_PASSWORD)';"
  }
  else {
    psql -h $AdminHost -p $AdminPort -U $AdminUser -d $AdminDatabase -c "alter role $($env:POSTGRES_USER) with login password '$($env:POSTGRES_PASSWORD)';"
  }

  $dbExists = psql -h $AdminHost -p $AdminPort -U $AdminUser -d $AdminDatabase -tAc "select 1 from pg_database where datname = '$($env:POSTGRES_DB)';"
  if (-not $dbExists.Trim()) {
    psql -h $AdminHost -p $AdminPort -U $AdminUser -d $AdminDatabase -c "create database $($env:POSTGRES_DB) owner $($env:POSTGRES_USER);"
  }
  else {
    psql -h $AdminHost -p $AdminPort -U $AdminUser -d $AdminDatabase -c "alter database $($env:POSTGRES_DB) owner to $($env:POSTGRES_USER);"
  }
}
finally {
  $env:PGPASSWORD = $oldPassword
}

Write-Host ""
Write-Host "Local PostgreSQL is configured:"
Write-Host "Database: $($env:POSTGRES_DB)"
Write-Host "User:     $($env:POSTGRES_USER)"
Write-Host "Password: $($env:POSTGRES_PASSWORD)"

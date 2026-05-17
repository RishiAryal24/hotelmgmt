$root = Split-Path -Parent $PSScriptRoot

$env:DJANGO_DEBUG = "True"
$env:POSTGRES_HOST = "127.0.0.1"
$env:POSTGRES_PORT = "5432"
$env:POSTGRES_DB = "hotelmgmt"
$env:POSTGRES_USER = "hotelmgmt_user"
$env:POSTGRES_PASSWORD = "hotelmgmt_pass"
$env:DJANGO_ALLOWED_HOSTS = "localhost,127.0.0.1,local.hotel.test"
$env:CORS_ALLOW_ALL_ORIGINS = "True"
$env:CELERY_BROKER_URL = "redis://127.0.0.1:6379/0"
$env:CELERY_RESULT_BACKEND = "redis://127.0.0.1:6379/0"

$env:BOOTSTRAP_TENANT_NAME = "Local Hotel"
$env:BOOTSTRAP_TENANT_DOMAIN = "local.hotel.test"
$env:BOOTSTRAP_TENANT_ADMIN_EMAIL = "admin@local.test"
$env:BOOTSTRAP_TENANT_ADMIN_PASSWORD = "AdminPass12345"
$env:BOOTSTRAP_TENANT_CURRENCY = "NPR"

"""
Django settings for hotelmgmt project.

This project is configured for schema-based multi-tenancy with django-tenants,
JWT authentication, REST APIs, Redis caching, and modular enterprise extensions.
"""

import os
from pathlib import Path
from corsheaders.defaults import default_headers
import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'replace-this-secret-key')
DEBUG = os.environ.get('DJANGO_DEBUG', 'True').lower() in ['true', '1', 'yes']
ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', '*').split(',')

INSTALLED_APPS = [
    'django_tenants',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'rest_framework_simplejwt',
    'django_filters',
    'drf_yasg',
    'django_ratelimit',
    'tenants',
    'users',
    'accounting',
    'bookings',
    'housekeeping',
    'restaurant',
    'inventory',
    'hrms',
    'api',
]

SHARED_APPS = [
    'django_tenants',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'rest_framework_simplejwt',
    'django_filters',
    'drf_yasg',
    'tenants',
    'users',
    'api',
]

TENANT_APPS = [
    'accounting',
    'bookings',
    'housekeeping',
    'restaurant',
    'inventory',
    'hrms',
    'maintenance',
    'audit.apps.AuditConfig',
    'integrations',
]

INSTALLED_APPS = SHARED_APPS + TENANT_APPS

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'tenants.middleware.TenantHeaderMiddleware',
    'django_tenants.middleware.TenantMainMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'audit.middleware.AuditRequestMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'hotelmgmt.urls'
PUBLIC_SCHEMA_URLCONF = 'hotelmgmt.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'hotelmgmt.wsgi.application'

POSTGRES_ENGINE = 'hotelmgmt.postgresql_backend'
RUNNING_IN_DOCKER = os.path.exists('/.dockerenv') or os.environ.get('RUNNING_IN_DOCKER', '').lower() in ['true', '1', 'yes']

postgres_host = os.environ.get('POSTGRES_HOST')
if not postgres_host:
    postgres_host = 'db' if RUNNING_IN_DOCKER else '127.0.0.1'
elif postgres_host == 'db' and not RUNNING_IN_DOCKER:
    postgres_host = '127.0.0.1'

DATABASE_URL = os.environ.get('DATABASE_URL')
if DATABASE_URL:
    DATABASES = {
        'default': dj_database_url.parse(
            DATABASE_URL,
            engine=POSTGRES_ENGINE,
            conn_max_age=600,
        )
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': POSTGRES_ENGINE,
            'NAME': os.environ.get('POSTGRES_DB', 'hotelmgmt'),
            'USER': os.environ.get('POSTGRES_USER', 'hotelmgmt_user'),
            'PASSWORD': os.environ.get('POSTGRES_PASSWORD', 'hotelmgmt_pass'),
            'HOST': postgres_host,
            'PORT': os.environ.get('POSTGRES_PORT', '5432'),
        }
    }

DATABASE_ROUTERS = ('django_tenants.routers.TenantSyncRouter',)

AUTH_USER_MODEL = 'users.PlatformUser'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.LimitOffsetPagination',
    'PAGE_SIZE': 25,
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/hour',
        'user': '1000/hour',
    },
}

LANGUAGE_CODE = 'en-us'
TIME_ZONE = os.environ.get('DJANGO_TIME_ZONE', 'UTC')
USE_I18N = True
USE_L10N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = os.environ.get(
    'DJANGO_STATICFILES_STORAGE',
    'django.contrib.staticfiles.storage.StaticFilesStorage',
)
SERVE_LOCAL_STATIC = os.environ.get(
    'DJANGO_SERVE_LOCAL_STATIC',
    'False' if DATABASE_URL else 'True',
).lower() in ['true', '1', 'yes']
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

CORS_ALLOW_ALL_ORIGINS = os.environ.get('CORS_ALLOW_ALL_ORIGINS', 'True').lower() in ['true', '1', 'yes']
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',')
    if origin.strip()
]
CORS_ALLOW_HEADERS = list(default_headers) + [
    'x-tenant-domain',
]

CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get('CSRF_TRUSTED_ORIGINS', '').split(',')
    if origin.strip()
]

TENANT_MODEL = 'tenants.Tenant'
TENANT_DOMAIN_MODEL = 'tenants.Domain'
SHOW_PUBLIC_IF_NO_TENANT_FOUND = True

ADMIN_URL = os.environ.get('DJANGO_ADMIN_URL', 'admin/')

# Email Configuration
EMAIL_BACKEND = os.environ.get('EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'noreply@hotelmgmt.com')

# Celery Configuration
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE

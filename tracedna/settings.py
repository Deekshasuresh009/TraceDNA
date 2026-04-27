"""
Django settings for TraceDNA project.
"""
import os
from datetime import timedelta
from pathlib import Path

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'insecure-dev-key-change-in-production')
DEBUG = os.environ.get('DJANGO_DEBUG', 'True').lower() in ('true', '1', 'yes')
ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', '*').split(',')

# --------------------------------------------------------------------------
# APPLICATION DEFINITION
# --------------------------------------------------------------------------
INSTALLED_APPS = [
    'unfold',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party
    'rest_framework',
    'corsheaders',
    'rest_framework_simplejwt.token_blacklist',
    'pgvector.django',
    'django_celery_beat',

    # Local
    'core',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'core.middleware.SSRFProtectionMiddleware',
]

ROOT_URLCONF = 'tracedna.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'tracedna.wsgi.application'

# --------------------------------------------------------------------------
# DATABASE — PostgreSQL with pgvector
# --------------------------------------------------------------------------
DATABASE_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql://tracedna_user:tracedna_pass@localhost:5432/tracedna'
)

# Parse DATABASE_URL manually to avoid adding dj-database-url dependency
_db_parts = DATABASE_URL.replace('postgresql://', '').split('@')
_db_credentials = _db_parts[0].split(':')
_db_host_port_name = _db_parts[1].split('/')
_db_host_port = _db_host_port_name[0].split(':')

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': _db_host_port_name[1] if len(_db_host_port_name) > 1 else 'tracedna',
        'USER': _db_credentials[0] if len(_db_credentials) > 0 else 'tracedna_user',
        'PASSWORD': _db_credentials[1] if len(_db_credentials) > 1 else 'tracedna_pass',
        'HOST': _db_host_port[0] if len(_db_host_port) > 0 else 'localhost',
        'PORT': _db_host_port[1] if len(_db_host_port) > 1 else '5432',
    }
}

# --------------------------------------------------------------------------
# PASSWORD VALIDATION
# --------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# --------------------------------------------------------------------------
# INTERNATIONALIZATION
# --------------------------------------------------------------------------
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# --------------------------------------------------------------------------
# STATIC FILES
# --------------------------------------------------------------------------
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# --------------------------------------------------------------------------
# DJANGO REST FRAMEWORK
# --------------------------------------------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}

# --------------------------------------------------------------------------
# SIMPLE JWT
# --------------------------------------------------------------------------
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'TOKEN_OBTAIN_SERIALIZER': 'rest_framework_simplejwt.serializers.TokenObtainPairSerializer',
}

# --------------------------------------------------------------------------
# CORS
# --------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = os.environ.get(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:3000,http://127.0.0.1:3000'
).split(',')
CORS_ALLOW_CREDENTIALS = True

# --------------------------------------------------------------------------
# CELERY
# --------------------------------------------------------------------------
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/1')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'UTC'
CELERY_TASK_TRACK_STARTED = True
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'

# --------------------------------------------------------------------------
# CELERY BEAT SCHEDULE — Automated Patrol Scanner
# --------------------------------------------------------------------------
from celery.schedules import crontab
CELERY_BEAT_SCHEDULE = {
    'auto-patrol-scan-every-6-hours': {
        'task': 'core.tasks.auto_patrol_scan',
        'schedule': crontab(minute=0, hour='*/6'),
    },
}

# --------------------------------------------------------------------------
# GOOGLE CLOUD STORAGE
# --------------------------------------------------------------------------
GCS_VAULT_BUCKET = os.environ.get('GCS_VAULT_BUCKET', 'tracedna-vault')
GCS_TEMP_BUCKET = os.environ.get('GCS_TEMP_BUCKET', 'tracedna-temp-suspects')

# --------------------------------------------------------------------------
# GOOGLE CLOUD VERTEX AI & GEMINI
# --------------------------------------------------------------------------
GCP_PROJECT_ID = os.environ.get('GCP_PROJECT_ID', '')
GCP_LOCATION = os.environ.get('GCP_LOCATION', 'us-central1')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
RAPIDAPI_KEY = os.environ.get('RAPIDAPI_KEY', '')
YOUTUBE_DATA_API_KEY = os.environ.get('YOUTUBE_DATA_API_KEY', '')

# --------------------------------------------------------------------------
# UPLOAD LIMITS
# --------------------------------------------------------------------------
MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500 MB

# --------------------------------------------------------------------------
# SSRF PROTECTION — Allowed domains for suspect URL scanning
# --------------------------------------------------------------------------
SSRF_ALLOWED_DOMAINS = [
    'youtube.com',
    'youtu.be',
    'vimeo.com',
    'dailymotion.com',
    'twitch.tv',
    'facebook.com',
    'instagram.com',
    'tiktok.com',
    'twitter.com',
    'x.com',
    'w3schools.com',
    'storage.googleapis.com',
]

# --------------------------------------------------------------------------
# UNFOLD (ADMIN UI TOOL)
# --------------------------------------------------------------------------
UNFOLD = {
    "SITE_TITLE": "TraceDNA Admin",
    "SITE_HEADER": "TraceDNA Control Panel",
}

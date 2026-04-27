"""
Celery configuration for TraceDNA.

This module configures the Celery application, sets the broker/backend
from Django settings, and auto-discovers tasks from all installed apps.
"""
import os

from celery import Celery

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tracedna.settings')

app = Celery('tracedna')

# Load task modules from all registered Django apps.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks in all installed apps (looks for tasks.py in each app).
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Debug task to verify Celery is working."""
    print(f'Request: {self.request!r}')

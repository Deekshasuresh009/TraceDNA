"""
Custom validators for the TraceDNA core app.
"""
import re

from django.core.exceptions import ValidationError


def validate_gcs_uri(value):
    """
    Validate that a value is a valid Google Cloud Storage URI (gs://bucket/path).
    
    CRITICAL: Returns early if value is None or empty to support null=True, blank=True fields.
    """
    # Return early for None or empty — allows nullable GCS URI fields
    if value is None or value == '':
        return

    pattern = r'^gs://[a-z0-9][a-z0-9._-]{1,61}[a-z0-9](/.*)?$'
    if not re.match(pattern, value):
        raise ValidationError(
            '%(value)s is not a valid GCS URI. Expected format: gs://bucket-name/optional/path',
            params={'value': value},
        )

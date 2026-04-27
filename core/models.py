"""
TraceDNA Core Models

Database schema for organizations, video assets, fingerprints, and piracy reports.
Uses pgvector for embedding storage and custom GCS URI validation.
"""
import uuid

from django.contrib.auth.models import User
from django.db import models
from pgvector.django import VectorField

from .validators import validate_gcs_uri


class Organization(models.Model):
    """
    An organization (client/tenant) using TraceDNA.
    """
    name = models.CharField(max_length=255, unique=True)
    api_key = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, db_index=True)
    contact_email = models.EmailField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class VideoAsset(models.Model):
    """
    A video asset — either a source (official content) or a suspect (potentially pirated).
    """
    class ProcessingStatus(models.TextChoices):
        PENDING = 'Pending', 'Pending'
        PROCESSING = 'Processing', 'Processing'
        AWAITING_AI_REVIEW = 'Awaiting_AI_Review', 'Awaiting AI Review'
        COMPLETED = 'Completed', 'Completed'
        FAILED = 'Failed', 'Failed'

    title = models.CharField(max_length=500, unique=True)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='video_assets',
    )
    gcs_uri = models.CharField(
        max_length=1024,
        validators=[validate_gcs_uri],
        null=True,
        blank=True,
        help_text='Google Cloud Storage URI (gs://bucket/path)',
    )
    total_duration = models.FloatField(
        null=True,
        blank=True,
        help_text='Total duration in seconds',
    )
    upload_date = models.DateTimeField(auto_now_add=True)
    is_source = models.BooleanField(
        default=False,
        help_text='True if this is official/source content, False if suspect',
    )
    processing_status = models.CharField(
        max_length=20,
        choices=ProcessingStatus.choices,
        default=ProcessingStatus.PENDING,
        db_index=True,
    )
    search_keywords = models.CharField(
        max_length=500,
        blank=True,
        default='',
        help_text='Comma-separated keywords used for automated YouTube patrol scanning',
    )
    last_patrol_scan = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Timestamp of the last automated YouTube search patrol scan for this asset',
    )

    class Meta:
        ordering = ['-upload_date']

    def __str__(self):
        prefix = '[SOURCE]' if self.is_source else '[SUSPECT]'
        return f'{prefix} {self.title}'


class VideoFingerprint(models.Model):
    """
    A Content DNA fingerprint — an embedding vector for a specific time segment of a video.
    Uses pgvector VectorField with 1408 dimensions (Vertex AI multimodalembedding@001 output).
    """
    video_asset = models.ForeignKey(
        VideoAsset,
        on_delete=models.CASCADE,
        related_name='fingerprints',
    )
    start_time = models.FloatField(help_text='Segment start time in seconds')
    end_time = models.FloatField(help_text='Segment end time in seconds')
    embedding_vector = VectorField(dimensions=1408)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('video_asset', 'start_time')
        ordering = ['video_asset', 'start_time']

    def __str__(self):
        return f'Fingerprint [{self.start_time}s-{self.end_time}s] for {self.video_asset.title}'


class PiracyReport(models.Model):
    """
    A piracy analysis report linking a source video to a suspect video,
    including AI-generated reasoning and optional DMCA draft.
    """
    class ReportStatus(models.TextChoices):
        PENDING = 'Pending', 'Pending'
        TAKEDOWN_DRAFTED = 'Takedown_Drafted', 'Takedown Drafted'
        TAKEDOWN_SENT = 'Takedown_Sent', 'Takedown Sent'
        DISMISSED = 'Dismissed', 'Dismissed'

    source_video = models.ForeignKey(
        VideoAsset,
        on_delete=models.CASCADE,
        related_name='source_reports',
        limit_choices_to={'is_source': True},
    )
    suspect_video = models.ForeignKey(
        VideoAsset,
        on_delete=models.CASCADE,
        related_name='suspect_reports',
        limit_choices_to={'is_source': False},
    )
    original_suspect_url = models.CharField(
        max_length=2048,
        help_text='Original URL where the suspect content was found',
    )
    match_confidence = models.FloatField(
        help_text='Cosine similarity match confidence (0.0 to 1.0)',
    )
    gemini_reasoning = models.JSONField(
        null=True,
        blank=True,
        help_text='Structured reasoning output from Gemini 1.5 Pro',
    )
    is_fair_use = models.BooleanField(
        default=False,
        help_text='Whether Gemini determined this is fair use',
    )
    matched_segment_start = models.FloatField(
        null=True, blank=True,
        help_text='Start time (in seconds) of the highest match confidence segment'
    )
    matched_segment_end = models.FloatField(
        null=True, blank=True,
        help_text='End time (in seconds) of the highest match confidence segment'
    )
    dmca_draft = models.TextField(
        null=True,
        blank=True,
        help_text='AI-generated DMCA takedown notice draft',
    )
    status = models.CharField(
        max_length=20,
        choices=ReportStatus.choices,
        default=ReportStatus.PENDING,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return (
            f'Report: {self.source_video.title} vs {self.suspect_video.title} '
            f'({self.match_confidence:.1%} match)'
        )


class Notification(models.Model):
    """
    In-app notification sent to a user when TraceDNA auto-detects a piracy match
    via the automated patrol scanner.
    """
    class NotificationType(models.TextChoices):
        PIRACY_DETECTED = 'piracy_detected', 'Piracy Detected'
        SCAN_COMPLETE = 'scan_complete', 'Scan Complete'
        DMCA_READY = 'dmca_ready', 'DMCA Ready'

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    report = models.ForeignKey(
        PiracyReport,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='notifications',
    )
    notification_type = models.CharField(
        max_length=30,
        choices=NotificationType.choices,
        default=NotificationType.PIRACY_DETECTED,
    )
    message = models.CharField(max_length=500)
    is_read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'[{self.notification_type}] {self.user.username}: {self.message[:60]}'

# -------------------------------------------------------------------
# Live Event Shield Models
# -------------------------------------------------------------------
class LiveEventCampaign(models.Model):
    """
    Represents an active monitoring session for a live streaming event.
    """
    class Status(models.TextChoices):
        ACTIVE = 'Active', 'Active'
        TERMINATED = 'Terminated', 'Terminated'

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='live_campaigns',
    )
    title = models.CharField(max_length=500, help_text="e.g. UFC 300 Main Event")
    search_keywords = models.CharField(max_length=500, help_text="Comma-separated keywords to monitor")
    official_stream_url = models.URLField(
        null=True,
        blank=True,
        help_text='Official live stream URL (YouTube/HLS/m3u8) for visual fingerprint comparison'
    )
    visual_patrol_enabled = models.BooleanField(
        default=False,
        help_text='If True, TraceDNA will visually compare frames from suspect streams against the official feed'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_scanned_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.title} ({self.status})"


class LiveStrike(models.Model):
    """
    Represents a detected pirated live stream on YouTube currently broadcasting.
    """
    campaign = models.ForeignKey(
        LiveEventCampaign,
        on_delete=models.CASCADE,
        related_name='strikes',
    )
    youtube_video_id = models.CharField(max_length=255, unique=True)
    url = models.URLField()
    title = models.CharField(max_length=500)
    channel_name = models.CharField(max_length=500)
    detected_at = models.DateTimeField(auto_now_add=True)
    # Visual fingerprinting fields
    visual_confidence = models.FloatField(
        null=True, blank=True,
        help_text='Frame similarity score 0-100 from perceptual hash comparison'
    )
    is_visual_match = models.BooleanField(
        null=True, blank=True,
        help_text='True if visual fingerprint confirmed piracy, False if keyword-only detection'
    )
    detection_method = models.CharField(
        max_length=20,
        default='keyword',
        help_text='keyword | visual'
    )

    def __str__(self):
        return f"LiveStrike: {self.title} on {self.channel_name} (conf={self.visual_confidence})"

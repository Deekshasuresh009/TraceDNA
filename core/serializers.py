"""
TraceDNA DRF Serializers

Serializers for all core models, including file upload validation
and graph data formatting for React Flow.
"""
from django.conf import settings
from rest_framework import serializers

from django.contrib.auth.models import User

from .models import (
    Notification,
    Organization,
    VideoAsset,
    VideoFingerprint,
    LiveEventCampaign,
    LiveStrike,
    PiracyReport,
)


# -------------------------------------------------------------------
# User Authentication
# -------------------------------------------------------------------
class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ('username', 'password', 'email')

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            password=validated_data['password'],
            email=validated_data.get('email', '')
        )
        return user


# -------------------------------------------------------------------
# Organization
# -------------------------------------------------------------------
class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ['id', 'name', 'api_key', 'contact_email', 'created_at']
        read_only_fields = ['id', 'api_key', 'created_at']


# -------------------------------------------------------------------
# Video Asset
# -------------------------------------------------------------------
class VideoAssetSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source='organization.name', read_only=True)

    class Meta:
        model = VideoAsset
        fields = [
            'id', 'title', 'organization', 'organization_name',
            'gcs_uri', 'total_duration', 'upload_date',
            'is_source', 'processing_status', 'search_keywords', 'last_patrol_scan'
        ]
        read_only_fields = ['id', 'upload_date', 'processing_status', 'gcs_uri']


# -------------------------------------------------------------------
# Video Upload (file upload for vault)
# -------------------------------------------------------------------
class VideoUploadSerializer(serializers.Serializer):
    """Validates MP4 file uploads with size limit enforcement."""
    title = serializers.CharField(max_length=500)
    video_file = serializers.FileField()

    def validate_title(self, value):
        from .models import VideoAsset
        if VideoAsset.objects.filter(title=value).exists():
            raise serializers.ValidationError('Title already taken. Please provide a unique title.')
        return value

    def validate_video_file(self, value):
        # Enforce 500MB max upload size
        max_size = getattr(settings, 'MAX_UPLOAD_SIZE', 500 * 1024 * 1024)
        if value.size > max_size:
            raise serializers.ValidationError(
                f'File size ({value.size / (1024*1024):.1f}MB) exceeds '
                f'maximum allowed size ({max_size / (1024*1024):.0f}MB).'
            )

        # Enforce MP4 content type
        allowed_types = ['video/mp4']
        if value.content_type not in allowed_types:
            raise serializers.ValidationError(
                f'Invalid file type: {value.content_type}. Only MP4 files are accepted.'
            )

        return value


# -------------------------------------------------------------------
# Suspect URL Scan
# -------------------------------------------------------------------
class ScanURLSerializer(serializers.Serializer):
    """Validates suspect URL scan requests."""
    suspect_url = serializers.URLField(max_length=2048)
    source_video_title = serializers.CharField(max_length=500)

    def validate_source_video_title(self, value):
        try:
            source = VideoAsset.objects.get(title=value, is_source=True)
        except VideoAsset.DoesNotExist:
            raise serializers.ValidationError(
                f"Source video with title '{value}' does not exist or is not a source video."
            )
        return value


# -------------------------------------------------------------------
# Piracy Report
# -------------------------------------------------------------------
class PiracyReportSerializer(serializers.ModelSerializer):
    source_video_title = serializers.CharField(source='source_video.title', read_only=True)
    suspect_video_title = serializers.CharField(source='suspect_video.title', read_only=True)
    source_video_status = serializers.CharField(source='source_video.processing_status', read_only=True)
    suspect_video_status = serializers.CharField(source='suspect_video.processing_status', read_only=True)
    source_video_url = serializers.SerializerMethodField()
    suspect_video_url = serializers.SerializerMethodField()

    def _get_signed_url(self, gcs_uri):
        """Generate a 15-minute signed URL for a gs:// GCS path."""
        if not gcs_uri:
            return None
        try:
            from google.cloud import storage
            import datetime
            client = storage.Client()
            parts = gcs_uri.replace('gs://', '').split('/', 1)
            bucket = client.bucket(parts[0])
            blob = bucket.blob(parts[1])
            return blob.generate_signed_url(
                expiration=datetime.timedelta(minutes=15),
                method='GET',
                version='v4',
            )
        except Exception:
            return None

    def get_source_video_url(self, obj):
        return self._get_signed_url(obj.source_video.gcs_uri if obj.source_video else None)

    def get_suspect_video_url(self, obj):
        return self._get_signed_url(obj.suspect_video.gcs_uri if obj.suspect_video else None)

    class Meta:
        model = PiracyReport
        fields = [
            'id', 'source_video', 'source_video_title', 'source_video_status', 'source_video_url',
            'suspect_video', 'suspect_video_title', 'suspect_video_status', 'suspect_video_url',
            'original_suspect_url', 'match_confidence',
            'gemini_reasoning', 'is_fair_use',
            'matched_segment_start', 'matched_segment_end',
            'dmca_draft', 'status',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at',
            'source_video_title', 'suspect_video_title',
            'source_video_status', 'suspect_video_status',
            'source_video_url', 'suspect_video_url',
        ]


# -------------------------------------------------------------------
# DMCA Generation Request (minimal — just needs report ID)
# -------------------------------------------------------------------
class DMCAGenerateSerializer(serializers.Serializer):
    """No input fields needed — report ID comes from URL."""
    pass


# -------------------------------------------------------------------
# Graph Data (React Flow format)
# -------------------------------------------------------------------
class GraphNodeSerializer(serializers.Serializer):
    id = serializers.CharField()
    type = serializers.CharField()
    position = serializers.DictField()
    data = serializers.DictField()


class GraphEdgeSerializer(serializers.Serializer):
    id = serializers.CharField()
    source = serializers.CharField()
    target = serializers.CharField()
    animated = serializers.BooleanField(default=True)
    label = serializers.CharField(required=False)
    style = serializers.DictField(required=False)


class GraphDataSerializer(serializers.Serializer):
    nodes = GraphNodeSerializer(many=True)
    edges = GraphEdgeSerializer(many=True)


# -------------------------------------------------------------------
# Notification
# -------------------------------------------------------------------
class NotificationSerializer(serializers.ModelSerializer):
    report_id = serializers.IntegerField(source='report.id', read_only=True, allow_null=True)
    source_video_title = serializers.CharField(
        source='report.source_video.title', read_only=True, allow_null=True
    )
    match_confidence = serializers.FloatField(
        source='report.match_confidence', read_only=True, allow_null=True
    )
    suspect_url = serializers.CharField(
        source='report.original_suspect_url', read_only=True, allow_null=True
    )

    class Meta:
        model = Notification
        fields = [
            'id', 'notification_type', 'message', 'is_read', 'created_at',
            'report_id', 'source_video_title', 'match_confidence', 'suspect_url',
        ]
        read_only_fields = ['id', 'created_at']

# -------------------------------------------------------------------
# Live Event Shield
# -------------------------------------------------------------------
class LiveStrikeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LiveStrike
        fields = ['id', 'youtube_video_id', 'url', 'title', 'channel_name', 'detected_at',
                  'visual_confidence', 'is_visual_match', 'detection_method']
        read_only_fields = ['id', 'detected_at']


class LiveEventCampaignSerializer(serializers.ModelSerializer):
    strikes = serializers.SerializerMethodField()

    class Meta:
        model = LiveEventCampaign
        fields = [
            'id', 'title', 'search_keywords', 'official_stream_url', 
            'visual_patrol_enabled', 'status', 'created_at', 'last_scanned_at', 'strikes'
        ]
        read_only_fields = ['id', 'created_at', 'last_scanned_at']

    def get_strikes(self, obj):
        strikes = obj.strikes.all().order_by('-detected_at')
        # If visual mode is active, filter out suspected keyword matches that aren't visually confirmed
        if obj.visual_patrol_enabled and obj.official_stream_url:
            strikes = strikes.filter(is_visual_match=True)
        return LiveStrikeSerializer(strikes, many=True).data

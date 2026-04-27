"""
TraceDNA Admin Configuration
"""
from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Organization, VideoAsset, VideoFingerprint, PiracyReport


@admin.register(Organization)
class OrganizationAdmin(ModelAdmin):
    list_display = ('name', 'api_key', 'contact_email', 'created_at')
    search_fields = ('name', 'contact_email')
    readonly_fields = ('api_key', 'created_at', 'updated_at')


@admin.register(VideoAsset)
class VideoAssetAdmin(ModelAdmin):
    list_display = ('title', 'organization', 'is_source', 'processing_status', 'upload_date')
    list_filter = ('is_source', 'processing_status', 'organization')
    search_fields = ('title',)
    readonly_fields = ('upload_date',)


@admin.register(VideoFingerprint)
class VideoFingerprintAdmin(ModelAdmin):
    list_display = ('video_asset', 'start_time', 'end_time', 'created_at')
    list_filter = ('video_asset__is_source',)
    raw_id_fields = ('video_asset',)


@admin.register(PiracyReport)
class PiracyReportAdmin(ModelAdmin):
    list_display = ('source_video', 'suspect_video', 'match_confidence', 'is_fair_use', 'status', 'created_at')
    list_filter = ('status', 'is_fair_use')
    raw_id_fields = ('source_video', 'suspect_video')
    readonly_fields = ('created_at', 'updated_at')

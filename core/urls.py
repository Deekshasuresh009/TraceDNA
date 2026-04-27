"""
TraceDNA Core URL Patterns

CRITICAL: /api/reports/graph/ is defined BEFORE /api/reports/<id>/
to prevent Django from matching 'graph' as an integer pattern.
"""
from django.urls import path

from .views import (
    LoginView,
    NotificationListView,
    PatrolScanView,
    PiracyReportListView,
    RefreshTokenView,
    SignupView,
    VaultUploadView,
    VaultAssetListView,
    generate_dmca_view,
    mark_notifications_read,
    reports_graph_view,
    trigger_auto_patrol,
    LiveEventCampaignViewSet,
)
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register(r'live', LiveEventCampaignViewSet, basename='live_campaign')

urlpatterns = [
    # --- Authentication ---
    path('auth/login/', LoginView.as_view(), name='token_obtain_pair'),
    path('auth/signup/', SignupView.as_view(), name='signup'),
    path('auth/refresh/', RefreshTokenView.as_view(), name='token_refresh'),

    # --- Vault (Source Video Upload) ---
    path('vault/upload/', VaultUploadView.as_view(), name='vault_upload'),
    path('vault/assets/', VaultAssetListView.as_view(), name='vault_assets'),

    # --- Patrol (Suspect URL Scanning) ---
    path('patrol/scan-url/', PatrolScanView.as_view(), name='patrol_scan'),

    # --- Reports ---
    path('reports/', PiracyReportListView.as_view(), name='report_list'),

    # CRITICAL: graph/ MUST come BEFORE <int:pk>/ to avoid pattern conflict
    path('reports/graph/', reports_graph_view, name='report_graph'),
    path('reports/<int:pk>/generate-dmca/', generate_dmca_view, name='generate_dmca'),

    # --- Notifications ---
    path('notifications/', NotificationListView.as_view(), name='notification_list'),
    path('notifications/mark-read/', mark_notifications_read, name='notifications_mark_read'),

    # --- Auto-Patrol ---
    path('patrol/auto-scan/', trigger_auto_patrol, name='auto_patrol'),
] + router.urls

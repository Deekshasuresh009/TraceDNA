"""
TraceDNA API Views

RESTful endpoints for authentication, vault uploads, patrol scanning,
piracy reports, graph visualization, and DMCA generation.
"""
import logging

from django.conf import settings
from google.cloud import storage as gcs_storage
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .middleware import validate_url_ssrf
from .models import Notification, Organization, PiracyReport, VideoAsset
from .serializers import (
    DMCAGenerateSerializer,
    GraphDataSerializer,
    NotificationSerializer,
    PiracyReportSerializer,
    ScanURLSerializer,
    VideoAssetSerializer,
    VideoUploadSerializer,
    UserCreateSerializer,
)
from .tasks import analyze_suspect_video, auto_patrol_scan, extract_source_dna

logger = logging.getLogger(__name__)


# -------------------------------------------------------------------
# Authentication — JWT Token endpoints
# -------------------------------------------------------------------
class LoginView(TokenObtainPairView):
    """
    POST /api/auth/login/
    Issue JWT access and refresh tokens.
    """
    permission_classes = [AllowAny]


class RefreshTokenView(TokenRefreshView):
    """
    POST /api/auth/refresh/
    Refresh an expired access token using a valid refresh token.
    """
    permission_classes = [AllowAny]


class SignupView(generics.CreateAPIView):
    """
    POST /api/auth/signup/
    Registers a new user.
    """
    serializer_class = UserCreateSerializer
    permission_classes = [AllowAny]


# -------------------------------------------------------------------
# Vault — Source Video Upload
# -------------------------------------------------------------------
class VaultUploadView(generics.CreateAPIView):
    """
    POST /api/vault/upload/

    Accepts MP4 file (max 500MB), uploads to GCS 'vault' bucket,
    creates VideoAsset (Is_Source=True, Status=Pending),
    and triggers the extract_source_dna Celery task.
    """
    serializer_class = VideoUploadSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        video_file = serializer.validated_data['video_file']
        title = serializer.validated_data['title']

        # Resolve organization from user (assumes user has an org profile)
        # For now, get or create a default org tied to the user
        org = self._get_user_organization(request.user)

        # Upload to GCS vault bucket
        bucket_name = settings.GCS_VAULT_BUCKET
        blob_path = f'sources/{org.id}/{video_file.name}'
        gcs_uri = f'gs://{bucket_name}/{blob_path}'

        try:
            client = gcs_storage.Client()
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(blob_path)
            blob.upload_from_file(video_file, content_type=video_file.content_type)
        except Exception as e:
            logger.error(f'GCS upload failed: {e}')
            return Response(
                {'error': f'Failed to upload video to cloud storage: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Create VideoAsset record
        video_asset = VideoAsset.objects.create(
            title=title,
            organization=org,
            gcs_uri=gcs_uri,
            is_source=True,
            processing_status=VideoAsset.ProcessingStatus.PENDING,
        )

        # Trigger background DNA extraction
        extract_source_dna.delay(video_asset.id)

        return Response(
            {
                'message': 'Video uploaded successfully. DNA extraction has been queued.',
                'video_asset': VideoAssetSerializer(video_asset).data,
            },
            status=status.HTTP_201_CREATED,
        )

    def _get_user_organization(self, user):
        """
        Resolve the organization for the authenticated user.
        Creates a default organization if none exists.
        """
        org, _ = Organization.objects.get_or_create(
            name=f'org-{user.id}',
            defaults={'contact_email': user.email or f'{user.username}@tracedna.local'},
        )
        return org
        
class VaultAssetListView(generics.ListAPIView):
    """
    GET /api/vault/assets/
    Returns a list of all official Source VideoAssets for the user's organization.
    """
    serializer_class = VideoAssetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return VideoAsset.objects.filter(
            organization__name=f'org-{self.request.user.id}',
            is_source=True
        ).order_by('-upload_date')


# -------------------------------------------------------------------
# Patrol — Suspect URL Scanning
# -------------------------------------------------------------------
class PatrolScanView(generics.CreateAPIView):
    """
    POST /api/patrol/scan-url/

    Accepts suspect_url and REQUIRED source_video_id.
    Validates URL against SSRF middleware.
    Creates suspect VideoAsset and triggers analyze_suspect_video.
    """
    serializer_class = ScanURLSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        suspect_url = serializer.validated_data['suspect_url']
        source_video_title = serializer.validated_data['source_video_title']
        
        # Validated by serializer, safe to .get()
        source_video = VideoAsset.objects.get(title=source_video_title, is_source=True)
        source_video_id = source_video.id

        # SSRF validation (defense-in-depth — middleware also checks)
        is_safe, error_msg = validate_url_ssrf(suspect_url)
        if not is_safe:
            return Response(
                {'error': f'SSRF Protection: {error_msg}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Resolve organization from JWT user
        org = self._get_user_organization(request.user)

        # Create suspect VideoAsset with GCS_URI=None (will be set during task)
        suspect_asset = VideoAsset.objects.create(
            title=f'Suspect from {suspect_url[:100]}',
            organization=org,
            is_source=False,
            processing_status=VideoAsset.ProcessingStatus.PENDING,
            gcs_uri=None,  # Set during task processing
        )

        # Trigger background analysis
        analyze_suspect_video.delay(
            suspect_asset.id,
            suspect_url,
            source_video_id,
        )

        return Response(
            {
                'message': 'Suspect video scan has been queued for analysis.',
                'suspect_asset': VideoAssetSerializer(suspect_asset).data,
                'source_video_id': source_video_id,
            },
            status=status.HTTP_202_ACCEPTED,
        )

    def _get_user_organization(self, user):
        org, _ = Organization.objects.get_or_create(
            name=f'org-{user.id}',
            defaults={'contact_email': user.email or f'{user.username}@tracedna.local'},
        )
        return org


# -------------------------------------------------------------------
# Reports — Piracy Report List
# -------------------------------------------------------------------
class PiracyReportListView(generics.ListAPIView):
    """
    GET /api/reports/

    Fetch paginated PiracyReport data.
    """
    serializer_class = PiracyReportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return PiracyReport.objects.select_related(
            'source_video', 'suspect_video',
            'source_video__organization',
        ).filter(source_video__organization__name=f'org-{self.request.user.id}').order_by('-created_at')

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        
        # Only inject pending scans on the first page
        page = request.query_params.get('page')
        if not page or page == '1':
            org_name = f'org-{request.user.id}'
            
            # Fetch ALL suspect scans that don't have a report yet
            # This includes active scans, failed scans, and scans that found no match (Completed)
            from django.db.models import Exists, OuterRef
            pending_suspects = VideoAsset.objects.filter(
                organization__name=org_name,
                is_source=False,
            ).filter(
                ~Exists(PiracyReport.objects.filter(suspect_video_id=OuterRef('id')))
            ).order_by('-upload_date')
            
            mock_reports_active = []   # Still scanning
            mock_reports_done = []     # Completed with no match / failed
            for suspect in pending_suspects:
                if suspect.processing_status == 'Failed':
                    label = 'Scan Failed'
                    status = 'Dismissed'
                    confidence = 0
                elif suspect.processing_status == 'Completed':
                    label = 'No pirated content found'
                    status = 'Resolved'
                    confidence = 0
                else: # Pending, Processing, Awaiting_AI_Review
                    label = suspect.title.replace('Suspect from ', '') if 'Suspect from' in suspect.title else 'Pending validation'
                    status = 'Pending'
                    confidence = None

                entry = {
                    'id': f'scanning-{suspect.id}',
                    'source_video_title': 'Scanning signature...' if confidence is None else 'Analysis Complete',
                    'suspect_video_title': suspect.title,
                    'original_suspect_url': label,
                    'match_confidence': confidence,
                    'is_fair_use': False,
                    'status': status,
                    'created_at': suspect.upload_date,
                }

                if confidence is None:
                    mock_reports_active.append(entry)
                else:
                    mock_reports_done.append(entry)

            # Order: active scans first → real piracy reports → completed/failed mocks last
            response.data['results'] = mock_reports_active + response.data['results'] + mock_reports_done
            
        return response


# -------------------------------------------------------------------
# Reports — Graph Data for React Flow
# -------------------------------------------------------------------
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def reports_graph_view(request):
    """
    GET /api/reports/graph/

    Returns JSON formatted strictly with 'nodes' and 'edges' for React Flow.
    Custom node types: 'sourceNode' (green), 'piracyNode' (red), 'fairUseNode' (yellow).
    """
    reports = PiracyReport.objects.select_related(
        'source_video', 'suspect_video',
    ).filter(source_video__organization__name=f'org-{request.user.id}')

    nodes = {}
    edges = []

    for idx, report in enumerate(reports):
        # Source node (green — official content)
        source_id = f'source-{report.source_video.id}'
        if source_id not in nodes:
            nodes[source_id] = {
                'id': source_id,
                'type': 'sourceNode',
                'position': {'x': 0, 'y': len(nodes) * 150},
                'data': {
                    'label': report.source_video.title,
                    'status': report.source_video.processing_status,
                    'videoId': report.source_video.id,
                },
            }

        # Suspect node — type depends on fair use determination
        suspect_id = f'suspect-{report.suspect_video.id}'
        if suspect_id not in nodes:
            node_type = 'fairUseNode' if report.is_fair_use else 'piracyNode'
            nodes[suspect_id] = {
                'id': suspect_id,
                'type': node_type,
                'position': {'x': 400, 'y': idx * 150},
                'data': {
                    'label': report.suspect_video.title,
                    'status': report.suspect_video.processing_status,
                    'matchConfidence': report.match_confidence,
                    'isFairUse': report.is_fair_use,
                    'reportStatus': report.status,
                    'videoId': report.suspect_video.id,
                    'url': report.original_suspect_url,
                },
            }

        # Edge connecting source → suspect
        edge_color = '#facc15' if report.is_fair_use else '#ef4444'
        edges.append({
            'id': f'edge-{report.id}',
            'source': source_id,
            'target': suspect_id,
            'animated': True,
            'label': f'{report.match_confidence:.0%}',
            'style': {'stroke': edge_color, 'strokeWidth': 2},
        })

    graph_data = {
        'nodes': list(nodes.values()),
        'edges': edges,
    }

    serializer = GraphDataSerializer(data=graph_data)
    serializer.is_valid(raise_exception=True)

    return Response(serializer.validated_data)


# -------------------------------------------------------------------
# Reports — DMCA Draft Generation
# -------------------------------------------------------------------
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_dmca_view(request, pk):
    """
    POST /api/reports/<id>/generate-dmca/

    Idempotency Guard: Returns 400 if status is already Takedown_Drafted or Takedown_Sent.
    Passes report data to Gemini 1.5 Pro to draft a DMCA notice.
    """
    try:
        report = PiracyReport.objects.select_related(
            'source_video', 'suspect_video',
        ).get(pk=pk, source_video__organization__name=f'org-{request.user.id}')
    except PiracyReport.DoesNotExist:
        return Response(
            {'error': f'Piracy report with ID {pk} not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Idempotency guard — prevent duplicate DMCA generation
    if report.status in [
        PiracyReport.ReportStatus.TAKEDOWN_DRAFTED,
        PiracyReport.ReportStatus.TAKEDOWN_SENT,
    ]:
        return Response(
            {
                'error': (
                    f'DMCA draft already exists. Current status: {report.status}. '
                    f'Cannot regenerate for reports in Takedown_Drafted or Takedown_Sent state.'
                ),
                'dmca_draft': report.dmca_draft,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Generate DMCA draft using google-genai
    try:
        import google.genai as genai
        import google.genai.types as genai_types

        client = genai.Client(api_key=settings.GEMINI_API_KEY)

        prompt = f"""You are a legal assistant specializing in digital copyright law (DMCA).

Draft a formal DMCA takedown notice based on the following information:

**Original Content URL/Title:** {report.source_video.title}
**Infringing Content URL:** {report.original_suspect_url}
**Match Confidence:** {report.match_confidence:.1%}
**AI Analysis:** {report.gemini_reasoning}

The notice must include:
1. Identification of the copyrighted work
2. Identification of the infringing material with its URL
3. Contact information placeholder for the copyright owner
4. Good faith statement
5. Accuracy statement under penalty of perjury
6. Physical or electronic signature placeholder

Format as a professional legal document ready for submission."""

        response = client.models.generate_content(
            model='gemini-2.5-pro',
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                max_output_tokens=2048,
                temperature=0.2,
            )
        )

        dmca_draft = response.text

    except Exception as e:
        logger.error(f'Gemini DMCA generation failed: {e}')
        # Fallback to template-based DMCA draft
        dmca_draft = _generate_fallback_dmca(report)

    # Save DMCA draft and update status
    report.dmca_draft = dmca_draft
    report.status = PiracyReport.ReportStatus.TAKEDOWN_DRAFTED
    report.save(update_fields=['dmca_draft', 'status', 'updated_at'])

    return Response(
        {
            'message': 'DMCA takedown notice drafted successfully.',
            'report': PiracyReportSerializer(report).data,
        },
        status=status.HTTP_200_OK,
    )


def _generate_fallback_dmca(report):
    """Generate a template-based DMCA notice as fallback when Gemini is unavailable."""
    return f"""DMCA TAKEDOWN NOTICE

Date: [CURRENT DATE]

To Whom It May Concern:

I am writing to notify you of copyright infringement on your platform.

1. COPYRIGHTED WORK
The original copyrighted work is: "{report.source_video.title}"

2. INFRINGING MATERIAL
The infringing material is located at:
{report.original_suspect_url}

Our automated analysis has determined a {report.match_confidence:.1%} match confidence
between the original and infringing content.

3. CONTACT INFORMATION
[COPYRIGHT OWNER NAME]
[ADDRESS]
[EMAIL]
[PHONE]

4. GOOD FAITH STATEMENT
I have a good faith belief that use of the copyrighted material described above
on the allegedly infringing web pages is not authorized by the copyright owner,
its agent, or the law.

5. ACCURACY STATEMENT
I swear, under penalty of perjury, that the information in this notification
is accurate and that I am the copyright owner, or am authorized to act on
behalf of the owner, of an exclusive right that is allegedly infringed.

6. SIGNATURE
[ELECTRONIC SIGNATURE]
[PRINTED NAME]
[DATE]
"""


# -------------------------------------------------------------------
# Notifications — List
# -------------------------------------------------------------------
class NotificationListView(generics.ListAPIView):
    """
    GET /api/notifications/
    Returns paginated notifications for the authenticated user.
    Includes unread count in response header.
    """
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(
            user=self.request.user
        ).order_by('-created_at')

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        unread_count = Notification.objects.filter(
            user=request.user, is_read=False
        ).count()
        response.data['unread_count'] = unread_count
        return response


# -------------------------------------------------------------------
# Notifications — Mark Read
# -------------------------------------------------------------------
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def mark_notifications_read(request):
    """
    PATCH /api/notifications/mark-read/
    Marks all unread notifications for the user as read.
    """
    updated = Notification.objects.filter(
        user=request.user, is_read=False
    ).update(is_read=True)
    return Response({'marked_read': updated})


# -------------------------------------------------------------------
# Patrol — Manual Trigger Auto-Scan
# -------------------------------------------------------------------
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def trigger_auto_patrol(request):
    """
    POST /api/patrol/auto-scan/
    Manually triggers the auto_patrol_scan Celery task for the user's vault.
    """
    auto_patrol_scan.delay()
    return Response(
        {'message': 'Auto-patrol scan has been queued. Results will appear in Reports within minutes.'},
        status=status.HTTP_202_ACCEPTED,
    )


# -------------------------------------------------------------------
# Live Event Shield
# -------------------------------------------------------------------
from rest_framework import viewsets
from rest_framework.decorators import action
from django.utils import timezone
from .models import LiveEventCampaign, LiveStrike
from .serializers import LiveEventCampaignSerializer
from .youtube_search import search_youtube_live

class LiveEventCampaignViewSet(viewsets.ModelViewSet):
    serializer_class = LiveEventCampaignSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        org_name = f'org-{self.request.user.id}'
        return LiveEventCampaign.objects.filter(organization__name=org_name).order_by('-created_at')

    def perform_create(self, serializer):
        org, _ = Organization.objects.get_or_create(
            name=f'org-{self.request.user.id}',
            defaults={'contact_email': self.request.user.email}
        )
        serializer.save(organization=org)

    @action(detail=True, methods=['post'])
    def terminate(self, request, pk=None):
        campaign = self.get_object()
        campaign.status = LiveEventCampaign.Status.TERMINATED
        campaign.save()
        return Response({'status': 'terminated'})

    @action(detail=True, methods=['get'])
    def scan(self, request, pk=None):
        """
        Force-triggers a live search using the campaign's search keywords.
        If official_stream_url is set and visual_patrol_enabled=True,
        TraceDNA will also visually compare frames to confirm piracy.
        """
        campaign = self.get_object()
        if campaign.status != LiveEventCampaign.Status.ACTIVE:
            return Response({'error': 'Campaign is not active.'}, status=400)

        # Hit the YouTube Live Search API
        results = search_youtube_live(campaign.search_keywords, max_results=10)

        visual_mode = campaign.visual_patrol_enabled and bool(campaign.official_stream_url)
        if visual_mode:
            from .live_fingerprint import compare_live_streams

        new_strikes = []
        for res in results:
            strike, created = LiveStrike.objects.get_or_create(
                campaign=campaign,
                youtube_video_id=res['video_id'],
                defaults={
                    'url': res['url'],
                    'title': res['title'],
                    'channel_name': res['channel'],
                    'detection_method': 'keyword',
                }
            )

            # Run visual fingerprinting for NEW strikes when official feed is provided
            if created and visual_mode:
                try:
                    logger.info(f"[LIVE VISUAL] Comparing official feed vs {res['url']}")
                    result = compare_live_streams(campaign.official_stream_url, res['url'])
                    strike.visual_confidence = result['confidence']
                    strike.is_visual_match = result['is_match']
                    strike.detection_method = 'visual'
                    strike.save(update_fields=['visual_confidence', 'is_visual_match', 'detection_method'])

                    # Only keep the strike if there is a visual match
                    # (optional: remove keyword-only false positives)
                    if not result['is_match']:
                        logger.info(f"[LIVE VISUAL] Low confidence ({result['confidence']}%) — keeping as suspected, not confirmed.")
                except Exception as e:
                    logger.error(f"[LIVE VISUAL] Visual comparison failed: {e}")

            if created:
                if visual_mode:
                    # In visual mode, only return the strike if it's a confirmed match
                    if strike.is_visual_match:
                        new_strikes.append(strike)
                else:
                    # In keyword mode, all new detections are threats
                    new_strikes.append(strike)

        campaign.last_scanned_at = timezone.now()
        campaign.save(update_fields=['last_scanned_at'])

        return Response({
            'message': f'Scanned {len(results)} active streams. Found {len(new_strikes)} new threats. Visual mode: {visual_mode}',
            'campaign': LiveEventCampaignSerializer(campaign).data
        })

    @action(detail=False, methods=['post'])
    def extract_metadata(self, request):
        """
        Takes a YouTube Live URL and returns suggested title and keywords.
        Used for the frontend Magic Auto-fill feature.
        """
        url = request.data.get('url')
        if not url:
            return Response({'error': 'URL is required.'}, status=400)

        from .metadata_utils import extract_live_metadata
        data = extract_live_metadata(url)

        if 'error' in data:
            return Response(data, status=400)

        return Response(data)

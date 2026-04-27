"""
TraceDNA Celery Tasks — Full Implementation

Background workers for video fingerprinting, suspect analysis, and AI-powered reasoning.

CRITICAL: google.api_core.exceptions is imported at module level for retry decorators.
"""
import logging
import os
import subprocess
import tempfile

import google.api_core.exceptions
import numpy as np
import requests
from celery import shared_task
from django.conf import settings
from google.cloud import storage as gcs_storage

logger = logging.getLogger(__name__)


def _get_gcs_client():
    """Get a lazy-initialized GCS client."""
    return gcs_storage.Client()


def _get_embedding_model():
    """Initialize and return the Vertex AI multimodal embedding model."""
    import vertexai
    from vertexai.vision_models import MultiModalEmbeddingModel

    vertexai.init(
        project=settings.GCP_PROJECT_ID,
        location=settings.GCP_LOCATION,
    )
    return MultiModalEmbeddingModel.from_pretrained('multimodalembedding@001')


def _get_video_duration(file_path: str) -> float:
    """Get video duration in seconds using ffprobe."""
    result = subprocess.run(
        [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            file_path,
        ],
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def _chunk_video(file_path: str, chunk_duration: float = 5.0) -> list[dict]:
    """
    Chunk a video into segments of N seconds using ffmpeg.

    Returns a list of dicts: {'path': str, 'start_time': float, 'end_time': float}
    """
    duration = _get_video_duration(file_path)
    chunks = []
    start = 0.0

    temp_dir = tempfile.mkdtemp(prefix='tracedna_chunks_')

    while start < duration:
        end = min(start + chunk_duration, duration)
        chunk_filename = f'chunk_{start:.1f}_{end:.1f}.mp4'
        chunk_path = os.path.join(temp_dir, chunk_filename)

        subprocess.run(
            [
                'ffmpeg', '-y',
                '-ss', str(start),
                '-i', file_path,
                '-t', str(chunk_duration),
                '-c', 'copy',
                '-avoid_negative_ts', '1',
                chunk_path,
            ],
            capture_output=True,
            check=True,
        )

        chunks.append({
            'path': chunk_path,
            'start_time': start,
            'end_time': end,
        })
        start = end

    return chunks


def _upload_to_gcs(bucket_name: str, blob_path: str, local_path: str) -> str:
    """Upload a local file to GCS and return the gs:// URI."""
    client = _get_gcs_client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_path)
    blob.upload_from_filename(local_path)
    return f'gs://{bucket_name}/{blob_path}'


def _delete_gcs_prefix(bucket_name: str, prefix: str):
    """Delete all blobs under a GCS prefix."""
    client = _get_gcs_client()
    bucket = client.bucket(bucket_name)
    blobs = list(bucket.list_blobs(prefix=prefix))
    for blob in blobs:
        blob.delete()
    logger.info(f'Deleted {len(blobs)} blobs from gs://{bucket_name}/{prefix}')


def _get_video_embedding(gcs_uri: str) -> list[float]:
    """
    Get a multimodal embedding for a video segment via Vertex AI.

    The model returns a 1408-dimensional embedding vector.
    """
    from vertexai.vision_models import Video

    model = _get_embedding_model()
    video = Video.load_from_file(gcs_uri)

    embeddings = model.get_embeddings(
        video=video,
        dimension=1408,
    )

    # Return the first (and typically only) video embedding
    if embeddings.video_embeddings:
        return embeddings.video_embeddings[0].embedding
    raise ValueError(f'No embedding returned for {gcs_uri}')


def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    a = np.array(vec_a)
    b = np.array(vec_b)
    dot_product = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot_product / (norm_a * norm_b))


# ===================================================================
# TASK A: Extract Source DNA
# ===================================================================
@shared_task(
    bind=True,
    autoretry_for=(
        ConnectionError,
        google.api_core.exceptions.RetryError,
        google.api_core.exceptions.DeadlineExceeded,
    ),
    retry_backoff=True,
    max_retries=3,
    rate_limit='10/s',
)
def extract_source_dna(self, video_asset_id):
    """
    Task A: Extract Content DNA from a source video.

    1. Update VideoAsset status to Processing.
    2. Chunk video into 5-sec segments, upload to GCS 'vault' under /processing_tmp/.
    3. Pass gs:// URIs to Vertex AI multimodalembedding@001 for embedding extraction.
    4. Delete chunks from /processing_tmp/ immediately after embedding.
    5. Save embeddings to VideoFingerprint.
    6. Update VideoAsset status to Completed.

    On terminal exception: set VideoAsset.Processing_Status = Failed and re-raise.
    """
    from .models import VideoAsset, VideoFingerprint

    try:
        video_asset = VideoAsset.objects.get(id=video_asset_id)

        # Step 1: Update status to Processing
        video_asset.processing_status = VideoAsset.ProcessingStatus.PROCESSING
        video_asset.save(update_fields=['processing_status'])

        # Step 2: Download video from GCS to local temp file
        gcs_uri = video_asset.gcs_uri
        bucket_name = gcs_uri.split('/')[2]
        blob_path = '/'.join(gcs_uri.split('/')[3:])

        client = _get_gcs_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_path)

        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as tmp_file:
            tmp_path = tmp_file.name
            blob.download_to_filename(tmp_path)

        try:
            # Get video duration and save it
            duration = _get_video_duration(tmp_path)
            video_asset.total_duration = duration
            video_asset.save(update_fields=['total_duration'])

            # ===================================================================
            # Step X: AI Video Analysis & Keyword Extraction (Gemini 1.5 Flash)
            # ===================================================================
            try:
                import time
                import google.genai as genai
                import google.genai.types as genai_types
                
                logger.info(f"Uploading {video_asset.title} to AI Studio for keyword extraction...")
                ai_client = genai.Client(api_key=settings.GEMINI_API_KEY)
                ai_file = ai_client.files.upload(
                    file=tmp_path,
                    config=genai_types.UploadFileConfig(mime_type="video/mp4")
                )
                
                while ai_file.state.name == "PROCESSING":
                    time.sleep(2)
                    ai_file = ai_client.files.get(name=ai_file.name)
                
                if ai_file.state.name == "FAILED":
                    logger.warning("AI Studio failed to process video for keywords.")
                else:
                    prompt = "Act as an anti-piracy SEO expert. Watch this raw source video and generate exactly 8 highly distinct, comma-separated keywords that describe the contents, entities, sports teams, logos, and actions occurring in the video. These keywords will be used to search YouTube to find illegal copies of this exact footage. Output only the comma-separated words without any other text or quotes."
                    response = ai_client.models.generate_content(
                        model="gemini-2.5-flash",
                        contents=[
                            prompt,
                            genai_types.Part.from_uri(file_uri=ai_file.uri, mime_type="video/mp4"),
                        ]
                    )
                    
                    keywords = response.text.strip().replace('"', '').replace("'", "")
                    
                    if keywords:
                        video_asset.search_keywords = keywords
                        video_asset.save(update_fields=['search_keywords'])
                        logger.info(f"AI generated keywords for '{video_asset.title}': {keywords}")
                
                # Cleanup AI file immediately
                try:
                    ai_client.files.delete(name=ai_file.name)
                except Exception as e:
                    logger.warning(f"Failed to delete AI Studio file: {e}")
            except Exception as e:
                logger.error(f"AI Keyword Extraction failed (non-fatal): {e}")
            
            # ===================================================================

            # Chunk into 5-second segments
            chunks = _chunk_video(tmp_path, chunk_duration=5.0)

            processing_prefix = f'processing_tmp/{video_asset.id}/'

            for chunk in chunks:
                chunk_blob_path = f'{processing_prefix}chunk_{chunk["start_time"]:.1f}_{chunk["end_time"]:.1f}.mp4'

                # Step 3: Upload chunk to GCS under /processing_tmp/
                chunk_gcs_uri = _upload_to_gcs(
                    settings.GCS_VAULT_BUCKET,
                    chunk_blob_path,
                    chunk['path'],
                )

                # Step 4: Get embedding from Vertex AI
                embedding = _get_video_embedding(chunk_gcs_uri)

                # Step 5: Delete chunk from GCS immediately after embedding
                chunk_blob = bucket.blob(chunk_blob_path)
                chunk_blob.delete()

                # Save fingerprint to database
                VideoFingerprint.objects.create(
                    video_asset=video_asset,
                    start_time=chunk['start_time'],
                    end_time=chunk['end_time'],
                    embedding_vector=embedding,
                )

                # Clean up local chunk file
                os.unlink(chunk['path'])

                logger.info(
                    f'Fingerprint saved for {video_asset.title} '
                    f'[{chunk["start_time"]:.1f}s - {chunk["end_time"]:.1f}s]'
                )

        finally:
            # Clean up local temp video file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

        # Step 6: Update status to Completed
        video_asset.processing_status = VideoAsset.ProcessingStatus.COMPLETED
        video_asset.save(update_fields=['processing_status'])

        logger.info(f'DNA extraction completed for VideoAsset {video_asset_id}')

    except (ConnectionError, google.api_core.exceptions.RetryError,
            google.api_core.exceptions.DeadlineExceeded):
        # Let autoretry handle these
        raise

    except Exception as exc:
        # Terminal exception — mark as Failed and re-raise
        logger.error(f'DNA extraction FAILED for VideoAsset {video_asset_id}: {exc}')
        try:
            video_asset = VideoAsset.objects.get(id=video_asset_id)
            video_asset.processing_status = VideoAsset.ProcessingStatus.FAILED
            video_asset.save(update_fields=['processing_status'])
        except Exception:
            pass
        raise


# ===================================================================
# TASK B: Analyze Suspect Video
# ===================================================================
@shared_task(
    bind=True,
    autoretry_for=(
        ConnectionError,
        google.api_core.exceptions.RetryError,
        google.api_core.exceptions.DeadlineExceeded,
    ),
    retry_backoff=True,
    max_retries=3,
    rate_limit='10/s',
)
def analyze_suspect_video(self, suspect_asset_id, suspect_url, source_video_id):
    """
    Task B: Analyze a suspect video against a source video's fingerprints.

    1. Re-verify suspect_url against SSRF logic.
    2. Securely download the suspect video.
    3. Upload full file to GCS 'temp-suspects' with deterministic filename.
    4. Update VideoAsset (Status=Processing, GCS_URI=...).
    5. Sliding window: chunk suspect video, upload chunks, get embeddings.
    6. Cosine similarity against source_video_id fingerprints.
    7. EARLY EXIT: If any segment > 0.85 match — break, cleanup, trigger Task C.

    On terminal exception: set VideoAsset.Processing_Status = Failed and re-raise.
    """
    from .middleware import validate_url_ssrf
    from .models import VideoAsset, VideoFingerprint

    try:
        suspect_asset = VideoAsset.objects.get(id=suspect_asset_id)

        # Step 1: Re-verify URL against SSRF protections
        is_safe, error_msg = validate_url_ssrf(suspect_url)
        if not is_safe:
            raise ValueError(f'SSRF validation failed in task: {error_msg}')

        # Step 2: Securely download the suspect video using yt-dlp
        logger.info(f'Downloading suspect video from: {suspect_url}')
        
        # We must create a robust temp path that yt-dlp can use
        # yt-dlp automatically handles both direct .mp4 links and YouTube/Vimeo URLs
        temp_dir = tempfile.mkdtemp(prefix='tracedna_dl_')
        tmp_path = os.path.join(temp_dir, 'downloaded.mp4')
        
        import yt_dlp
        import requests as req_lib
        import re as re_module
        
        # Detect platform
        is_instagram = 'instagram.com' in suspect_url
        is_youtube = 'youtube.com' in suspect_url or 'youtu.be' in suspect_url
        
        browser_ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        mobile_ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'

        def _ydl_download(extra_opts):
            opts = {
                'format': 'bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4][height<=720]/best',
                'outtmpl': tmp_path,
                'quiet': False,
                'no_warnings': False,
                'http_headers': {'User-Agent': browser_ua, 'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.9'},
            }
            opts.update(extra_opts)
            ig_cookies_path = '/app/secrets/instagram_cookies.txt'
            if is_instagram and os.path.exists(ig_cookies_path):
                opts['cookiefile'] = ig_cookies_path
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([suspect_url])

        def _scrape_instagram_embed(shortcode):
            """Scrape Instagram embed page to extract video CDN URL — no login needed for public posts."""
            session = req_lib.Session()
            session.headers.update({
                'User-Agent': mobile_ua,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            })
            # Bootstrap session cookies from Instagram homepage
            try:
                session.get('https://www.instagram.com/', timeout=10)
            except Exception:
                pass
            
            for embed_path in [f'/p/{shortcode}/embed/captioned/', f'/reel/{shortcode}/embed/']:
                try:
                    resp = session.get(f'https://www.instagram.com{embed_path}', timeout=20)
                    text = resp.text
                    # Try multiple patterns to find the video URL
                    for pattern in [
                        r'video_url&quot;:&quot;(https:[^&]+)&quot;',
                        r'"video_url":"(https://[^"]+\.mp4[^"]*)"',
                        r'<video[^>]+src="(https://[^"]+\.mp4[^"]*)"',
                        r'"contentUrl":"(https://[^"]+\.mp4[^"]*)"',
                        r'VideoObject[^}]+"url":"(https://[^"]+\.mp4[^"]*)"',
                    ]:
                        m = re_module.search(pattern, text)
                        if m:
                            video_url = m.group(1)
                            video_url = video_url.replace('\\/', '/').replace('\\u0026', '&').replace('&amp;', '&')
                            logger.info(f"Found Instagram video URL via embed scrape: {video_url[:80]}...")
                            # Download it
                            vr = session.get(video_url, stream=True, timeout=60)
                            vr.raise_for_status()
                            with open(tmp_path, 'wb') as f:
                                for chunk in vr.iter_content(chunk_size=8192):
                                    f.write(chunk)
                            size = os.path.getsize(tmp_path)
                            if size < 5000:
                                raise ValueError(f"Downloaded file too small ({size} bytes), probably not a video")
                            logger.info(f"Embed scrape succeeded: {size/1024:.1f}KB")
                            return
                except Exception as inner_e:
                    logger.warning(f"Embed path {embed_path} failed: {inner_e}")
                    continue
            raise ValueError("No video URL found in Instagram embed page")

        def _instaloader_download(shortcode):
            import instaloader
            L = instaloader.Instaloader(
                download_video_thumbnails=False, download_geotags=False,
                download_comments=False, save_metadata=False,
                post_metadata_txt_pattern="", filename_pattern="{shortcode}", quiet=True,
            )
            ig_cookies_path = '/app/secrets/instagram_cookies.txt'
            if os.path.exists(ig_cookies_path):
                try:
                    L.load_session_from_file(username=None, filename=ig_cookies_path)
                except Exception:
                    pass
            post = instaloader.Post.from_shortcode(L.context, shortcode)
            if not post.is_video:
                raise ValueError(f"Instagram post {shortcode} is not a video")
            vr = req_lib.get(post.video_url, stream=True, timeout=60, headers={"User-Agent": mobile_ua})
            vr.raise_for_status()
            with open(tmp_path, 'wb') as f:
                for chunk in vr.iter_content(chunk_size=8192):
                    f.write(chunk)
            logger.info(f"instaloader succeeded: {os.path.getsize(tmp_path)/1024:.1f}KB downloaded")

        # ─── DOWNLOAD CASCADE ────────────────────────────────────────────────
        if not is_instagram:
            # Non-Instagram: single yt-dlp call
            extra = {'age_limit': 99} if is_youtube else {}
            try:
                _ydl_download(extra)
            except Exception as e:
                raise ValueError(f"Failed to download video: {str(e)}")
        else:
            # Instagram cascade: try 4 methods in order
            shortcode_match = re_module.search(r'/(?:reel|p|tv)/([A-Za-z0-9_-]+)', suspect_url)
            shortcode = shortcode_match.group(1) if shortcode_match else None
            last_error = "Unknown error"

            # Method 1: yt-dlp with iOS API (different endpoint, less blocked)
            try:
                logger.info("Instagram Method 1: yt-dlp iOS API")
                _ydl_download({'extractor_args': {'instagram': {'api': ['ios']}}})
                logger.info("Instagram Method 1 succeeded")
            except Exception as e1:
                last_error = str(e1)
                logger.warning(f"Method 1 failed: {last_error[:100]}")
                
                # Method 2: yt-dlp standard web
                try:
                    logger.info("Instagram Method 2: yt-dlp web")
                    _ydl_download({})
                    logger.info("Instagram Method 2 succeeded")
                except Exception as e2:
                    last_error = str(e2)
                    logger.warning(f"Method 2 failed: {last_error[:100]}")
                    
                    # Method 3: Embed page scraping (no auth required)
                    if shortcode:
                        try:
                            logger.info("Instagram Method 3: embed page scraping")
                            _scrape_instagram_embed(shortcode)
                            logger.info("Instagram Method 3 succeeded")
                        except Exception as e3:
                            last_error = str(e3)
                            logger.warning(f"Method 3 failed: {last_error[:100]}")
                            
                            # Method 4: instaloader
                            try:
                                logger.info("Instagram Method 4: instaloader")
                                _instaloader_download(shortcode)
                                logger.info("Instagram Method 4 succeeded")
                            except Exception as e4:
                                last_error = str(e4)
                                logger.error(f"All 4 Instagram methods failed. Last: {last_error[:200]}")
                                raise ValueError(
                                    f"Instagram is blocking all download methods from this server IP. "
                                    f"This is a platform-level restriction by Meta/Instagram on cloud server IPs. "
                                    f"To fix: add Instagram session cookies to /app/secrets/instagram_cookies.txt, "
                                    f"or use a YouTube link instead. Last error: {last_error[:150]}"
                                )
                    else:
                        raise ValueError(f"Could not extract shortcode from Instagram URL: {suspect_url}")

        if not os.path.exists(tmp_path):
            raise ValueError(f"Downloaded video file not found at {tmp_path}")

        try:
            # Step 3: Upload full file to GCS with deterministic filename (IDEMPOTENCY FIX)
            deterministic_filename = f'suspect_{suspect_asset_id}.mp4'
            gcs_uri = _upload_to_gcs(
                settings.GCS_TEMP_BUCKET,
                deterministic_filename,
                tmp_path,
            )

            # Step 4: Update VideoAsset with GCS URI and Processing status
            suspect_asset.gcs_uri = gcs_uri
            suspect_asset.processing_status = VideoAsset.ProcessingStatus.PROCESSING
            duration = _get_video_duration(tmp_path)
            suspect_asset.total_duration = duration
            suspect_asset.save(update_fields=['gcs_uri', 'processing_status', 'total_duration'])

            # Step 5: Load source fingerprints for comparison
            source_fingerprints = list(
                VideoFingerprint.objects.filter(
                    video_asset_id=source_video_id
                ).values_list('embedding_vector', flat=True)
            )

            if not source_fingerprints:
                raise ValueError(
                    f'No fingerprints found for source video {source_video_id}. '
                    f'Ensure DNA extraction has completed.'
                )

            # Sliding window: chunk suspect video
            chunks = _chunk_video(tmp_path, chunk_duration=5.0)
            chunks_prefix = f'chunks/{suspect_asset_id}/'
            best_match = 0.0
            early_exit = False
            matched_start = None
            matched_end = None

            for chunk in chunks:
                chunk_blob_path = f'{chunks_prefix}chunk_{chunk["start_time"]:.1f}_{chunk["end_time"]:.1f}.mp4'

                # Upload chunk to GCS
                chunk_gcs_uri = _upload_to_gcs(
                    settings.GCS_TEMP_BUCKET,
                    chunk_blob_path,
                    chunk['path'],
                )

                # Get embedding from Vertex AI
                suspect_embedding = _get_video_embedding(chunk_gcs_uri)

                # Compare against all source fingerprints
                for source_embedding in source_fingerprints:
                    similarity = _cosine_similarity(suspect_embedding, list(source_embedding))
                    if similarity > best_match:
                        best_match = similarity

                    # CRITICAL EARLY EXIT: > 0.85 match threshold
                    if similarity > 0.85:
                        matched_start = chunk['start_time']
                        matched_end = chunk['end_time']
                        logger.warning(
                            f'HIGH MATCH DETECTED ({similarity:.3f}) for suspect {suspect_asset_id} '
                            f'at segment [{matched_start:.1f}s-{matched_end:.1f}s]'
                        )
                        early_exit = True
                        break

                # Clean up local chunk file
                os.unlink(chunk['path'])

                if early_exit:
                    break

            # Cleanup: delete /chunks/ files from GCS
            _delete_gcs_prefix(settings.GCS_TEMP_BUCKET, chunks_prefix)

            # Clean up remaining local chunk files (if early exit skipped some)
            for chunk in chunks:
                if os.path.exists(chunk['path']):
                    os.unlink(chunk['path'])

            if early_exit:
                # High confidence match — trigger AI verification
                suspect_asset.processing_status = VideoAsset.ProcessingStatus.AWAITING_AI_REVIEW
                suspect_asset.save(update_fields=['processing_status'])

                # Trigger Task C — pass matched timestamps for Gotcha Player
                source_asset = VideoAsset.objects.get(id=source_video_id)
                verify_and_reason.delay(
                    source_asset.id,
                    suspect_asset.id,
                    suspect_url,
                    matched_start,
                    matched_end,
                )

                logger.info(
                    f'Suspect {suspect_asset_id} matched with confidence {best_match:.3f} '
                    f'at [{matched_start:.1f}s-{matched_end:.1f}s]. Triggered AI verification.'
                )
            else:
                # No significant match found
                suspect_asset.processing_status = VideoAsset.ProcessingStatus.COMPLETED
                suspect_asset.save(update_fields=['processing_status'])

                logger.info(
                    f'Suspect {suspect_asset_id} analysis complete. '
                    f'Best match: {best_match:.3f} (below threshold). No piracy detected.'
                )

        finally:
            # Clean up local temp video file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    except (ConnectionError, google.api_core.exceptions.RetryError,
            google.api_core.exceptions.DeadlineExceeded):
        raise

    except Exception as exc:
        logger.error(f'Suspect analysis FAILED for VideoAsset {suspect_asset_id}: {exc}')
        try:
            suspect_asset = VideoAsset.objects.get(id=suspect_asset_id)
            suspect_asset.processing_status = VideoAsset.ProcessingStatus.FAILED
            suspect_asset.save(update_fields=['processing_status'])
        except Exception:
            pass
        raise


# ===================================================================
# TASK C: Verify and Reason
# ===================================================================
@shared_task(
    bind=True,
    autoretry_for=(
        ConnectionError,
        google.api_core.exceptions.RetryError,
        google.api_core.exceptions.DeadlineExceeded,
    ),
    retry_backoff=True,
    max_retries=3,
    rate_limit='10/s',
)
def verify_and_reason(self, source_asset_id, suspect_asset_id, original_suspect_url, matched_segment_start=None, matched_segment_end=None):
    """
    Task C: AI-powered verification and fair-use reasoning via Gemini 1.5 Pro.

    1. Fetch GCS URIs for both source and suspect VideoAssets.
    2. Pass both videos to Gemini 1.5 Pro via Vertex AI.
    3. Use GenerationConfig(response_mime_type="application/json").
    4. Prompt: Compare official vs suspect, return structured JSON.
    5. Create PiracyReport with reasoning.
    6. Update suspect VideoAsset status to Completed.

    On terminal exception: set suspect VideoAsset.Processing_Status = Failed and re-raise.
    """
    import json

    import vertexai
    from vertexai.generative_models import GenerationConfig, GenerativeModel, Part

    from .models import PiracyReport, VideoAsset, VideoFingerprint

    try:
        source_asset = VideoAsset.objects.get(id=source_asset_id)
        suspect_asset = VideoAsset.objects.get(id=suspect_asset_id)

        # Step 1: Get GCS URIs
        source_gcs_uri = source_asset.gcs_uri
        suspect_gcs_uri = suspect_asset.gcs_uri

        if not source_gcs_uri or not suspect_gcs_uri:
            raise ValueError(
                f'Missing GCS URIs: source={source_gcs_uri}, suspect={suspect_gcs_uri}'
            )

        # Step 2: Download both GCS videos to memory and call Gemini with inline bytes
        # Using google.genai (new SDK) with inline_data to bypass the broken Files API resumable upload.
        import tempfile
        import os
        import time
        import google.genai as genai
        import google.genai.types as genai_types
        from google.cloud import storage

        ai_client = genai.Client(api_key=settings.GEMINI_API_KEY)
        storage_client = storage.Client()

        def download_gcs_to_bytes(gcs_uri):
            bucket_name = gcs_uri.replace("gs://", "").split("/")[0]
            blob_name = "/".join(gcs_uri.replace("gs://", "").split("/")[1:])
            blob = storage_client.bucket(bucket_name).blob(blob_name)
            with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as tmp:
                blob.download_to_filename(tmp.name)
                tmp_path = tmp.name
            file_size = os.path.getsize(tmp_path)
            if file_size < 1000:
                os.unlink(tmp_path)
                raise ValueError(f"Video from GCS '{gcs_uri}' is corrupted or empty ({file_size} bytes).")
            with open(tmp_path, 'rb') as f:
                data = f.read()
            os.unlink(tmp_path)
            logger.info(f"Downloaded {gcs_uri}: {file_size/1024:.1f}KB")
            return data

        source_bytes = download_gcs_to_bytes(source_gcs_uri)
        suspect_bytes = download_gcs_to_bytes(suspect_gcs_uri)

        prompt = """You are an expert digital forensics analyst specializing in video piracy detection.

Compare Video A (the official/original content) and Video B (the suspect/potentially pirated content).

CRITICAL STRICT RULES TO PREVENT FALSE POSITIVES:
1. Two videos showing gameplay of the same video game are NOT a match unless EXACT same camera angles, player actions, or specific match sequences are duplicated. Playing the same game is NOT piracy.
2. Commentaries or reactions using completely distinct footage are NOT a match.
3. Penalize confidence heavily if videos are merely conceptually similar but visually distinct.

Return ONLY valid JSON with this exact structure (no markdown):
{
    "is_match": true or false,
    "ai_confidence_score": 0.0 to 1.0,
    "modifications": ["list of detected changes or None"],
    "is_fair_use": true or false,
    "explanation": "Detailed reasoning"
}

Video A (Official):"""

        # Step 3: Call Gemini with inline video bytes — no Files API, no resumable upload session
        response = ai_client.models.generate_content(
            model="gemini-2.5-pro",
            contents=[
                genai_types.Content(parts=[
                    genai_types.Part(text=prompt),
                    genai_types.Part(inline_data=genai_types.Blob(mime_type="video/mp4", data=source_bytes)),
                    genai_types.Part(text="\n\nVideo B (Suspect):"),
                    genai_types.Part(inline_data=genai_types.Blob(mime_type="video/mp4", data=suspect_bytes)),
                ])
            ],
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.0,
            )
        )

        # Step 4: Parse the structured response
        try:
            reasoning = json.loads(response.text)
        except json.JSONDecodeError:
            logger.warning(f'Gemini returned non-JSON response, wrapping: {response.text[:500]}')
            reasoning = {
                'is_match': True,
                'ai_confidence_score': 0.5,
                'modifications': ['Unable to parse detailed modifications'],
                'is_fair_use': False,
                'explanation': response.text,
            }

        is_match = reasoning.get('is_match', False)
        is_fair_use = reasoning.get('is_fair_use', False)
        ai_confidence = float(reasoning.get('ai_confidence_score', 0.95 if is_match else 0.05))

        # Calculate match confidence from fingerprint similarity
        source_fingerprints = list(
            VideoFingerprint.objects.filter(
                video_asset_id=source_asset_id
            ).values_list('embedding_vector', flat=True)
        )

        # Use average of top similarities as confidence
        best_similarities = []
        suspect_fingerprints = list(
            VideoFingerprint.objects.filter(
                video_asset_id=suspect_asset_id
            ).values_list('embedding_vector', flat=True)
        )

        if source_fingerprints and suspect_fingerprints:
            for s_emb in suspect_fingerprints:
                max_sim = max(
                    _cosine_similarity(list(s_emb), list(src_emb))
                    for src_emb in source_fingerprints
                )
                best_similarities.append(max_sim)
            avg_sim = sum(best_similarities) / len(best_similarities)
            
            # Hybrid Confidence Blending: 40% math (embeddings), 60% brain (AI reasoning)
            match_confidence = (avg_sim * 0.4) + (ai_confidence * 0.6)
            
            if not is_match and match_confidence > 0.4:
                # If AI strictly says no match, cap the hybrid score
                match_confidence = min(0.3, match_confidence)
        else:
            # Fallback when fingerprints are missing — rely entirely on Gemini
            match_confidence = ai_confidence

        # Step 5: Create PiracyReport
        report = PiracyReport.objects.create(
            source_video=source_asset,
            suspect_video=suspect_asset,
            original_suspect_url=original_suspect_url,
            match_confidence=match_confidence,
            gemini_reasoning=reasoning,
            is_fair_use=is_fair_use,
            matched_segment_start=matched_segment_start,
            matched_segment_end=matched_segment_end,
            status=PiracyReport.ReportStatus.PENDING,
        )

        # Trigger notification for auto-patrol matches with confidence > 60%
        if match_confidence >= 0.60 and not is_fair_use:
            create_patrol_notification.delay(report.id)

        # Step 6: Update suspect status to Completed
        suspect_asset.processing_status = VideoAsset.ProcessingStatus.COMPLETED
        suspect_asset.save(update_fields=['processing_status'])

        logger.info(
            f'Verification complete for source={source_asset_id}, suspect={suspect_asset_id}. '
            f'Match={is_match}, FairUse={is_fair_use}, Confidence={match_confidence:.3f}'
        )

    except (ConnectionError, google.api_core.exceptions.RetryError,
            google.api_core.exceptions.DeadlineExceeded):
        raise

    except Exception as exc:
        logger.error(
            f'Verification FAILED for source={source_asset_id}, '
            f'suspect={suspect_asset_id}: {exc}'
        )
        try:
            suspect_asset = VideoAsset.objects.get(id=suspect_asset_id)
            suspect_asset.processing_status = VideoAsset.ProcessingStatus.FAILED
            suspect_asset.save(update_fields=['processing_status'])
        except Exception:
            pass
        raise


# ===================================================================
# TASK D: Automated YouTube Patrol Scanner (Celery Beat)
# ===================================================================
@shared_task(bind=True, name='core.tasks.auto_patrol_scan')
def auto_patrol_scan(self):
    """
    Task D: Automated cross-platform piracy patrol scanner.

    Triggered every 6 hours by Celery Beat.
    - Fetches all source (Vault) VideoAssets with completed DNA fingerprints.
    - Searches YouTube using the video's title/keywords.
    - Queues analyze_suspect_video for any new, unseen URLs.
    - Creates a Notification for the video's owner if a match is found
      (notifications are created inside analyze_suspect_video on report creation).
    """
    from django.utils import timezone
    from .models import VideoAsset, PiracyReport
    from .youtube_search import search_youtube, _extract_keywords

    logger.info('[AUTO-PATROL] Starting automated YouTube patrol scan...')

    # Only scan source videos that have completed DNA fingerprinting
    source_videos = VideoAsset.objects.filter(
        is_source=True,
        processing_status=VideoAsset.ProcessingStatus.COMPLETED,
    ).select_related('organization')

    total_queued = 0

    for video in source_videos:
        # Use custom search_keywords if set, otherwise extract from title
        raw_keywords = video.search_keywords.strip() if video.search_keywords else ''
        query = raw_keywords if raw_keywords else _extract_keywords(video.title)

        if not query:
            logger.warning(f'[AUTO-PATROL] Skipping video {video.id} — no keywords.')
            continue

        logger.info(f'[AUTO-PATROL] Searching YouTube for: "{query}" (video: {video.title})')

        results = search_youtube(query, max_results=15)

        # Build set of already-scanned URLs to avoid duplicate scans
        existing_urls = set(
            PiracyReport.objects.filter(
                source_video=video
            ).values_list('original_suspect_url', flat=True)
        )
        # Also check VideoAssets already created as suspects pointing to the same org
        from .models import VideoAsset as VA
        existing_suspect_titles = set(
            VA.objects.filter(
                organization=video.organization,
                is_source=False,
            ).values_list('title', flat=True)
        )

        for result in results:
            url = result['url']
            yt_title = result['title']

            # Skip if this URL was already scanned before
            if url in existing_urls:
                logger.debug(f'[AUTO-PATROL] Skipping already-scanned URL: {url}')
                continue

            # Skip the user's own channel uploads (basic heuristic)
            if any(kw.lower() in yt_title.lower() for kw in ['official', 'trailer', 'behind the']):
                pass  # Don't skip official-looking titles — they may be re-uploads

            logger.info(f'[AUTO-PATROL] Queuing scan for suspect URL: {url}')
            analyze_suspect_video.delay(
                video.id,       # source_video_id
                url,            # suspect_url
                video.id,       # re-use source video ID reference
            )
            total_queued += 1

        # Update last patrol scan timestamp
        video.last_patrol_scan = timezone.now()
        video.save(update_fields=['last_patrol_scan'])

    logger.info(f'[AUTO-PATROL] Finished. Queued {total_queued} suspect URLs for analysis.')
    return {'queued': total_queued}


@shared_task(bind=True, name='core.tasks.create_patrol_notification')
def create_patrol_notification(self, report_id: int):
    """
    Called after a PiracyReport is created by the auto-patrol scan.
    Creates a Notification for the matching user.
    """
    from .models import PiracyReport, Notification
    from django.contrib.auth.models import User

    try:
        report = PiracyReport.objects.select_related(
            'source_video__organization'
        ).get(id=report_id)

        # Resolve the user from the organization name (org-{user_id})
        org_name = report.source_video.organization.name
        if org_name.startswith('org-'):
            user_id = int(org_name.split('-')[1])
            user = User.objects.get(id=user_id)

            confidence_pct = int(report.match_confidence * 100)
            platform = 'YouTube'
            if 'instagram' in report.original_suspect_url:
                platform = 'Instagram'
            elif 'tiktok' in report.original_suspect_url:
                platform = 'TikTok'
            elif 'facebook' in report.original_suspect_url:
                platform = 'Facebook'

            message = (
                f'⚠️ Possible piracy detected on {platform}! '
                f'"{report.source_video.title}" matched with {confidence_pct}% confidence. '
                f'Click to review and draft a DMCA notice.'
            )

            Notification.objects.create(
                user=user,
                report=report,
                notification_type=Notification.NotificationType.PIRACY_DETECTED,
                message=message,
            )
            logger.info(f'[NOTIFICATION] Created piracy alert for user {user.username}')

    except Exception as e:
        logger.error(f'[NOTIFICATION] Failed to create notification for report {report_id}: {e}')

"""
TraceDNA — Live Visual Fingerprint Engine

Captures frames from a live stream using ffmpeg,
generates perceptual hashes, and compares them
against suspect YouTube live streams to detect piracy.
"""
import logging
import os
import subprocess
import tempfile

logger = logging.getLogger(__name__)

FFMPEG_TIMEOUT = 30  # seconds to wait for ffmpeg frame capture


def _extract_frames(stream_url: str, num_frames: int = 5, tmp_dir: str = None) -> list[str]:
    """
    Use ffmpeg to capture `num_frames` frames from a live stream URL.
    Returns a list of absolute paths to the captured PNG frames.
    """
    frames = []
    try:
        for i in range(num_frames):
            # Seek to different positions across 20 seconds to get diverse frames
            seek = i * 4
            out_path = os.path.join(tmp_dir, f"frame_{i}.png")
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(seek),
                "-i", stream_url,
                "-frames:v", "1",
                "-q:v", "2",
                "-vf", "scale=320:-1",   # Resize to 320px wide for fast hashing
                out_path,
            ]
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=FFMPEG_TIMEOUT,
            )
            if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                frames.append(out_path)
            else:
                logger.warning(f"[LIVE VISUAL] ffmpeg failed for frame {i}: {result.stderr[-300:]}")
    except subprocess.TimeoutExpired:
        logger.warning(f"[LIVE VISUAL] ffmpeg timed out for {stream_url}")
    except Exception as e:
        logger.error(f"[LIVE VISUAL] Frame extraction error: {e}")
    return frames


def _get_stream_url_from_youtube(youtube_url: str) -> str | None:
    """
    Use yt-dlp to resolve the best direct stream URL from a YouTube Live URL.
    Returns the direct stream URL or None on failure.
    """
    try:
        import yt_dlp
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'format': 'best[height<=480]',  # Low-res for speed
            'socket_timeout': 15,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=False)
            return info.get('url') or info.get('manifest_url')
    except Exception as e:
        logger.warning(f"[LIVE VISUAL] yt-dlp failed for {youtube_url}: {e}")
        return None


def _hash_frames(frame_paths: list[str]) -> list:
    """
    Generate a perceptual hash (pHash) for each frame image.
    Returns a list of imagehash objects.
    """
    try:
        import imagehash
        from PIL import Image
    except ImportError:
        logger.error("[LIVE VISUAL] imagehash/Pillow not installed!")
        return []

    hashes = []
    for path in frame_paths:
        try:
            img = Image.open(path).convert('RGB')
            hashes.append(imagehash.phash(img))
        except Exception as e:
            logger.warning(f"[LIVE VISUAL] Hash failed for {path}: {e}")
    return hashes


def _compute_similarity(hashes_a: list, hashes_b: list) -> float:
    """
    Compare two sets of perceptual hashes.
    Returns a similarity score from 0.0 (no match) to 100.0 (perfect match).
    """
    if not hashes_a or not hashes_b:
        return 0.0

    scores = []
    for ha in hashes_a:
        for hb in hashes_b:
            # Hamming distance — 0 = identical, 64 = completely different
            distance = ha - hb
            similarity = max(0.0, 100.0 * (1 - distance / 64.0))
            scores.append(similarity)

    return max(scores) if scores else 0.0


def compare_live_streams(official_url: str, suspect_url: str) -> dict:
    """
    Main entry point.
    Compares the official live stream against a suspect YouTube stream.

    Returns a dict:
        {
            'confidence': float,      # 0-100
            'is_match': bool,         # True if confidence > 70
            'frames_compared': int,
            'error': str | None,
        }
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        official_dir = os.path.join(tmp_dir, 'official')
        suspect_dir = os.path.join(tmp_dir, 'suspect')
        os.makedirs(official_dir, exist_ok=True)
        os.makedirs(suspect_dir, exist_ok=True)

        # Step 1: Resolve suspect YouTube URL → direct stream URL
        logger.info(f"[LIVE VISUAL] Resolving suspect stream: {suspect_url}")
        suspect_stream = _get_stream_url_from_youtube(suspect_url)
        if not suspect_stream:
            return {'confidence': 0.0, 'is_match': False, 'frames_compared': 0, 'error': 'Could not resolve suspect stream'}

        # Step 2: Resolve official YouTube URL if needed
        official_stream = official_url
        if 'youtube.com' in official_url or 'youtu.be' in official_url:
            official_stream = _get_stream_url_from_youtube(official_url)
            if not official_stream:
                return {'confidence': 0.0, 'is_match': False, 'frames_compared': 0, 'error': 'Could not resolve official stream'}

        # Step 3: Extract frames from both
        logger.info(f"[LIVE VISUAL] Extracting frames from official stream...")
        official_frames = _extract_frames(official_stream, num_frames=5, tmp_dir=official_dir)

        logger.info(f"[LIVE VISUAL] Extracting frames from suspect stream...")
        suspect_frames = _extract_frames(suspect_stream, num_frames=5, tmp_dir=suspect_dir)

        if not official_frames or not suspect_frames:
            return {
                'confidence': 0.0,
                'is_match': False,
                'frames_compared': 0,
                'error': f'Frame extraction failed (official={len(official_frames)}, suspect={len(suspect_frames)})'
            }

        # Step 4: Hash and compare
        official_hashes = _hash_frames(official_frames)
        suspect_hashes = _hash_frames(suspect_frames)
        confidence = _compute_similarity(official_hashes, suspect_hashes)

        is_match = confidence >= 70.0

        logger.info(f"[LIVE VISUAL] Confidence: {confidence:.1f}% — {'PIRACY CONFIRMED' if is_match else 'No match'}")

        return {
            'confidence': round(confidence, 1),
            'is_match': is_match,
            'frames_compared': min(len(official_hashes), len(suspect_hashes)),
            'error': None,
        }

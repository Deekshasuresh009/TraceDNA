"""
TraceDNA — YouTube Search Helper

Uses the YouTube Data API v3 to search for potentially infringing videos
based on keyword queries derived from source video titles.

Quota usage: 100 units per search request. Free tier allows 10,000 units/day.
"""
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def _extract_keywords(title: str) -> str:
    """
    Extract a clean keyword string from a video title.
    Removes common sports filler words to improve search precision.
    """
    stop_words = {
        'official', 'full', 'video', 'hd', '4k', 'highlights',
        'match', 'vs', 'and', 'the', 'a', 'an', 'in', 'of',
        'clip', 'part', 'episode', 'season',
    }
    words = [w for w in title.lower().split() if w not in stop_words]
    return ' '.join(words[:8])   # max 8 keywords for best API results


def search_youtube(query: str, max_results: int = 20) -> list[dict]:
    """
    Search YouTube for videos matching the given keyword query.

    Returns a list of dicts with:
        - url: str — full YouTube watch URL
        - title: str — video title
        - channel: str — channel name
        - published_at: str — ISO 8601 publish date
        - video_id: str — YouTube video ID
    """
    api_key = settings.YOUTUBE_DATA_API_KEY
    if not api_key:
        logger.error('YOUTUBE_DATA_API_KEY is not set — cannot search YouTube.')
        return []

    try:
        from googleapiclient.discovery import build
        youtube = build('youtube', 'v3', developerKey=api_key)

        response = youtube.search().list(
            q=query,
            part='snippet',
            type='video',
            maxResults=max_results,
            order='date',                      # Newest first — important for catching fresh piracy
            videoDuration='short',             # Reels/clips are typically < 4 minutes
        ).execute()

        results = []
        for item in response.get('items', []):
            video_id = item['id'].get('videoId')
            if not video_id:
                continue
            snippet = item.get('snippet', {})
            results.append({
                'video_id': video_id,
                'url': f'https://www.youtube.com/watch?v={video_id}',
                'title': snippet.get('title', ''),
                'channel': snippet.get('channelTitle', ''),
                'published_at': snippet.get('publishedAt', ''),
            })

        logger.info(f'YouTube search for "{query}" returned {len(results)} results.')
        return results

    except Exception as e:
        logger.error(f'YouTube Data API search failed: {e}')
        return []

def search_youtube_live(query: str, max_results: int = 15) -> list[dict]:
    """
    Search YouTube specifically for ACTIVE live streams matching the given keyword query.
    Used exclusively by the Live Event Shield radar.
    """
    api_key = settings.YOUTUBE_DATA_API_KEY
    if not api_key:
        logger.error('YOUTUBE_DATA_API_KEY is not set — cannot search YouTube Live.')
        return []

    try:
        from googleapiclient.discovery import build
        youtube = build('youtube', 'v3', developerKey=api_key)

        response = youtube.search().list(
            q=query,
            part='snippet',
            eventType='live',
            type='video',
            maxResults=max_results,
            order='date',
        ).execute()

        results = []
        for item in response.get('items', []):
            video_id = item['id'].get('videoId')
            if not video_id:
                continue
            snippet = item.get('snippet', {})
            results.append({
                'video_id': video_id,
                'url': f'https://www.youtube.com/watch?v={video_id}',
                'title': snippet.get('title', ''),
                'channel': snippet.get('channelTitle', ''),
                'published_at': snippet.get('publishedAt', ''),
            })

        logger.info(f'[LIVE SHIELD] YouTube LIVE search for "{query}" returned {len(results)} active streams.')
        return results

    except Exception as e:
        logger.error(f'YouTube Data API LIVE search failed: {e}')
        return []

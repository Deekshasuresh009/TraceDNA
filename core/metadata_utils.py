import logging
import yt_dlp
import re

logger = logging.getLogger(__name__)

def extract_live_metadata(url: str) -> dict:
    """
    Uses yt-dlp to extract title and tags from a YouTube live stream 
    to automatically generate search keywords for TraceDNA campaigns.
    """
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'socket_timeout': 10,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # We don't need the full manifest, just title/tags
            info = ydl.extract_info(url, download=False)
            
            raw_title = info.get('title', '')
            tags = info.get('tags', [])
            
            # Clean title (remove common suffixes like " - YouTube Live")
            clean_title = re.split(r'[-|]', raw_title)[0].strip()
            
            # Generate keywords from tags and title
            keyword_set = set()
            
            # 1. Add tags (primary source)
            for tag in tags:
                if len(tag) > 2:
                    keyword_set.add(tag.lower())
            
            # 2. Extract words from title (fallback/supplement)
            title_words = re.findall(r'\b[A-Za-z0-9]{3,}\b', raw_title)
            for word in title_words:
                # Avoid generic words
                if word.lower() not in ['live', 'stream', 'video', 'watch', 'official']:
                    keyword_set.add(word.lower())

            # Return top 10 unique keywords
            return {
                'title': clean_title,
                'keywords': ', '.join(list(keyword_set)[:10])
            }
            
    except Exception as e:
        logger.error(f"Metadata extraction failed for {url}: {e}")
        return {'error': "Could not extract metadata from this URL."}

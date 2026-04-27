"""
TraceDNA SSRF Protection Middleware

Validates URLs submitted for suspect scanning against:
1. IP-literal blocklist (metadata endpoints, loopback, private ranges) — checked FIRST
2. Domain allowlist via tldextract — checked SECOND

Usage: Called explicitly in views and Celery tasks before fetching external URLs.
Also registered as Django middleware to validate on every request containing suspect URLs.
"""
import ipaddress
import re
from urllib.parse import urlparse

import tldextract
from django.conf import settings
from django.http import JsonResponse


# -------------------------------------------------------------------
# Blocked IP patterns — MUST be checked BEFORE domain allowlist
# -------------------------------------------------------------------
BLOCKED_IP_LITERALS = [
    '169.254.169.254',   # AWS/GCP metadata endpoint
    '127.0.0.1',
    '0.0.0.0',
    'localhost',
    '::1',
    '[::1]',
    '0000::1',
    '10.',                # Private Class A (prefix match)
    '172.16.',            # Private Class B (prefix match)
    '172.17.',
    '172.18.',
    '172.19.',
    '172.20.',
    '172.21.',
    '172.22.',
    '172.23.',
    '172.24.',
    '172.25.',
    '172.26.',
    '172.27.',
    '172.28.',
    '172.29.',
    '172.30.',
    '172.31.',
    '192.168.',           # Private Class C (prefix match)
]

# Regex to detect raw IP addresses (IPv4 or IPv6 in brackets)
IP_LITERAL_REGEX = re.compile(
    r'^https?://(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # IPv4
    r'|^https?://\[([0-9a-fA-F:]+)\]'                    # IPv6 in brackets
)


def validate_url_ssrf(url: str) -> tuple[bool, str]:
    """
    Validate a URL against SSRF protections.

    Returns:
        (is_safe, error_message) — (True, '') if safe, (False, reason) if blocked.
    """
    if not url:
        return False, 'URL cannot be empty.'

    # --- STEP 1: Reject IP-literal URLs ---
    parsed = urlparse(url)
    hostname = parsed.hostname or ''

    # Check for raw IP address in URL
    ip_match = IP_LITERAL_REGEX.match(url)
    if ip_match:
        return False, f'IP-literal URLs are not allowed: {hostname}'

    # Check hostname against blocked IP literals and prefixes
    hostname_lower = hostname.lower().strip()
    for blocked in BLOCKED_IP_LITERALS:
        if hostname_lower == blocked or hostname_lower.startswith(blocked):
            return False, f'Blocked IP/hostname: {hostname}'

    # Attempt to parse hostname as IP address to catch obfuscated forms
    try:
        ip_obj = ipaddress.ip_address(hostname_lower)
        if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_reserved:
            return False, f'Private/reserved IP address not allowed: {hostname}'
    except ValueError:
        pass  # Not an IP address — proceed to domain check

    # --- STEP 2: Domain allowlist via tldextract ---
    extracted = tldextract.extract(url)
    registered_domain = f'{extracted.domain}.{extracted.suffix}'.lower()

    allowed_domains = getattr(settings, 'SSRF_ALLOWED_DOMAINS', [])
    if registered_domain not in [d.lower() for d in allowed_domains]:
        return False, (
            f'Domain "{registered_domain}" is not in the allowed list. '
            f'Allowed: {", ".join(allowed_domains)}'
        )

    # --- STEP 3: Enforce HTTPS ---
    if parsed.scheme not in ('http', 'https'):
        return False, f'Invalid URL scheme: {parsed.scheme}. Only http/https allowed.'

    return True, ''


class SSRFProtectionMiddleware:
    """
    Django middleware that validates suspect URLs in POST request bodies.

    Only activates on endpoints that submit suspect URLs (e.g., /api/patrol/scan-url/).
    """
    PROTECTED_PATHS = ['/api/patrol/scan-url/']

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == 'POST' and request.path in self.PROTECTED_PATHS:
            # Try to extract suspect_url from the request body
            try:
                import json
                body = json.loads(request.body.decode('utf-8'))
                suspect_url = body.get('suspect_url', '')
            except (json.JSONDecodeError, UnicodeDecodeError):
                suspect_url = request.POST.get('suspect_url', '')

            if suspect_url:
                is_safe, error_msg = validate_url_ssrf(suspect_url)
                if not is_safe:
                    return JsonResponse(
                        {'error': f'SSRF Protection: {error_msg}'},
                        status=400,
                    )

        return self.get_response(request)

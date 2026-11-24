"""ToolKu hardening: rate limiting, CSRF, and SSRF-safe URL proxy.

Fixes F1 (SSRF chain via /api/proxy) and F2 (unbounded server-side processing).
Optional dependency: redis (falls back to stdlib in-memory store).
"""
import hmac
import http.client
import ipaddress
import os
import secrets
import socket
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque

from flask import request, session

try:
    import redis
except ImportError:
    redis = None

# ---------------------------------------------------------------- rate limit
_REDIS_SLIDING_WINDOW_LUA = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
    return 0
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, math.ceil(window * 1000))
return 1
"""


class RateLimiter:
    """Thread-safe sliding-window limiter, per (IP, bucket).
    Uses Redis when REDIS_URL is configured for multi-worker consistency,
    with automatic fallback to in-memory storage if Redis is unavailable."""

    def __init__(self, redis_url=None):
        self._hits = {}
        self._lock = threading.Lock()
        self._redis = None
        self._lua_script = None

        url = redis_url or os.environ.get("REDIS_URL", "").strip()
        if url and redis is not None:
            try:
                client = redis.from_url(
                    url,
                    socket_connect_timeout=0.5,
                    socket_timeout=0.5,
                    decode_responses=True,
                )
                client.ping()
                self._redis = client
                self._lua_script = client.register_script(_REDIS_SLIDING_WINDOW_LUA)
            except Exception:
                self._redis = None

    def _allow_memory(self, key, limit, window):
        now = time.monotonic()
        with self._lock:
            dq = self._hits.get(key)
            if dq is None:
                dq = self._hits[key] = deque()
            while dq and dq[0] <= now - window:
                dq.popleft()
            if len(dq) >= limit:
                return False
            dq.append(now)
            if len(self._hits) > 10000:  # prune stale keys
                for k in list(self._hits):
                    v = self._hits[k]
                    if not v or v[-1] <= now - window:
                        del self._hits[k]
            return True

    def allow(self, key, limit, window=60):
        if self._redis is not None and self._lua_script is not None:
            try:
                redis_key = f"toolku:rl:{key[0]}:{key[1]}" if isinstance(key, tuple) else f"toolku:rl:{key}"
                now = time.time()
                member = f"{now}:{secrets.token_hex(4)}"
                res = self._lua_script(
                    keys=[redis_key],
                    args=[now, window, limit, member],
                )
                return bool(res == 1)
            except Exception:
                # Fallback ke in-memory jika Redis bermasalah sementara
                return self._allow_memory(key, limit, window)

        return self._allow_memory(key, limit, window)


LIMITER = RateLimiter()

# Max simultaneous LibreOffice conversions (CPU/RAM guard).
CONVERT_SLOTS = threading.BoundedSemaphore(2)

# ---------------------------------------------------------------- CSRF
def ensure_csrf():
    """Create a session-bound CSRF token (idempotent). Called on page render."""
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(32)
    session.permanent = True
    return session["csrf"]


def csrf_ok():
    tok = session.get("csrf")
    hdr = request.headers.get("X-CSRF-Token", "")
    return bool(tok) and bool(hdr) and hmac.compare_digest(tok, hdr)


# ---------------------------------------------------------------- SSRF-safe proxy
PROXY_TIMEOUT = 20
PROXY_MAX_BYTES = 25 * 1024 * 1024  # images only
PROXY_MAX_REDIRECTS = 5
IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"}

# Ranges that ipaddress.is_private may miss depending on Python version.
_EXTRA_BLOCK_V4 = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),   # CGNAT
    ipaddress.ip_network("192.0.0.0/24"),    # IETF protocol assignments
    ipaddress.ip_network("198.18.0.0/15"),   # benchmarking
    ipaddress.ip_network("255.255.255.255/32"),
]


class ProxyError(Exception):
    def __init__(self, msg, code=400):
        super().__init__(msg)
        self.code = code


def _ip_blocked(ip):
    if ip.version == 6 and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    if (ip.is_loopback or ip.is_private or ip.is_link_local
            or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
        return True
    if ip.version == 4:
        return any(ip in net for net in _EXTRA_BLOCK_V4)
    return False


def validate_and_resolve(url):
    """Validate scheme/host and resolve ALL A/AAAA records. Block if ANY
    record is internal. Returns one validated IP to pin the connection to
    (defeats DNS-rebinding TOCTOU: the socket connects to this exact IP)."""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ProxyError("Hanya http/https yang diizinkan", 400)
    if not parsed.hostname:
        raise ProxyError("URL tidak valid", 400)
    if parsed.username or parsed.password:
        raise ProxyError("URL dengan kredensial tidak diizinkan", 400)
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        infos = socket.getaddrinfo(parsed.hostname, port, proto=socket.IPPROTO_TCP)
    except OSError:
        raise ProxyError("Tidak bisa resolusi host", 502)
    ips = []
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if _ip_blocked(ip):
            raise ProxyError("Anti-SSRF: alamat internal tidak diizinkan", 403)
        ips.append(info[4][0])
    if not ips:
        raise ProxyError("Tidak bisa resolusi host", 502)
    return ips[0]


class _PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, host, pinned_ip, **kw):
        super().__init__(host, **kw)
        self._pinned_ip = pinned_ip

    def connect(self):
        self.sock = socket.create_connection(
            (self._pinned_ip, self.port), self.timeout, self.source_address)
        if self._tunnel_host:
            self._tunnel()


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host, pinned_ip, **kw):
        super().__init__(host, **kw)
        self._pinned_ip = pinned_ip

    def connect(self):
        sock = socket.create_connection(
            (self._pinned_ip, self.port), self.timeout, self.source_address)
        if self._tunnel_host:
            self.sock = sock
            self._tunnel()
        # TLS SNI + certificate verification still use the ORIGINAL hostname.
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


class _PinnedHTTPHandler(urllib.request.HTTPHandler):
    def http_open(self, req):
        ip = getattr(req, "_pinned_ip", None)
        if not ip:
            raise urllib.error.URLError("unpinned request")
        return self.do_open(lambda host, **kw: _PinnedHTTPConnection(host, ip, **kw), req)


class _PinnedHTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, req):
        ip = getattr(req, "_pinned_ip", None)
        if not ip:
            raise urllib.error.URLError("unpinned request")
        return self.do_open(
            lambda host, **kw: _PinnedHTTPSConnection(host, ip, **kw), req,
            context=self._context)


class _ValidatingRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Every redirect hop is re-validated (scheme + full DNS check) and
    re-pinned, so a 302 to an internal address cannot bypass the guard."""
    max_redirections = PROXY_MAX_REDIRECTS

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        newurl = newurl.replace(" ", "%20")
        ip = validate_and_resolve(newurl)  # raises ProxyError if internal/bad
        new_req = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new_req is not None:
            new_req._pinned_ip = ip
        return new_req


def proxy_fetch_image(url):
    """Fetch a remote URL safely. Returns (data, content_type).
    Only image content types are accepted — HTML/JS can never be served
    through this endpoint (kills the reflected-XSS delivery vector)."""
    ip = validate_and_resolve(url)
    req = urllib.request.Request(url, headers={
        "User-Agent": "ToolKu/1.0 (self-hosted image converter)",
        "Accept": "image/*",
    })
    req._pinned_ip = ip
    ctx = ssl.create_default_context()
    opener = urllib.request.build_opener(
        _PinnedHTTPHandler(), _PinnedHTTPSHandler(context=ctx),
        _ValidatingRedirectHandler())
    try:
        with opener.open(req, timeout=PROXY_TIMEOUT) as r:
            ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if ctype not in IMAGE_TYPES:
                raise ProxyError(
                    "Hanya gambar (PNG/JPG/WebP/GIF/BMP) yang diizinkan — "
                    f"Content-Type asal: {ctype or 'kosong'}", 415)
            data = r.read(PROXY_MAX_BYTES + 1)
            if len(data) > PROXY_MAX_BYTES:
                raise ProxyError("File terlalu besar (>25 MB)", 413)
            return data, ctype
    except urllib.error.HTTPError as e:
        raise ProxyError(f"Server asal menolak: {e.code}", 403)
    except urllib.error.URLError as e:
        raise ProxyError(f"Gagal terhubung: {e.reason}", 502)

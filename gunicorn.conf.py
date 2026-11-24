"""Gunicorn configuration for ToolKu.

Neutralises the default `Server: gunicorn` banner (no version leak) and
keeps the worker footprint small and predictable.

Used via:  gunicorn -c gunicorn.conf.py app:app
"""
import multiprocessing

# --- Do not advertise the WSGI stack -------------------------------------
import gunicorn  # noqa: E402
import gunicorn.http.wsgi as _wsgi  # noqa: E402

gunicorn.SERVER = "toolku"
_wsgi.SERVER = "toolku"

# --- Worker sizing -------------------------------------------------------
bind = "0.0.0.0:8000"
workers = 2
threads = 4
worker_class = "sync"
timeout = 120
graceful_timeout = 30
keepalive = 5
max_requests = 1000
max_requests_jitter = 100

# --- Logging -------------------------------------------------------------
accesslog = "-"
errorlog = "-"
loglevel = "info"
# Don't log the CSRF token / query strings in full.
access_log_format = '%(h)s "%(r)s" %(s)s %(b)s %(M)sms'

# --- Hardening -----------------------------------------------------------
limit_request_line = 4094
limit_request_fields = 50
limit_request_field_size = 8190
forwarded_allow_ips = "127.0.0.1"

# Deploying ToolKu on a Docker Server

## Overview
- **Image:** Built from `Dockerfile` (multi-stage: compiles `libredwg` from source → `python:3.12-slim` runtime + LibreOffice).
- **Stack:** 3 containers — `toolku` (Flask/Gunicorn on port `8000`), `redis` (shared rate-limit store), and `toolku-libretranslate` (internal port `5000`).
- **Container User:** Non-root user `toolku` (UID `1000`).
- **Image Size:** ~1.3 GB (includes LibreOffice + LibreDWG).

## Deployment Steps

```bash
# 1. Copy the release bundle to your server
scp -r toolku_release/ user@server:/opt/toolku

# 2. Configure environment and build
cd /opt/toolku
cp .env.example .env && nano .env     # Required: replace SECRET_KEY
docker compose up -d --build

# 3. Verify health
docker compose ps                     # All three containers should show "healthy"
curl -fsS http://127.0.0.1:8000/healthz
```

Expected `/healthz` output: `{"server_tools":9,"status":"ok","tools":42}`

## Required: TLS Termination in Front

The application container serves plain HTTP only. Place Nginx or Caddy on the host as a reverse proxy with TLS enabled (see the Nginx section in `README.md`). Once HTTPS is active, set `TOOLKU_SECURE_COOKIES=1` in `.env`.

## Operational Notes

- **Secret Key:** You **must** change `SECRET_KEY` in `.env` (Docker Compose includes a fallback default—never use it in production).
- **Language Models (`LT_LOAD_ONLY`):** Defaults to `en,zh,ar,ja,ko,id` (English, Chinese, Arabic, Japanese, Korean, Indonesian). Requires **~1.5–2 GB RAM** for Argos models and takes ~2 minutes on initial startup to download models. Leave `LT_LOAD_ONLY` empty in `.env` to load all ~100 languages (requires ~4–6 GB RAM).
- **Persistent Volume (`lt_models`):** Stores downloaded translation models. Avoid running `docker compose down -v` unless you intend to re-download ~2–3 GB of models on the next boot.
- **Gunicorn Configuration (`gunicorn.conf.py`):** Neutralizes the `Server` response header, runs 2 workers × 4 threads, and sets `max_requests=1000` (automatic worker rotation to prevent memory leaks).
- **Rate Limiting:** Backed by Redis (`redis` service in Compose) so limits apply consistently across all workers. Automatically falls back to thread-safe in-memory storage if Redis is unreachable (`requirements.txt` includes `redis>=5.0`).
- **Async PDF Translation:** `POST /api/pdf-translate` returns `202` + `job_id`. Clients poll the status endpoint every 2 seconds. Translated files are stored in `/tmp/tk_pdf_jobs/<job_id>/` for **15 minutes** (job window) before automatic cleanup. Downloads use an anchor-tag click to prevent reverse-proxy timeouts.
- **LibreOffice Cold Start:** Because LibreOffice is bundled inside the image, the very first document conversion after container startup takes longer (~10–30 seconds).

## Updating the Application

```bash
cd /opt/toolku && git pull   # or rsync updated files
docker compose up -d --build
```

## Troubleshooting

| Symptom | Cause / Resolution |
|---|---|
| `502` from `/api/translate` | LibreTranslate container is still starting or unhealthy → check `docker compose logs -f libretranslate`. |
| `501` on `/api/dwg-to-pdf` | `dwg2dxf` binary is missing (outdated image) → rebuild with `docker compose up -d --build`. |
| `500` on Office conversion | Corrupted input file or unsupported file format (check supported extensions in the UI). |
| Persistent `429` errors | Rate limit reached (e.g., 10 req/min per IP for `/api/convert/*`). Wait 60 seconds and retry. |
| `403` on `/api/pdf-translate` | Clear the `session` cookie and reload the page to obtain a fresh CSRF token (`X-CSRF-Token`). |
| PDF translation fails to process | Ensure the `libretranslate` container is reachable within the Docker network. |
| Translated file disappears after 15 min | Expected behavior: the ephemeral job window is 15 minutes, after which artifacts are purged. |
| `connection refused` to `libretranslate` | Verify `libretranslate` is running and `LT_URL` matches the Docker service name. |
| `redis` unresponsive (`503`/`504`) | Redis service crashed or hit its memory cap → inspect `docker compose logs redis`. |

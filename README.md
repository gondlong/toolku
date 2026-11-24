# 🧰 ToolKu — Free Browser-Based Utility Suite

**42 tools** for PDFs, images, text/developer workflows, and everyday utilities. All frontend libraries are locally vendored — no external CDNs, works completely offline.

## Architecture

```text
                                       ┌──────────────────────────────┐
                                 ┌────▶│ libretranslate (container 2) │
┌─────────────────────────────┐  │HTTP │ :5000 (internal only)        │
│  toolku (container 1)       │──┤     └──────────────────────────────┘
│  Flask + Gunicorn :8000     │  │     ┌──────────────────────────────┐
│  LibreOffice + LibreDWG     │──┴────▶│ redis (container 3)          │
└─────────────────────────────┘  TCP   │ :6379 (rate-limit store)     │
                                       └──────────────────────────────┘
```

- **Client-side tools (32):** Processed entirely in the browser — files **never touch** the server. Works 100% offline (`static/vendor/`).
- **Server-side tools (9):** Word/PPT/Excel→PDF, DWG/DXF→PDF, Compress/Protect/Unlock PDF, Text Translate, and **Async PDF Translate**. Only validated files (allowed extensions, max 32 MB) are uploaded and **automatically deleted after 15 minutes**.

> ⚠️ **Privacy Note:** Server-side tools process files on the backend. For maximum privacy, use the client-side tools.

---

## Available Tools

| Category | Tools |
|---|---|
| **PDF** | Merge PDF, Split PDF, PDF to Image, Image to PDF, Organize PDF Pages, Watermark PDF, Add Page Numbers, **Word to PDF**, **PowerPoint to PDF**, **Excel to PDF**, **DWG/DXF to PDF**, PDF to Word, PDF to Excel, PDF to DWG, Sign PDF, Ink-Saver PDF, Edit PDF, **Compress PDF**, Redact PDF, **Protect PDF**, **Unlock PDF** |
| **Image** | Compress & Resize, Format Converter (PNG/JPG/WebP), Image ↔ Base64 |
| **Text & Developer** | JSON Formatter, Base64, URL Encode/Decode, Hash (MD5/SHA), UUID Generator, Password Generator, QR Code Generator, Markdown Preview (sanitized), Text Diff, Case Converter, Word Counter, Regex Tester, JWT Decoder, Timestamp Converter, **Text Translate** (LibreTranslate) |
| **Utilities** | Unit Converter, Color Converter |

---

## Asynchronous PDF Translation

1. **Submit:** Client sends PDF + metadata (`source`, `target`, `format`) to `POST /api/pdf-translate` → returns `202` + `{"job_id": "..."}`.
2. **Process:** Background thread processes the job in `/tmp/tk_pdf_jobs/<job_id>/` (max 2 concurrent slots via `CONVERT_SLOTS`).
3. **Poll:** Client checks `GET /api/pdf-translate/status/<job_id>` every 2 seconds (`processing`, `done`, `error`).
4. **Download:** Client fetches `GET /api/pdf-translate/download/<job_id>` via an **anchor-tag click** (avoiding XHR proxy timeouts). Files expire and auto-delete after 15 minutes.

---

## Quick Start & Deployment

> 📖 For detailed deployment options (manual Docker, systemd, Nginx TLS), resource estimates, and troubleshooting, see **[DEPLOY.md](DEPLOY.md)**.

### Docker Compose (Recommended)

```bash
cp .env.example .env      # Update SECRET_KEY
chown -R 1032:1032 /var/lib/docker/volumes/toolku_lt_models/_data

docker compose up -d --build
```

### Local Development (Without Docker)

```bash
pip install -r requirements.txt
export LT_URL=http://127.0.0.1:5000
export REDIS_URL=redis://127.0.0.1:6379/0   # Optional; falls back to in-memory
python app.py                              # http://localhost:8000
```

---

## Security & Hardening

- **CSRF Protection:** All `/api` endpoints require `X-CSRF-Token` paired with an `HttpOnly` / `SameSite=Lax` session cookie.
- **Rate Limiting:** Sliding-window limiter backed by Redis (with automatic in-memory fallback) — e.g., `5 req/min/IP` for `/api/pdf-translate` and `10 req/min/IP` for `/api/convert/*`.
- **SSRF-Safe URL Proxy (`/api/proxy`):** Blocks internal/private IPs across all DNS records, pins resolved sockets (anti-DNS rebinding), re-validates redirects, and restricts responses to `image/*` (max 25 MB).
- **Upload Hygiene & Headers:** Filename sanitization (`secure_filename`), 32 MB upload cap, DOMPurify Markdown sanitization, and strict CSP, HSTS, `X-Frame-Options: DENY`, and `CORP`/`COOP` headers.
- **Health Check:** `GET /healthz` → `{"status":"ok","tools":42,"server_tools":9}`.

---

## Project Structure

```text
app.py                  # Flask entry point, registry of 42 tools, and security headers
server_api.py           # /api blueprint: Office/DWG/compress/protect/translate + guards
doc_convert.py          # LibreOffice runner (profile cleanup in finally block)
hardening.py            # Rate limiting, CSRF protection, and SSRF-safe proxy
pdf_translate.py        # PDF translation engine (LibreTranslate + PyMuPDF)
templates/              # Base layout, index, tool wrapper, and per-tool partials
static/js/              # Shared helpers and isolated per-tool scripts (no inline JS)
static/css/style.css    # Dark theme styles and animations
static/vendor/          # Self-hosted third-party frontend libraries
Dockerfile              # Multi-stage build: libredwg-builder -> runtime
docker-compose.yml      # Multi-container setup: toolku + redis + libretranslate
```

### Adding a New Tool
1. Register a new entry in `TOOLS` inside `app.py` (set `server=True` if it calls `/api/`).
2. Create `templates/tools/<slug>.html` and `static/js/tools/<slug>.js`.
3. The homepage card renders automatically.

## License

Free to use, modify, and distribute under the terms of the [LICENSE](LICENSE) file. Feel free to open an Issue in this repository if you encounter any bugs or have suggestions.

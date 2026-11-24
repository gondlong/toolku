"""Server-side API for ToolKu: Office→PDF, DWG, compress, protect, unprotect.

All uploads land in a temp dir that is deleted immediately after processing.
"""
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request

import uuid
import threading
import time

import pikepdf
import pymupdf as fitz
from PIL import Image

from flask import Blueprint, jsonify, request, send_file
from werkzeug.utils import secure_filename

from hardening import CONVERT_SLOTS, LIMITER, csrf_ok
from doc_convert import run_soffice
from pdf_translate import TranslateError, translate_pdf as _translate_pdf

api = Blueprint("api", __name__, url_prefix="/api")

JOB_ROOT = "/tmp/tk_pdf_jobs"
JOB_CLEANUP_TIME = 900  # 15 minutes in seconds
os.makedirs(JOB_ROOT, exist_ok=True)
STATUS_LOCK = threading.RLock()
_UUID_HEX_RE = re.compile(r"^[0-9a-f]{32}$")

# LibreTranslate is a SEPARATE container (libretranslate/libretranslate:latest).
# Override with LT_URL when the service lives elsewhere.
LT_URL = os.environ.get("LT_URL", "http://libretranslate:5000").rstrip("/")

ALLOWED_EXT = {
    "word-to-pdf": {".docx", ".doc", ".odt", ".rtf", ".txt"},
    "pptx-to-pdf": {".pptx", ".ppt", ".odp"},
    "excel-to-pdf": {".xlsx", ".xls", ".ods", ".csv"},
    "dwg-to-pdf": {".dwg", ".dxf"},
    "pdf-compress": {".pdf"},
    "pdf-protect": {".pdf"},
    "pdf-unprotect": {".pdf"},
    "pdf-translate": {".pdf"},
}


def _err(msg, code=400):
    return jsonify({"ok": False, "error": msg}), code


def _save_upload(tool):
    """Save request file to temp dir; returns (path, tmpdir, original_name).

    F6: control characters (CR/LF/NUL) are stripped from the filename before
    it is ever echoed back, so header/log injection via filename is dead.
    F4: if saving fails mid-write the temp dir is removed immediately.
    """
    if "file" not in request.files:
        raise ValueError("Tidak ada file yang diunggah.")
    f = request.files["file"]
    name = re.sub(r"[\x00-\x1f\x7f]", "", (f.filename or "upload")).strip()
    ext = os.path.splitext(name)[1].lower()
    allowed = ALLOWED_EXT.get(tool)
    if allowed and ext not in allowed:
        raise ValueError(
            f"Format {ext or 'tidak dikenal'} tidak didukung. "
            f"Yang diterima: {', '.join(sorted(allowed))}."
        )
    tmpdir = tempfile.mkdtemp(prefix="toolku-")
    path = os.path.join(tmpdir, f"in{ext}")
    try:
        f.save(path)
        if os.path.getsize(path) == 0:
            raise ValueError("File kosong.")
    except Exception:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise
    return path, tmpdir, name


def _send(path, download_name, mimetype="application/pdf"):
    return send_file(path, mimetype=mimetype, as_attachment=True, download_name=download_name)


# ---------------------------------------------------------------- job helpers
def _valid_job_id(job_id):
    return bool(_UUID_HEX_RE.match(job_id or ""))


def _job_dir(job_id):
    return os.path.join(JOB_ROOT, job_id)


def _write_status(job_id, **kwargs):
    if not _valid_job_id(job_id):
        return
    job_dir = _job_dir(job_id)
    os.makedirs(job_dir, exist_ok=True)
    status_path = os.path.join(job_dir, "status.json")
    tmp_path = os.path.join(job_dir, f"status.{uuid.uuid4().hex[:8]}.tmp")
    with STATUS_LOCK:
        status = {}
        if os.path.exists(status_path):
            with open(status_path, "r", encoding="utf-8") as f:
                try:
                    status = json.load(f)
                except Exception:
                    status = {}
        status.update(kwargs)
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(status, f, indent=2)
        os.replace(tmp_path, status_path)


def _get_status(job_id):
    if not _valid_job_id(job_id):
        return None
    status_path = os.path.join(_job_dir(job_id), "status.json")
    if not os.path.exists(status_path):
        return None
    with open(status_path, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except Exception:
            return None


def _delete_job(job_id):
    if not _valid_job_id(job_id):
        return
    job_dir = _job_dir(job_id)
    if os.path.exists(job_dir):
        shutil.rmtree(job_dir, ignore_errors=True)


def _schedule_cleanup(job_id, delay=JOB_CLEANUP_TIME):
    timer = threading.Timer(delay, _delete_job, args=[job_id])
    timer.daemon = True
    timer.start()


def _run_translation_job(job_id, job_dir, source, target, fmt):
    """Run translation in background thread and update job status."""
    slot_acquired = False
    try:
        src_path = os.path.join(job_dir, "input.pdf")
        doc = fitz.open(src_path)
        total_pages = doc.page_count
        doc.close()

        ext = {"pdf": ".pdf", "txt": ".txt", "docx": ".docx"}[fmt]
        out_path = os.path.join(job_dir, "output" + ext)

        _write_status(
            job_id,
            status="processing",
            current_page=0,
            total_pages=total_pages,
            error=None,
            result_path=None,
        )

        def page_progress_callback(page, total):
            _write_status(job_id, current_page=page, total_pages=total)

        def progress_callback(block_idx, total_blocks):
            pass

        if not CONVERT_SLOTS.acquire(blocking=False):
            _write_status(
                job_id,
                status="error",
                error="Server sedang sibuk (terjemahan PDF berjalan). Coba lagi sebentar.",
            )
            return
        slot_acquired = True

        try:
            _translate_pdf(
                src_path,
                out_path,
                source,
                target,
                fmt,
                progress=progress_callback,
                page_progress=page_progress_callback,
            )
        except TranslateError as e:
            _write_status(job_id, status="error", error=e.msg)
        except Exception as e:  # noqa: BLE001
            _write_status(job_id, status="error", error=str(e))
        else:
            _write_status(job_id, status="done", result_path=out_path)
            _schedule_cleanup(job_id)

    except Exception as e:  # noqa: BLE001
        _write_status(job_id, status="error", error=str(e))
    finally:
        if slot_acquired:
            CONVERT_SLOTS.release()


# ---------------------------------------------------------------- Office → PDF
def _office_to_pdf(tool):
    try:
        src, tmpdir, orig = _save_upload(tool)
    except ValueError as e:
        return _err(str(e))
    try:
        if not CONVERT_SLOTS.acquire(blocking=False):
            return _err("Server sedang sibuk (transformasi PDF berjalan). Coba lagi sebentar.", 503)
        outdir = tempfile.mkdtemp(prefix="toolku-out-")
        try:
            out = run_soffice(src, outdir, fmt="pdf")
            base = secure_filename(os.path.splitext(orig)[0]) or "dokumen"
            return _send(out, base + ".pdf")
        finally:
            shutil.rmtree(outdir, ignore_errors=True)  # F4: never leak (F4)
            CONVERT_SLOTS.release()  # slot selalu dilepas (bug hardening v1)
    except Exception as e:  # noqa: BLE001
        return _err(f"Konversi gagal: {e}", 500)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@api.post("/convert/<tool>")
def convert(tool):
    if tool in ("word-to-pdf", "pptx-to-pdf", "excel-to-pdf"):
        return _office_to_pdf(tool)
    return _err("Tool tidak dikenal.", 404)


# ---------------------------------------------------------------- DWG → PDF
@api.post("/dwg-to-pdf")
def dwg_to_pdf():
    try:
        src, tmpdir, orig = _save_upload("dwg-to-pdf")
    except ValueError as e:
        return _err(str(e))
    outdir = None
    slot_acquired = False
    try:
        if not CONVERT_SLOTS.acquire(blocking=False):
            return _err("Server sedang sibuk (konversi berjalan). Coba lagi sebentar.", 503)
        slot_acquired = True

        outdir = tempfile.mkdtemp(prefix="toolku-dwg-")
        base = secure_filename(os.path.splitext(orig)[0]) or "gambar"
        ext = os.path.splitext(src)[1].lower()

        # DXF → PDF via LibreOffice Draw
        if ext == ".dxf":
            out = run_soffice(src, outdir, fmt="pdf")
            return _send(out, base + ".pdf")

        # DWG → DXF via dwg2dxf (libredwg), then DXF → PDF
        dwg2dxf = shutil.which("dwg2dxf")
        if not dwg2dxf:
            return _err(
                "Server ini belum punya libredwg (dwg2dxf). Upload file .dxf sebagai gantinya.",
                501,
            )
        r = subprocess.run(
            [dwg2dxf, "-o", os.path.join(outdir, base + ".dxf"), src],
            capture_output=True,
            timeout=120,
        )
        dxf = os.path.join(outdir, base + ".dxf")
        if not os.path.exists(dxf):
            return _err(
                f"Konversi DWG gagal: {r.stderr.decode('utf-8', 'ignore')[:200]}",
                500,
            )
        out = run_soffice(dxf, outdir, fmt="pdf")
        return _send(out, base + ".pdf")
    except Exception as e:  # noqa: BLE001
        return _err(f"Konversi DWG gagal: {e}", 500)
    finally:
        if slot_acquired:
            CONVERT_SLOTS.release()
        shutil.rmtree(tmpdir, ignore_errors=True)
        if outdir:
            shutil.rmtree(outdir, ignore_errors=True)  # F4: never leak


# ---------------------------------------------------------------- Compress
@api.post("/pdf-compress")
def pdf_compress():
    try:
        src, tmpdir, orig = _save_upload("pdf-compress")
    except ValueError as e:
        return _err(str(e))
    try:
        before = os.path.getsize(src)
        dpi = int(request.form.get("dpi", 150))
        quality = int(request.form.get("quality", 80))
        if not (50 <= dpi <= 600):
            return _err("DPI harus 50-600.", 400)
        if not (10 <= quality <= 100):
            return _err("Quality harus 10-100.", 400)
        out = os.path.join(tmpdir, "out.pdf")
        try:
            _render_pdf_at_dpi(src, out, dpi, quality)
        except Exception as e:  # noqa: BLE001
            return _err(f"Render + re-encode gagal: {e}", 500)
        after = os.path.getsize(out)
        # Fallback: stream-only pikepdf compress (finite gains on odd PDFs)
        if after >= before:
            try:
                with pikepdf.open(src) as pdf:
                    pdf.save(
                        out,
                        compress_streams=True,
                        object_stream_mode=pikepdf.ObjectStreamMode.generate,
                        linearize=False,
                        normalize_content=True,
                        recompress_flate=True,
                    )
                after = os.path.getsize(out)
            except Exception:
                pass
        if after >= before:
            return _send(src, secure_filename(os.path.splitext(orig)[0]) + ".pdf")
        base = secure_filename(os.path.splitext(orig)[0]) or "dokumen"
        return _send(out, base + "-kompres.pdf")
    except Exception as e:  # noqa: BLE001
        return _err(f"Kompresi gagal: {e}", 500)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


# ---------------------------------------------------------------- helpers
# Render-based image compression (dpi / quality). Used by pdf-compress when
# dpi/quality are supplied; replaces the older pikepdf-only stream squash.
MAX_PAGES = 150          # hard guard: scanning many pages eats RAM/CPU
MAX_PIXELS = 16_000_000  # cap device pixels per page (safe for the 4 GB host)


def _pix_to_jpeg(pix: fitz.Pixmap, quality: int) -> bytes:
    """Rendered Pixmap -> JPEG bytes at `quality`."""
    mode = {1: "L", 3: "RGB", 4: "RGBA"}.get(pix.n, "RGB")
    img = Image.frombytes(mode, (pix.width, pix.height), pix.samples)
    img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()


def _render_pdf_at_dpi(src: str, out: str, dpi: int, quality: int) -> None:
    """Open `src`, render every page at `dpi` and re-encode images at
    `quality` into `out`."""
    doc = fitz.open(src)
    if doc.page_count == 0:
        raise ValueError("PDF kosong.")
    if doc.page_count > MAX_PAGES:
        raise ValueError(f"PDF terlalu banyak halaman ({doc.page_count} > {MAX_PAGES}).")
    if dpi > 600:
        dpi = 600
    out_doc = fitz.open()
    try:
        for page in doc:
            w_px = int(page.rect.width * dpi / 72)
            h_px = int(page.rect.height * dpi / 72)
            if w_px * h_px > MAX_PIXELS:
                raise ValueError(
                    f"Halaman {page.number + 1} terlalu dalam untuk dpi={dpi} "
                    f"(maksimal {int(MAX_PIXELS ** 0.5)}x{int(MAX_PIXELS ** 0.5)}px). "
                    "Gunakan DPI yang lebih rendah."
                )
            mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            jpg = _pix_to_jpeg(pix, quality)
            newpage = out_doc.new_page(width=page.rect.width, height=page.rect.height)
            newpage.insert_image(newpage.rect, stream=jpg)
    finally:
        doc.close()
    out_doc.save(out, garbage=0, clean=0, deflate=True, compression_effort=5)
    out_doc.close()


# ---------------------------------------------------------------- Protect / unprotect
@api.post("/pdf-protect")
def pdf_protect():
    try:
        src, tmpdir, orig = _save_upload("pdf-protect")
    except ValueError as e:
        return _err(str(e))
    try:
        password = (request.form.get("password") or "").strip()
        if not password:
            return _err("Password wajib diisi.")
        owner = request.form.get("owner_password") or password
        perms = (request.form.get("permissions") or "print").split(",")
        allow = pikepdf.Permissions(
            accessibility=True,
            print_lowres="print" in perms or "print-high" in perms,
            print_highres="print-high" in perms,
            extract="copy" in perms,
            modify_annotation="annotate" in perms,
            modify_assembly="modify" in perms,
            modify_form="modify" in perms,
            modify_other="modify" in perms,
        )

        out = os.path.join(tmpdir, "out.pdf")
        with pikepdf.open(src) as pdf:
            pdf.save(
                out,
                encryption=pikepdf.Encryption(
                    user=password,
                    owner=owner,
                    R=6,          # AES-256 (PDF 2.0)
                    aes=True,
                    allow=allow,
                ),
            )
        base = secure_filename(os.path.splitext(orig)[0]) or "dokumen"
        return _send(out, base + "-terproteksi.pdf")
    except Exception as e:  # noqa: BLE001
        return _err(f"Proteksi gagal: {e}", 500)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@api.post("/pdf-unprotect")
def pdf_unprotect():
    try:
        src, tmpdir, orig = _save_upload("pdf-unprotect")
    except ValueError as e:
        return _err(str(e))
    try:
        password = request.form.get("password") or ""
        out = os.path.join(tmpdir, "out.pdf")
        with pikepdf.open(src, password=password) as pdf:
            pdf.save(out)
        base = secure_filename(os.path.splitext(orig)[0]) or "dokumen"
        return _send(out, base + "-terbuka.pdf")
    except pikepdf.PasswordError:
        return _err("Password salah.", 403)
    except Exception as e:  # noqa: BLE001
        return _err(f"Gagal membuka PDF: {e}", 500)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


# ---------------------------------------------------------------- Translate
@api.get("/languages")
def lt_languages():
    """Proxy the LibreTranslate language list so the UI always matches the
    languages the running translation container actually has loaded."""
    try:
        with urllib.request.urlopen(f"{LT_URL}/languages", timeout=10) as r:
            data = json.loads(r.read().decode("utf-8"))
        return jsonify({"ok": True, "languages": data})
    except Exception as e:  # noqa: BLE001
        return _err(f"Gagal mengambil daftar bahasa: {e}", 502)


@api.post("/translate")
def translate_text():
    """Translate text using the local LibreTranslate container."""
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    source = (data.get("source") or "auto").strip()
    target = (data.get("target") or "id").strip()

    if not text:
        return _err("Teks harus diisi.", 400)

    if len(text) > 5000:
        return _err("Teks terlalu panjang (maks 5000 karakter).", 413)

    try:
        payload = json.dumps({
            "q": text,
            "source": source,
            "target": target,
            "format": "text",
        }).encode("utf-8")

        req = urllib.request.Request(
            f"{LT_URL}/translate",
            data=payload,
            headers={"Content-Type": "application/json", "User-Agent": "ToolKu/1.0"},
        )

        with urllib.request.urlopen(req, timeout=30) as r:
            result = json.loads(r.read().decode("utf-8"))

        if "translatedText" in result:
            return jsonify({
                "ok": True,
                "translatedText": result["translatedText"],
                "detectedSourceLanguage": result.get("detectedSourceLanguage"),
            })
        else:
            return _err("Terjemahan gagal: " + str(result.get("error", "unknown")), 502)

    except urllib.error.HTTPError as e:
        return _err(f"Server terjemahan menolak: {e.code}", 502)
    except Exception as e:  # noqa: BLE001
        return _err(f"Gagal terhubung ke layanan terjemahan: {e}", 502)


# ---------------------------------------------------------------- Translate PDF
@api.post("/pdf-translate")
def pdf_translate():
    """Start asynchronous PDF translation job.

    Returns 202 with job_id for polling status.
    """
    try:
        src, tmpdir, orig = _save_upload("pdf-translate")
    except ValueError as e:
        return _err(str(e))
    try:
        source = (request.form.get("source") or "auto").strip()[:10]
        target = (request.form.get("target") or "id").strip()[:10]
        fmt = (request.form.get("format") or "pdf").strip().lower()
        if fmt not in ("pdf", "txt", "docx"):
            return _err("Format output harus pdf, docx, atau txt.", 400)
        if not target:
            return _err("Bahasa tujuan wajib dipilih.", 400)

        job_id = uuid.uuid4().hex
        job_dir = os.path.join(JOB_ROOT, job_id)
        os.makedirs(job_dir, exist_ok=True)

        # Copy uploaded file to job directory
        input_path = os.path.join(job_dir, "input.pdf")
        shutil.copy2(src, input_path)

        # Write initial status
        _write_status(job_id, status="processing",
                      current_page=0, total_pages=0,
                      error=None, result_path=None)

        # Start background thread
        thread = threading.Thread(
            target=_run_translation_job,
            args=(job_id, job_dir, source, target, fmt),
            daemon=True,
        )
        thread.start()

        return jsonify({"job_id": job_id, "status": "processing"}), 202
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@api.get("/pdf-translate/status/<job_id>")
def pdf_translate_status(job_id):
    """Return job status for polling."""
    if not _valid_job_id(job_id):
        return _err("Job ID tidak valid.", 400)
    status = _get_status(job_id)
    if status is None:
        return _err("Job tidak ditemukan.", 404)
    return jsonify(status), 200


@api.get("/pdf-translate/download/<job_id>")
def pdf_translate_download(job_id):
    """Download translated file if job is done."""
    if not _valid_job_id(job_id):
        return _err("Job ID tidak valid.", 400)
    status = _get_status(job_id)
    if status is None:
        return _err("Job tidak ditemukan.", 404)
    if status.get("status") != "done":
        return _err("Translasi belum selesai.", 202)
    result_path = status.get("result_path")
    if not result_path or not os.path.exists(result_path):
        return _err("File hasil tidak ditemukan.", 500)
    ext = os.path.splitext(result_path)[1].lower()
    mimetype = {
        ".pdf": "application/pdf",
        ".txt": "text/plain",
        ".docx": "application/vnd.openxmlformats-officedocument"
                 ".wordprocessingml.document",
    }.get(ext, "application/octet-stream")
    return _send(result_path, os.path.basename(result_path), mimetype)


# ---------------------------------------------------------------- guards
def _api_guard():
    """CSRF gate + per-route rate limit for all /api endpoints (F1/F2)."""
    if request.method == "POST" and not csrf_ok():
        return _err("CSRF token tidak valid. Muat ulang halaman dan coba lagi.", 403)
    ip = request.remote_addr or "local"
    path = request.path
    if path == "/api/languages":
        limit = 30
    elif path == "/api/translate":
        limit = 20
    elif path == "/api/pdf-compress":
        limit = 8
    elif path == "/api/pdf-protect":
        limit = 8
    elif path == "/api/pdf-unprotect":
        limit = 8
    elif path == "/api/pdf-translate":
        limit = 5
    elif path == "/api/dwg-to-pdf":
        limit = 6
    elif path.startswith("/api/convert/"):
        limit = 10
    else:
        return None
    if not LIMITER.allow(f"{ip}:{path}", limit):
        return _err(
            f"Terlalu banyak permintaan (max {limit}/menit). Tunggu sebentar.",
            429,
        )
    return None


@api.before_request
def _guard():
    return _api_guard()

from flask import Flask, render_template, abort, request, Response
import os
import secrets

from hardening import (LIMITER, ensure_csrf, proxy_fetch_image, ProxyError,
                       PROXY_MAX_BYTES)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024  # 32 MB per upload (F2)
_secret = os.environ.get("SECRET_KEY", "").strip()
if not _secret or _secret.startswith("ganti-dengan-"):
    app.logger.warning("PERINGATAN: SECRET_KEY belum diatur atau masih placeholder! Sesi/CSRF bisa tidak konsisten.")
    _secret = _secret or secrets.token_hex(32)
app.secret_key = _secret
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("TOOLKU_SECURE_COOKIES") == "1",
    PERMANENT_SESSION_LIFETIME=86400)


@app.context_processor
def _inject_csrf():
    return {"csrf_token": ensure_csrf}



TOOLS = [
    # ---------- PDF (lama) ----------
    dict(slug="pdf-merge", name="Gabung PDF", icon="📑", cat="PDF", libs=["pdf-lib.min.js"],
         desc="Satukan beberapa PDF jadi satu file — atur urutannya sebelum digabung."),
    dict(slug="pdf-split", name="Pisah PDF", icon="✂️", cat="PDF", libs=["pdf-lib.min.js", "jszip.min.js"],
         desc="Ambil halaman tertentu, pisah per rentang, atau pecah tiap N halaman jadi PDF terpisah."),
    dict(slug="pdf-to-img", name="PDF ke Gambar", icon="🖼️", cat="PDF", libs=["pdf.min.js", "jszip.min.js"],
         desc="Simpan halaman PDF sebagai gambar PNG atau JPG, pilih resolusi hingga 4x."),
    dict(slug="img-to-pdf", name="Gambar ke PDF", icon="📷", cat="PDF", libs=["pdf-lib.min.js"],
         desc="Gabungkan foto dan gambar jadi satu PDF — atur urutan, ukuran kertas, dan margin."),
    dict(slug="pdf-organize", name="Atur Halaman PDF", icon="🗂️", cat="PDF", libs=["pdf-lib.min.js", "pdf.min.js", "jszip.min.js"],
         desc="Susun ulang dengan seret, putar, duplikat, atau hapus halaman — lengkap dengan thumbnail."),
    dict(slug="pdf-watermark", name="Watermark PDF", icon="💧", cat="PDF", libs=["pdf-lib.min.js"],
         desc="Pasang teks watermark transparan di semua halaman — tengah atau berulang (tiled)."),
    dict(slug="pdf-page-number", name="Nomor Halaman PDF", icon="🔢", cat="PDF", libs=["pdf-lib.min.js"],
         desc="Tambah nomor halaman: pilih posisi, format, ukuran, dan halaman awal."),
    # ---------- PDF Tools (Word/Excel/PPT/DWG & Keamanan) ----------
    dict(slug="word-to-pdf", name="Word ke PDF", icon="📄", cat="PDF", libs=[],
         desc="Ubah dokumen Word (.docx) jadi PDF, langsung unduh. Diproses di server lalu file dihapus.",
         server=True),
    dict(slug="pptx-to-pdf", name="PowerPoint ke PDF", icon="📊", cat="PDF", libs=[],
         desc="Ubah presentasi PowerPoint (.pptx) jadi PDF, satu halaman per slide.",
         server=True),
    dict(slug="excel-to-pdf", name="Excel ke PDF", icon="📗", cat="PDF", libs=[],
         desc="Ubah spreadsheet Excel (.xlsx) atau CSV jadi PDF tabel yang rapi.",
         server=True),
    dict(slug="dwg-to-pdf", name="DWG ke PDF", icon="📐", cat="PDF", libs=[],
         desc="Ubah gambar AutoCAD (.dwg/.dxf) jadi PDF vektor — pilih kertas, skala, dan warna.",
         server=True),
    dict(slug="pdf-to-word", name="PDF ke Word", icon="📝", cat="PDF", libs=["pdf.min.js", "docx.bundle.js"],
         desc="Ubah PDF jadi dokumen Word (.docx) yang teksnya bisa diedit."),
    dict(slug="pdf-to-excel", name="PDF ke Excel", icon="📈", cat="PDF", libs=["pdf.min.js", "xlsx.full.min.js"],
         desc="Ambil tabel dari PDF jadi spreadsheet Excel (.xlsx) — angka langsung bisa dihitung."),
    dict(slug="pdf-to-dwg", name="PDF ke DWG", icon="📏", cat="PDF", libs=["pdf.min.js"],
         desc="Ambil garis, kurva, dan teks vektor dari PDF — hasil DXF yang bisa diedit di AutoCAD."),
    # ---------- PDF Tools (Word/Excel/PPT/DWG & Keamanan) ----------
    dict(slug="pdf-sign", name="Tanda Tangan PDF", icon="✍️", cat="PDF", libs=["pdf-lib.min.js", "pdf.min.js"],
         desc="Gambar (sensor tekanan) atau unggah tanda tanganmu, lalu tempel di halaman mana pun."),
    dict(slug="pdf-ink-saver", name="PDF Hemat Tinta", icon="🖨️", cat="PDF", libs=["pdf-lib.min.js", "pdf.min.js", "jszip.min.js"],
         desc="Ubah PDF jadi abu-abu atau hitam-putih (atur adjustable) sebelum dicetak — teks jadi gambar."),
    dict(slug="pdf-edit", name="Edit PDF", icon="🖊️", cat="PDF", libs=["pdf-lib.min.js", "pdf.min.js"],
         desc="Tambah teks, gambar, kotak, garis, centang, dan coretan di halaman mana pun."),
    dict(slug="pdf-compress", name="Kompres PDF", icon="🗜️", cat="PDF", libs=[],
         desc="Perkecil ukuran PDF: atur DPI & kualitas gambar, plus optimasi struktur. Hasilnya tidak pernah lebih besar dari aslinya.",
         server=True),
    dict(slug="pdf-redact", name="Redaksi PDF", icon="🔴", cat="PDF", libs=["pdf-lib.min.js", "pdf.min.js", "jszip.min.js"],
         desc="Tandai area di halaman lalu hitamkan permanen — teks asli benar-benar dihapus dari file."),
    dict(slug="pdf-protect", name="Proteksi PDF", icon="🔐", cat="PDF", libs=[],
         desc="Kunci PDF dengan password AES-256 dan batasi cetak, salin, atau ubah.",
         server=True),
    dict(slug="pdf-unprotect", name="Buka Proteksi PDF", icon="🔓", cat="PDF", libs=[],
         desc="Hapus password atau batasan dari PDF milikmu sendiri.",
         server=True),
    dict(slug="pdf-translate", name="Terjemah PDF", icon="🌐", cat="PDF", libs=[],
         desc="Terjemahkan PDF ke bahasa lain (LibreTranslate lokal) — hasil sebagai PDF ber-layout asli, .docx, atau .txt.",
         server=True),
    # ---------- Gambar ----------
    dict(slug="img-compress", name="Kompres & Resize Gambar", icon="🗜️", cat="Gambar", libs=[],
         desc="Perkecil ukuran gambar dan atur dimensinya — lihat perbandingan ukuran sebelum & sesudah."),
    dict(slug="img-convert", name="Konversi Format Gambar", icon="🔄", cat="Gambar", libs=["jszip.min.js"],
         desc="Ubah gambar antara PNG, JPG, dan WebP — dari file atau langsung dari URL, bisa banyak sekaligus."),
    dict(slug="img-base64", name="Gambar ↔ Base64", icon="🧬", cat="Gambar", libs=[],
         desc="Ubah gambar jadi string Base64 (data URL), atau kembalikan Base64 jadi gambar."),
    # ---------- Teks & Developer ----------
    dict(slug="json-formatter", name="JSON Formatter", icon="🧾", cat="Teks & Developer", libs=[],
         desc="Rapikan, minify, dan validasi JSON — error ditampilkan dengan posisi barisnya."),
    dict(slug="base64", name="Base64 Encode/Decode", icon="🔐", cat="Teks & Developer", libs=[],
         desc="Encode dan decode teks Base64 — aman untuk UTF-8 (emoji, aksara non-Latin)."),
    dict(slug="url-encode", name="URL Encode/Decode", icon="🔗", cat="Teks & Developer", libs=[],
         desc="Encode dan decode URL atau komponen URL (percent-encoding)."),
    dict(slug="hash", name="Hash Generator", icon="#️⃣", cat="Teks & Developer", libs=["md5.min.js"],
         desc="Hitung MD5, SHA-1, SHA-256, SHA-384, SHA-512 dari teks atau file."),
    dict(slug="uuid", name="UUID Generator", icon="🆔", cat="Teks & Developer", libs=[],
         desc="Buat UUID v4 acak dalam jumlah banyak — opsi huruf besar dan tanpa tanda hubung."),
    dict(slug="password", name="Password Generator", icon="🗝️", cat="Teks & Developer", libs=[],
         desc="Buat password acak yang kuat dengan crypto browser — atur panjang dan karakter."),
    dict(slug="qr", name="QR Code Generator", icon="📱", cat="Teks & Developer", libs=["qrcode.js"],
         desc="Buat QR code dari teks atau URL — pilih ukuran, warna, dan level koreksi error, unduh PNG."),
    dict(slug="markdown", name="Markdown Preview", icon="📝", cat="Teks & Developer", libs=["marked.min.js", "purify.min.js"],
         desc="Tulis Markdown dan lihat hasilnya langsung — ekspor jadi HTML yang aman (sanitized)."),
    dict(slug="diff", name="Text Diff", icon="🔍", cat="Teks & Developer", libs=["diff.min.js"],
         desc="Bandingkan dua teks baris per baris — additions dan deletions ditandai warna."),
    dict(slug="case-converter", name="Case Converter", icon="🔤", cat="Teks & Developer", libs=[],
         desc="Ubah teks: UPPER, lower, Title, camelCase, PascalCase, snake_case, kebab-case, dan lainnya."),
    dict(slug="word-counter", name="Word Counter", icon="📊", cat="Teks & Developer", libs=[],
         desc="Hitung kata, karakter, kalimat, paragraf, dan estimasi waktu baca secara real-time."),
    dict(slug="regex", name="Regex Tester", icon="🎯", cat="Teks & Developer", libs=[],
         desc="Uji pola regular expression — match disorot langsung di teks, lengkap dengan capture group."),
    dict(slug="jwt-decoder", name="JWT Decoder", icon="🎫", cat="Teks & Developer", libs=[],
         desc="Decode header dan payload JSON Web Token — klaim exp/iat ditampilkan sebagai tanggal."),
    dict(slug="timestamp", name="Timestamp Converter", icon="⏱️", cat="Teks & Developer", libs=[],
         desc="Konversi Unix timestamp ke tanggal (WIB/UTC/lokal) dan sebaliknya — detik atau milidetik."),
    dict(slug="translate", name="Terjemah Teks", icon="🌐", cat="Teks & Developer", libs=[],
         desc="Terjemahkan teks ke bahasa lain memakai LibreTranslate self-hosted (container terpisah). Daftar bahasa diambil otomatis dari server.",
         server=True),
    # ---------- Utilitas ----------
    dict(slug="unit-converter", name="Konversi Satuan", icon="📏", cat="Utilitas", libs=[],
         desc="Konversi panjang, berat, suhu, data, waktu, dan kecepatan — hasil langsung saat mengetik."),
    dict(slug="color-converter", name="Konversi Warna", icon="🎨", cat="Utilitas", libs=[],
         desc="Konversi warna HEX, RGB, HSL — dengan color picker dan preview langsung."),
]

BY_SLUG = {t["slug"]: t for t in TOOLS}


@app.route("/")
def index():
    cats = sorted(set(t.get("cat") for t in TOOLS))
    if 'PDF' in cats:
        cats.remove('PDF')
        cats = ['PDF'] + cats
    grouped = [(c, [t for t in TOOLS if t["cat"] == c]) for c in cats]
    return render_template("index.html", grouped=grouped, total=len(TOOLS))


@app.route("/tool/<slug>")
def tool(slug):
    t = BY_SLUG.get(slug)
    if not t:
        abort(404)
    return render_template("tool.html", t=t)


@app.route("/healthz")
def healthz():
    ip = request.remote_addr or "local"
    if not LIMITER.allow(f"healthz:{ip}", 60, 60):
        return ({"status": "rate_limited"}, 429)
    return {"status": "ok", "tools": len(TOOLS), "server_tools": sum(1 for t in TOOLS if t.get("server"))}


# ---------- URL proxy (for mode URL) ----------
PROXY_TIMEOUT = 20
PROXY_MAX_BYTES = 25 * 1024 * 1024  # images only (F1/F3)


def _proxy_rate_limit(key):
    if not LIMITER.allow(f"proxy:{key}", 30, 60):
        return ("Terlalu banyak permintaan (30/menit/IP). Tunggu sebentar.", 429)
    return None, None


@app.route("/api/proxy")
def proxy():
    """Fetch an image from a remote URL (secure + rate limited).

    Hardening for F1/F3:
    - every DNS record resolved first, any internal record => 403;
    - connection is pinned to the resolved IP so a DNS-rebind between the
      check and the connect cannot redirect traffic inward;
    - redirects are re-validated and re-pinned on each hop (max 5);
    - only image/* content types are accepted (image/png/jpeg/webp/gif/bmp),
      so HTML/JS can never be served through this endpoint;
    - response is capped at 25 MB.
    """
    ip = request.remote_addr or "unknown"
    body, code = _proxy_rate_limit(ip)
    if body:
        return body, code

    url = request.args.get("url", "").strip()
    if not url:
        return ("URL kosong", 400)
    try:
        data, ctype = proxy_fetch_image(url)
    except ProxyError as e:
        return (str(e), e.code)
    except Exception as e:  # noqa: BLE001
        return (f"Proxy gagal: {e}", 502)

    return Response(data, status=200, mimetype=ctype,
                    headers={"Cache-Control": "no-store"})


# register server-side API blueprint (import at end to avoid circular import)
from server_api import api as server_api_bp  # noqa: E402
app.register_blueprint(server_api_bp)


@app.after_request
def security_headers(resp):
    # Hide server stack version even from local debug proxies / error pages.
    resp.headers["Server"] = "toolku"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"  # strictest; CSP frame-ancestors 'none' also applies
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; "
        "worker-src 'self'; frame-src 'none'; object-src 'none'; "
        "base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    )
    # HSTS is a no-op over plain HTTP but mandatory once behind TLS.
    resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    resp.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), "
        "serial=(), bluetooth=(), interest-cohort=()"
    )
    resp.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    resp.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    if request.path.startswith("/api"):
        resp.headers["Cache-Control"] = "no-store"  # converted files: only server memory
    return resp


if __name__ == "__main__":
    from werkzeug.serving import WSGIRequestHandler
    # Hide Werkzeug/Python version string from error pages and HTTP headers.
    WSGIRequestHandler.server_version = "toolku"
    WSGIRequestHandler.sys_version = ""
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port)

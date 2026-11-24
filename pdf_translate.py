"""Terjemah PDF (PDF → PDF/TXT/DOCX) memakai LibreTranslate lokal + PyMuPDF.

Modul ini dipisah dari `server_api.py` supaya logic DPI/terjemahan tidak
membengkakkan file API. Tidak ada dependency baru: hanya `pymupdf` (fitz),
`urllib.request`, `json`, dan `zipfile` (bawaan Python) untuk menghasilkan
file .docx.

Alur PDF (layout asli / in-place replacement):
  1. `page.get_text("blocks")` → blok teks + bbox;
  2. tiap blok dikirim ke `${LT_URL}/translate`;
  3. teks asli dihapus dengan `add_redact_annot()` + `apply_redactions()`;
     `images=PDF_REDACT_IMAGE_NONE` menjaga gambar/grafik latar tetap utuh;
  4. teks terjemahan ditulis pada bbox yang sama dengan `insert_htmlbox()`
     → ukuran font menyesuaikan diri (auto-scale) dan mendukung Unicode
     (Arab, Mandarin, Jepang, Korea) lewat font fallback MuPDF.
"""
import html
import io
import json
import os
import re
import urllib.error
import urllib.request
import zipfile

import pymupdf as fitz

# ---------------------------------------------------------------- konfigurasi
LT_URL = os.environ.get("LT_URL", "http://libretranslate:5000").rstrip("/")

# Batas keras supaya satu request tidak membebani CPU/RAM (lihat hardening.py).
MAX_PAGES = 250          # jumlah halaman maksimum per dokumen
MAX_BLOCKS = 25000       # jumlah blok teks maksimum per dokumen
MAX_BLOCK_CHARS = 4000   # panjang maksimum satu blok sebelum dipotong
LT_TIMEOUT = 120         # timeout per panggilan /translate (detik)
MAX_LT_RETRIES = 2       # jumlah percobaan ulang saat service sibuk
BATCH_SIZE = 50          # jumlah teks maksimal per request HTTP
BATCH_CHAR_LIMIT = 4000  # jumlah karakter maksimal per request HTTP

# Font dasar untuk fallback terakhir (jika HTML box tidak muat).
BASE_FONT = "helv"

# Aksara RTL (Arab, Hebr, dll.) — dipakai untuk mengatur arah teks di HTML.
_RTL_RE = re.compile(r"[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F"
                     r"\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]")


class TranslateError(Exception):
    """Kegagalan yang layak ditampilkan ke user (pesan sudah ramah)."""

    def __init__(self, msg, code=400):
        super().__init__(msg)
        self.msg = msg
        self.code = code


# ---------------------------------------------------------------- LibreTranslate
def lt_translate(text, source, target, timeout=LT_TIMEOUT):
    """Terjemahkan satu segmen teks via LibreTranslate lokal.

    Mengembalikan teks terjemahan. Melempar TranslateError dengan pesan
    ramah bila service sedang sibuk / tidak merespons.
    """
    if not text.strip():
        return text
    payload = json.dumps({
        "q": text,
        "source": source or "auto",
        "target": target,
        "format": "text",
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{LT_URL}/translate",
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "ToolKu/1.0"},
    )
    last_err = None
    for attempt in range(MAX_LT_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                result = json.loads(r.read().decode("utf-8"))
            if "translatedText" in result:
                return result["translatedText"]
            last_err = result.get("error", "unknown")
            # Error dari server LT (mis. "Target language is not loaded") →
            # tidak akan berubah saat di-retry.
            if last_err and "not loaded" in str(last_err):
                break
        except urllib.error.HTTPError as e:
            # 429 = busy, 503 = model sedang dimuat → layak dicoba lagi.
            if e.code in (429, 503) and attempt < MAX_LT_RETRIES:
                last_err = f"HTTP {e.code}"
                continue
            raise TranslateError(
                f"Layanan terjemahan menolak permintaan (HTTP {e.code}). "
                "Coba lagi sebentar.", 502)
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last_err = str(e)
            if attempt < MAX_LT_RETRIES:
                continue
            raise TranslateError(
                "Layanan terjemahan (LibreTranslate) sedang tidak merespons "
                "atau sedang sibuk. Tunggu sebentar lalu coba lagi.", 503)
        except json.JSONDecodeError:
            raise TranslateError(
                "Layanan terjemahan mengembalikan respons yang tidak valid.", 502)
    raise TranslateError(
        f"Terjemahan gagal: {last_err or 'layanan tidak merespons'}.", 502)


def lt_languages(timeout=10):
    """Ambil daftar bahasa yang benar-benar tersedia di container LT."""
    try:
        with urllib.request.urlopen(f"{LT_URL}/languages", timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:  # noqa: BLE001
        raise TranslateError(
            f"Gagal mengambil daftar bahasa dari layanan terjemahan: {e}", 502)


def lt_translate_batch(texts, source, target, cache, timeout=LT_TIMEOUT):
    """Terjemahkan daftar teks dalam batch menggunakan LibreTranslate.

    Menggunakan cache in‑memory (dictionary) untuk menghindari
    penerjemahan berulang kata/istilah yang sama dalam satu sesi.
    Mengembalikan list hasil terjemahan yang urutannya sama dengan `texts`.
    """
    # Tentukan mana yang belum terjemahkan
    need_translate = []  # list of (original_index, text)
    translations = []
    for idx, text in enumerate(texts):
        if text in cache:
            translations.append(cache[text])
        else:
            translations.append(None)
            need_translate.append((idx, text))

    if not need_translate:
        # Semua sudah di‑cache
        for idx, text in enumerate(texts):
            if text in cache:
                translations[idx] = cache[text]
        return translations

    # Kelompokkan teks yang belum diterjemahkan ke dalam batch
    batches = []
    cur_batch = []
    cur_chars = 0
    for idx, text in need_translate:
        text_len = len(text)
        if cur_batch and (len(cur_batch) >= BATCH_SIZE or cur_chars + text_len + 1 > BATCH_CHAR_LIMIT):
            batches.append(cur_batch)
            cur_batch = []
            cur_chars = 0
        cur_batch.append((idx, text))
        cur_chars += text_len + 1
    if cur_batch:
        batches.append(cur_batch)

    # Proses tiap batch
    for batch in batches:
        batch_indices = [idx for idx, _ in batch]
        batch_texts = [text for _, text in batch]
        payload = json.dumps({
            "q": batch_texts,
            "source": source or "auto",
            "target": target,
            "format": "text",
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{LT_URL}/translate",
            data=payload,
            headers={"Content-Type": "application/json", "User-Agent": "ToolKu/1.0"},
        )
        last_err = None
        for attempt in range(MAX_LT_RETRIES + 1):
            try:
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    result = json.loads(r.read().decode("utf-8"))
                translated = result.get("translatedText")
                if isinstance(translated, list):
                    if len(translated) != len(batch_texts):
                        raise TranslateError(
                            f"Jumlah hasil batch tidak sesuai: {len(translated)} vs {len(batch_texts)}", 500
                        )
                    for (idx, text), trans in zip(batch, translated):
                        cache[text] = trans
                        translations[idx] = trans
                else:
                    # Hanya satu item dalam batch (mungkin string)
                    if len(batch_texts) == 1:
                        cache[batch_texts[0]] = translated
                        translations[batch_indices[0]] = translated
                    else:
                        raise TranslateError("Respons batch tidak sesuai format", 500)
                last_err = None
                break
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as e:
                last_err = str(e)
                if attempt < MAX_LT_RETRIES:
                    continue
                raise TranslateError(
                    "Layanan terjemahan (LibreTranslate) sedang tidak merespons atau sedang sibuk. "
                    "Tunggu sebentar lalu coba lagi.", 503)
            except json.JSONDecodeError:
                raise TranslateError(
                    "Layanan terjemahan mengembalikan respons yang tidak valid.", 502)
            except TranslateError:
                raise
            except Exception as e:
                last_err = str(e)
                if attempt < MAX_LT_RETRIES:
                    continue
                raise TranslateError(f"Terjemahan batch gagal: {last_err}", 502)
        if last_err:
            raise TranslateError(f"Terjemahan batch gagal: {last_err}", 502)

    return translations


# ---------------------------------------------------------------- ekstraksi blok
def _bbox_overlap(a, b):
    """True bila dua bbox bertumpuk (sedikitnya 30% dari sisi terkecil)."""
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix = max(0.0, min(ax1, bx1) - max(ax0, bx0))
    iy = max(0.0, min(ay1, by1) - max(ay0, by0))
    if ix <= 0 or iy <= 0:
        return False
    area_a = max(1e-6, (ax1 - ax0) * (ay1 - ay0))
    area_b = max(1e-6, (bx1 - bx0) * (by1 - by0))
    return (ix * iy) / min(area_a, area_b) > 0.30


def _split_long(text, limit=MAX_BLOCK_CHARS):
    """Potong teks panjang di batas kalimat (kalau perlu) supaya request ke
    LibreTranslate tidak melewati limit server."""
    if len(text) <= limit:
        return [text]
    parts = re.split(r"(?<=[.!?。！？])\s+", text)
    out, cur = [], ""
    for p in parts:
        if cur and len(cur) + len(p) + 1 > limit:
            out.append(cur)
            cur = p
        else:
            cur = f"{cur} {p}".strip()
    if cur:
        out.append(cur)
    # Bagian yang masih terlalu panjang dipotong keras per karakter.
    final = []
    for part in out:
        while len(part) > limit:
            final.append(part[:limit])
            part = part[limit:]
        if part:
            final.append(part)
    return final or [text[:limit]]


def extract_blocks(doc):
    """Kumpulkan blok teks per halaman dari PDF.

    Return: list of dict {page, bbox, text, size}
    """
    blocks = []
    for pno, page in enumerate(doc):
        # Ambil dict sekali per halaman: blok "blocks" (urutan baca) informing
        # posisi, blok "dict" informing ukuran font asli tiap area.
        raw = page.get_text("blocks")
        spans_by_area = []
        for db in page.get_text("dict")["blocks"]:
            if db.get("type") != 0:
                continue
            spans = [sp for ln in db.get("lines", []) for sp in ln.get("spans", [])]
            if spans:
                spans_by_area.append((db["bbox"], max(
                    float(sp.get("size", 0.0)) for sp in spans)))
        for b in raw:
            if b[6] != 0:  # bukan teks (gambar/vektor)
                continue
            text = (b[4] or "").strip()
            if not text:
                continue
            size = 9.0
            for area_bbox, area_size in spans_by_area:
                if _bbox_overlap(area_bbox, b[:4]):
                    size = area_size
                    break
            blocks.append({
                "page": pno,
                "bbox": fitz.Rect(b[:4]),
                "text": text,
                "size": size,
            })
            if len(blocks) > MAX_BLOCKS:
                raise TranslateError(
                    f"PDF punya terlalu banyak blok teks (> {MAX_BLOCKS}). "
                    "Pecah dokumen lebih dulu.", 413)
    return blocks


# ---------------------------------------------------------------- HTML untuk insert
def _build_html(text, size, rtl):
    """Bungkus teks terjemahan menjadi HTML untuk `insert_htmlbox`.

    `font-size` dalam px; MuPDF menafsirkan px di story sebagai 1/72 inch
    (1 px = 1 pt), jadi nilainya sama dengan ukuran font PDF.
    """
    safe = html.escape(text or "")
    style = f"font-size:{max(4.0, float(size)):.2f}px;line-height:1.25;"
    if rtl:
        style += "text-align:right;"
        safe = f'<div dir="rtl">{safe}</div>'
    else:
        safe = f"<div>{safe}</div>"
    return f'<div style="{style}">{safe}</div>'


# MuPDF menambahkan `body {margin:1px;}` sebagai default → teks bergeser 1px
# dari bbox. Kita nolkan supaya hasil duduk persis di kotak yang diminta.
_BOX_CSS = "body {margin:0;}"

# Skala minimum yang masih terbaca. Bila teks otomatis mengecil di bawah
# nilai ini, area teks diperlebar ke ruang kosong di bawahnya.
MIN_SCALE = 0.5


def _expand_rect(page, bbox, all_boxes):
    """Perluas kotak teks ke bawah sampai ketemu blok lain (atau tepi halaman).

    Terjemahan biasanya lebih panjang daripada teks asli, sehingga teks
    asli yang hanya satu baris perlu ruang tambahan untuk membungkus.
    Area di bawah bbox asli kosong di dokumen asli, jadi aman dipakai.
    """
    x0, y0, x1, y1 = bbox
    bottom = page.rect.y1 - 6
    for other in all_boxes:
        if other is None:
            continue
        ox0, oy0, ox1, oy1 = other
        # Hanya blok yang Horizontal overlap dan mulai di bawah bbox ini.
        if oy0 < y1 - 1:
            continue
        ix = min(x1, ox1) - max(x0, ox0)
        if ix <= 0:
            continue
        if ix / max(1e-6, min(x1 - x0, ox1 - ox0)) < 0.30:
            continue
        bottom = min(bottom, oy0 - 1)
    if bottom <= y1 + 0.5:
        return bbox
    return fitz.Rect(x0, y0, x1, bottom)


def _measure_scale(html_text, rect):
    """Perkecilan's skala yang dibutuhkan agar teks muat di `rect`.

    Dipakai untuk mengukur DULU (sebelum menulis), supaya teks tidak
    ditulis dua kali ke halaman yang sama.
    """
    try:
        story = fitz.Story(html=html_text, user_css=_BOX_CSS)
        fit = story.fit_scale(rect, scale_min=1, scale_max=None)
        if not fit.big_enough:
            return None
        return 1.0 / fit.parameter
    except Exception:  # noqa: BLE001
        return None


def _insert_translation(page, bbox, text, size, all_boxes=None):
    """Tulis teks terjemahan pada area teks, dengan auto-scale.

    Strategi:
      1. `insert_htmlbox` dengan `scale_low=0` → MuPDF otomatis mengecilkan
         teks agar muat (dan tetap mendukung Unicode/CJK/Arab).
         CATATAN: `scale_low` > 0 tidak aman — PyMuPDF punya bug internal
         (`assert scale >= scale_low` gagal karena pembulatan float,
         mis. 0.8999999999999999 < 0.9) dan melempar AssertionError.
      2. Bila skalanya terlalu kecil (< MIN_SCALE) → teks jadi tak terbaca.
         Coba lagi dengan area teks yang diperlebar ke ruang kosong di
         bawahnya (area itu kosong di dokumen asli, jadi aman dipakai).
      3. Upsaya terakhir: `insert_textbox` (font dasar).
    """
    rtl = bool(_RTL_RE.search(text))
    html_text = _build_html(text, size, rtl)

    # Ukur dulu, jangan sampai menulis dua kali ke area yang sama.
    scale = _measure_scale(html_text, bbox)
    target_rect = bbox
    if scale is not None and scale < MIN_SCALE and all_boxes is not None:
        bigger = _expand_rect(page, bbox, all_boxes)
        if bigger.height > bbox.height + 1:
            bigger_scale = _measure_scale(html_text, bigger)
            if bigger_scale is not None and bigger_scale > scale:
                target_rect, scale = bigger, bigger_scale

    rc = page.insert_htmlbox(target_rect, html_text, css=_BOX_CSS, scale_low=0)
    if rc[0] >= 0:
        return True
    # Tetap tidak muat → terakhir: tulis dengan font dasar.
    return page.insert_textbox(
        bbox, text, fontsize=max(4.0, size * 0.7),
        fontname=BASE_FONT, align=0) >= 0


# ---------------------------------------------------------------- hasil TXT
def build_txt(pages):
    """Susun teks murni dari hasil terjemahan.

    `pages` = list of (nomor_halaman, [blok terjemahan]).
    """
    out = []
    for pno, blks in pages:
        out.append(f"===== Halaman {pno} =====")
        out.append("")
        for b in blks:
            out.append(b)
            out.append("")
        out.append("")
    return "\n".join(out).rstrip() + "\n"


# ---------------------------------------------------------------- hasil DOCX
# Generator .docx minimal memakai zipfile bawaan Python — tanpa python-docx.
_DOCX_CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"""

_DOCX_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

_DOCX_STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Noto Sans CJK SC" w:cs="Arial"/>
<w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal">
<w:name w:val="Normal"/><w:qFormat/>
</w:style>
</w:styles>"""


def _docx_paragraph(text, bold=False, size_half_points=22):
    clean_text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text or "")
    esc = html.escape(clean_text)
    rpr = "<w:rPr>"
    if bold:
        rpr += "<w:b/>"
    rpr += f'<w:sz w:val="{size_half_points}"/><w:szCs w:val="{size_half_points}"/>'
    rpr += "</w:rPr>"
    # xml:space="preserve" menjaga spasi di awal/akhir paragraf.
    return (f'<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>'
            f'<w:r>{rpr}<w:t xml:space="preserve">{esc}</w:t></w:r></w:p>')


def build_docx(pages, title=None):
    """Buat file .docx (bytes) berisi paragraf hasil terjemahan.

    `pages` = list of (nomor_halaman, [blok terjemahan]).
    """
    body = []
    if title:
        body.append(_docx_paragraph(title, bold=True, size_half_points=32))
    for pno, blks in pages:
        body.append(_docx_paragraph(f"Halaman {pno}", bold=True, size_half_points=26))
        for b in blks:
            for line in (b or "").split("\n"):
                body.append(_docx_paragraph(line))
    body.append('<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
                '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>'
                "</w:sectPr>")
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{''.join(body)}</w:body></w:document>"
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", _DOCX_CONTENT_TYPES)
        z.writestr("_rels/.rels", _DOCX_RELS)
        z.writestr("word/document.xml", document)
        z.writestr("word/styles.xml", _DOCX_STYLES)
    return buf.getvalue()


# ---------------------------------------------------------------- orkestrator
def translate_pdf(src_path, out_path, source, target, fmt, progress=None, page_progress=None):
    """Terjemahkan PDF dan tulis hasilnya ke `out_path`.

    fmt: "pdf" | "txt" | "docx"
    progress: fungsi untuk progres blok (opsional) - menerima (block_index, total_blocks).
    page_progress: fungsi untuk progres halaman (opsional) - menerima (page, total_pages).
    Mengembalikan dict ringkasan {blocks, pages}.
    """
    if fmt not in ("pdf", "txt", "docx"):
        raise TranslateError("Format output tidak dikenal.", 400)

    try:
        doc = fitz.open(src_path)
    except Exception:  # noqa: BLE001
        raise TranslateError(
            "File PDF tidak bisa dibaca — kemungkinan rusak atau bukan PDF "
            "yang valid. Coba buka dulu di aplikasi PDF.", 400)

    try:
        if doc.page_count == 0:
            raise TranslateError("PDF kosong.", 400)
        if doc.page_count > MAX_PAGES:
            raise TranslateError(
                f"PDF terlalu banyak halaman ({doc.page_count} > {MAX_PAGES}). "
                "Pecah dokumen lebih dulu.", 413)
        blocks = extract_blocks(doc)
        if not blocks:
            raise TranslateError(
                "PDF ini tidak punya layer teks (hasil scan/foto). "
                "Tidak ada yang bisa diterjemahkan — jalankan OCR dulu.", 422)
        page_count = doc.page_count
    finally:
        doc.close()

    # Kelompokkan blok per halaman
    pages_blocks = {}
    for blk in blocks:
        pages_blocks.setdefault(blk["page"], []).append(blk)

    # Cache in‑memory per request
    cache = {}

    # Total blok untuk progress blok (global)
    total_blocks = len(blocks)
    global_block_idx = 0

    # Terjemahkan per halaman untuk melaporkan progres halaman
    for pno in range(page_count):
        pblks = pages_blocks.get(pno, [])
        if not pblks:
            if page_progress:
                page_progress(pno + 1, page_count)
            continue

        # Kumpulkan bagian teks untuk halaman ini
        parts_flat = []  # (block_index_in_page, part_text)
        for i, blk in enumerate(pblks):
            text = blk["text"]
            parts = _split_long(text)
            for part in parts:
                parts_flat.append((i, part))

        # Terjemahkan bagian-bagian dalam batch (dengan caching)
        translated_flat = lt_translate_batch(
            [p[1] for p in parts_flat],
            source,
            target,
            cache,
            timeout=LT_TIMEOUT,
        )

        # Susun hasil ke setiap blok
        block_translations = {}
        for (i, _), trans in zip(parts_flat, translated_flat):
            block_translations.setdefault(i, []).append(trans)

        for i, blk in enumerate(pblks):
            translated_parts = block_translations.get(i, [])
            # Filter out empty strings
            translated_parts = [p for p in translated_parts if p]
            blk["translated"] = "\n".join(translated_parts) if translated_parts else blk["text"]
            # Laporan progres blok global
            if progress:
                progress(global_block_idx, total_blocks)
            global_block_idx += 1

        # Laporan progres halaman
        if page_progress:
            page_progress(pno + 1, page_count)

    # Kelompokkan per halaman untuk TXT & DOCX.
    per_page = {}
    for blk in blocks:
        per_page.setdefault(blk["page"], []).append(blk["translated"])
    pages = [(pno + 1, per_page[pno]) for pno in sorted(per_page)]

    if fmt == "pdf":
        # Tulis ulang PDF: hapus teks asli, sisipkan terjemahan.
        try:
            doc = fitz.open(src_path)
        except Exception:  # noqa: BLE001
            raise TranslateError("File PDF tidak bisa dibaca kembali.", 400)
        try:
            per_page_blocks = {}
            for blk in blocks:
                per_page_blocks.setdefault(blk["page"], []).append(blk)
            for pno, pblks in per_page_blocks.items():
                page = doc[pno]
                for blk in pblks:
                    page.add_redact_annot(blk["bbox"], fill=False, cross_out=False)
                # Gambar & garis vektor di area yang sama TIDAK ikut terhapus.
                page.apply_redactions(
                    images=fitz.PDF_REDACT_IMAGE_NONE,
                    graphics=fitz.PDF_REDACT_LINE_ART_NONE,
                )
                # Semua kotak teks di halaman ini dipakai untuk menentukan
                # ruang kosong yang boleh dipakai untuk teks terjemahan.
                all_boxes = [b["bbox"] for b in pblks]
                for blk in pblks:
                    _insert_translation(page, blk["bbox"], blk["translated"],
                                        blk["size"], all_boxes)
            doc.save(out_path, garbage=3, deflate=True, clean=False)
        finally:
            doc.close()
    elif fmt == "txt":
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(build_txt(pages))
    else:  # docx
        with open(out_path, "wb") as f:
            f.write(build_docx(pages))

    return {"blocks": len(blocks), "pages": page_count}

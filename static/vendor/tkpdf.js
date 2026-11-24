/* ToolKu — helper umum untuk tool PDF berbasis canvas (sign, edit, redact, ink-saver) */
window.TK = window.TK || {};

TK.loadPdf = async function (file) {
  let data = file;
  if (typeof file === 'string') {
    // string = URL/dataURL: baca lewat fetch
    const res = await fetch(file);
    if (!res.ok) throw new Error('Gagal membaca URL: HTTP ' + res.status);
    data = await res.arrayBuffer();
  } else if (typeof file.arrayBuffer === 'function') {
    data = await file.arrayBuffer();
  } else if (file.buffer instanceof ArrayBuffer) {
    data = file.buffer;
  }
  return pdfjsLib.getDocument({ data }).promise;
};

TK.renderPage = async function (pdf, pageNum, scale) {
  const page = await pdf.getPage(pageNum);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return { canvas, viewport: vp, width: canvas.width, height: canvas.height };
};

// Ubah halaman PDF menjadi gambar (untuk ink-saver / redact: teks jadi gambar)
TK.pageToBlob = async function (pdf, pageNum, scale, mime, quality, beforeDraw) {
  const { canvas } = await TK.renderPage(pdf, pageNum, scale);
  if (beforeDraw) beforeDraw(canvas.getContext('2d'), canvas.width, canvas.height);
  return canvasToBlob(canvas, mime || 'image/jpeg', quality === undefined ? 0.92 : quality);
};

// Buat PDF baru dari daftar blob gambar (satu blob per halaman)
TK.blobsToPdf = async function (blobs, pageSizes) {
  const out = await PDFLib.PDFDocument.create();
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i];
    const isPng = b.type === 'image/png';
    const img = isPng ? await out.embedPng(await b.arrayBuffer()) : await out.embedJpg(await b.arrayBuffer());
    const size = (pageSizes && pageSizes[i]) || [img.width, img.height];
    const page = out.addPage(size);
    page.drawImage(img, { x: 0, y: 0, width: size[0], height: size[1] });
  }
  return out.save();
};

// Ambil teks per halaman dengan posisi (untuk PDF ke Word/Excel/PPT)
TK.extractText = async function (pdf) {
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items
      .filter(it => it.str && it.str.trim() !== '')
      .map(it => ({
        text: it.str,
        x: it.transform[4],
        y: vp.height - it.transform[5],   // flip ke koordinat top-left
        w: it.width,
        h: it.height || Math.abs(it.transform[3]) || 10,
        font: (it.fontName || '').toLowerCase(),
      }));
    pages.push({ width: vp.width, height: vp.height, items });
  }
  return pages;
};

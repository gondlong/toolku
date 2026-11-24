
let file = null, pdfDoc = null, pageNo = 1, currentTool = 'select';
let canvas = $('#pdf-canvas'), overlay = $('#overlay'), octx = overlay.getContext('2d');
let scale = 1.6, items = [], imgData = null;

setupDrop('#drop', files => {
  file = files[0];
  renderFileList([file], '#filelist', () => { file = null; $('#editor').classList.add('d-none'); });
  $('#editor').classList.remove('d-none');
  tkClearAlert();
  loadPdf();
});

async function loadPdf() {
  $('#prog').textContent = 'Memuat PDF…';
  pdfDoc = await TK.loadPdf(file);
  items = [];
  $('#pg-total').textContent = '/ ' + pdfDoc.numPages + ' halaman';
  $('#pg-num').max = pdfDoc.numPages;
  await renderPage();
  $('#prog').textContent = '';
}

async function renderPage() {
  const { canvas: c, viewport } = await TK.renderPage(pdfDoc, pageNo, scale);
  canvas.width = c.width; canvas.height = c.height;
  canvas.getContext('2d').drawImage(c, 0, 0);
  overlay.width = c.width; overlay.height = c.height;
  overlay.style.width = canvas.style.width || (c.width + 'px');
  overlay.style.height = (c.height + 'px');
  redraw();
}

function redraw() {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  for (const it of items) {
    if (it.page !== pageNo) continue;
    octx.save();
    if (it.type === 'text') {
      octx.fillStyle = it.color;
      octx.font = `${it.size}px ${it.font === 'HelveticaBold' ? 'bold ' : ''}sans-serif`;
      octx.fillText(it.text, it.x, it.y);
    } else if (it.type === 'image') {
      if (it.img) octx.drawImage(it.img, it.x, it.y, it.w, it.h);
      else { octx.strokeStyle = '#22d3ee'; octx.strokeRect(it.x, it.y, it.w, it.h); }
    } else if (it.type === 'rect') {
      octx.strokeStyle = it.color; octx.lineWidth = it.width;
      octx.strokeRect(it.x, it.y, it.w, it.h);
    } else if (it.type === 'line') {
      octx.strokeStyle = it.color; octx.lineWidth = it.width;
      octx.beginPath(); octx.moveTo(it.x1, it.y1); octx.lineTo(it.x2, it.y2); octx.stroke();
    } else if (it.type === 'check') {
      octx.strokeStyle = it.color; octx.lineWidth = Math.max(2, it.width * 1.6);
      octx.beginPath();
      octx.moveTo(it.x, it.y); octx.lineTo(it.x + it.w * 0.35, it.y + it.h * 0.75);
      octx.lineTo(it.x + it.w, it.y); octx.stroke();
    } else if (it.type === 'scribble') {
      octx.strokeStyle = it.color; octx.lineWidth = it.width;
      octx.beginPath();
      it.pts.forEach((p, i) => i ? octx.lineTo(p[0], p[1]) : octx.moveTo(p[0], p[1]));
      octx.stroke();
    }
    if (it === selected) {
      octx.setLineDash([4, 3]); octx.strokeStyle = '#22d3ee'; octx.lineWidth = 1;
      const b = bounds(it);
      octx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
      octx.setLineDash([]);
    }
    octx.restore();
  }
}
function bounds(it) {
  if (it.type === 'line') return { x: Math.min(it.x1, it.x2), y: Math.min(it.y1, it.y2), w: Math.abs(it.x2 - it.x1), h: Math.abs(it.y2 - it.y1) };
  if (it.type === 'scribble') {
    const xs = it.pts.map(p => p[0]), ys = it.pts.map(p => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  return { x: it.x, y: it.y, w: it.w || 40, h: it.h || 20 };
}

let selected = null, drawing = null;
function canvasPos(e) {
  const r = overlay.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (overlay.width / r.width),
    y: (e.clientY - r.top) * (overlay.height / r.height),
  };
}
function okPt(x, y) { return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y); }
function okPts(arr) { return Array.isArray(arr) && arr.length >= 2 && arr.every(p => p && okPt(p[0], p[1])); }

overlay.addEventListener('pointerdown', e => {
  const p = canvasPos(e);
  if (!okPt(p.x, p.y)) { console.warn('Ignoring pointer on unrendered page (overlay not ready)'); return; }
  if (currentTool === 'select') {
    // pilih elemen yang diklik
    const hit = items.filter(i => i.page === pageNo).reverse().find(i => {
      const b = bounds(i);
      return p.x >= b.x - 8 && p.x <= b.x + b.w + 8 && p.y >= b.y - 8 && p.y <= b.y + b.h + 8;
    });
    selected = hit || null;
    redraw();
    return;
  }
  const color = $('#s-color').value, width = +$('#s-width').value || 2;
  if (currentTool === 'text') {
    const it = { type: 'text', page: pageNo, x: p.x, y: p.y, text: $('#t-text').value || 'Teks', font: $('#t-font').value, size: (+$('#t-size').value || 14) * scale, color: $('#t-color').value };
    items.push(it); selected = it;
  } else if (currentTool === 'image') {
    if (!imgData) return tkAlert('warning', 'Pilih gambar dulu di panel kanan.');
    const it = { type: 'image', page: pageNo, x: p.x, y: p.y, w: 120 * scale / 1.6, h: 90 * scale / 1.6, img: imgData };
    items.push(it); selected = it;
  } else if (currentTool === 'rect') {
    const it = { type: 'rect', page: pageNo, x: p.x, y: p.y, w: 120 * scale / 1.6, h: 60 * scale / 1.6, color, width };
    items.push(it); selected = it;
  } else if (currentTool === 'line') {
    const it = { type: 'line', page: pageNo, x1: p.x, y1: p.y, x2: p.x + 100, y2: p.y, color, width };
    items.push(it); selected = it;
  } else if (currentTool === 'check') {
    const it = { type: 'check', page: pageNo, x: p.x, y: p.y, w: 28 * scale / 1.6, h: 28 * scale / 1.6, color, width };
    items.push(it); selected = it;
  } else if (currentTool === 'scribble') {
    const it = { type: 'scribble', page: pageNo, pts: [[p.x, p.y]], color, width };
    items.push(it); selected = it; drawing = it;
  }
  redraw();
  updateList();
});
overlay.addEventListener('pointermove', e => {
  if (!drawing) return;
  const p = canvasPos(e);
  drawing.pts.push([p.x, p.y]);
  redraw();
});
['pointerup', 'pointerleave'].forEach(ev => overlay.addEventListener(ev, () => { drawing = null; }));

document.addEventListener('keydown', e => {
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
    items = items.filter(i => i !== selected);
    selected = null; redraw(); updateList();
  }
});

$('#i-file').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  imgData = await loadImage(f);
  $('#i-preview').textContent = `${f.name} siap — klik di halaman untuk menaruh.`;
};
$('#tools-tabs').querySelectorAll('button').forEach(b => b.onclick = () => {
  currentTool = b.dataset.tool;
  $('#tools-tabs').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
  $('#panel-text').classList.toggle('d-none', currentTool !== 'text');
  $('#panel-image').classList.toggle('d-none', currentTool !== 'image');
  $('#panel-shape').classList.toggle('d-none', !['rect', 'line', 'check', 'scribble'].includes(currentTool));
});
$('#pg-num').onchange = () => { pageNo = Math.min(Math.max(1, +$('#pg-num').value || 1), pdfDoc.numPages); $('#pg-num').value = pageNo; renderPage(); };
$('#pg-prev').onclick = () => { if (pageNo > 1) { pageNo--; $('#pg-num').value = pageNo; renderPage(); } };
$('#pg-next').onclick = () => { if (pageNo < pdfDoc.numPages) { pageNo++; $('#pg-num').value = pageNo; renderPage(); } };
$('#undo').onclick = () => { items.pop(); selected = null; redraw(); updateList(); };
$('#clear-all').onclick = () => { items = []; selected = null; redraw(); updateList(); };
function updateList() {
  $('#panel-list').innerHTML = items.filter(i => i.page === pageNo).map((it, i) =>
    `<div class="small border-bottom border-secondary py-1">${it.type} ${it.text ? '· ' + esc(it.text) : ''}</div>`).join('') || '<div class="small">Belum ada elemen di halaman ini.</div>';
}

$('#run').onclick = async () => {
  try {
    $('#run').disabled = true;
    $('#prog').textContent = 'Menyimpan PDF…';
    const doc = await PDFLib.PDFDocument.load(await readAB(file), { ignoreEncryption: true });
    const pageSizes = [];
    for (let i = 0; i < doc.getPageCount(); i++) {
      const s = doc.getPages()[i].getSize();
      pageSizes.push([typeof s.width === 'number' ? s.width : s[0] || 0, typeof s.height === 'number' ? s.height : s[1] || 0]);
    }
    const fonts = {
      Helvetica: await doc.embedFont(PDFLib.StandardFonts.Helvetica),
      HelveticaBold: await doc.embedFont(PDFLib.StandardFonts.HelveticaBold),
      TimesRoman: await doc.embedFont(PDFLib.StandardFonts.TimesRoman),
      Courier: await doc.embedFont(PDFLib.StandardFonts.Courier),
    };
    let skipped = 0;
    for (const it of items) {
      const page = doc.getPages()[it.page - 1];
      const ps = pageSizes[it.page - 1];
      if (!ps) { skipped++; console.warn('Skipping element on missing page:', it); continue; }
      const sx = ps[0] / overlay.width, sy = ps[1] / overlay.height;
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) { skipped++; console.warn('Invalid scale on page', it.page, { sx, sy }); continue; }
      const conv = (x, y) => {
        if (!okPt(x, y)) return [NaN, NaN];
        return [x * sx, ps[1] - y * sy];
      };
      if (it.type === 'text') {
        const [x, y] = conv(it.x, it.y);
        const size = it.size * sy;
        if (!okPt(x, y) || !Number.isFinite(size)) { skipped++; console.warn('Skipping text (page', it.page, '):', it); continue; }
        const rgb = hexToRgb(it.color);
        page.drawText(it.text, { x, y, size, font: fonts[it.font] || fonts.Helvetica, color: rgb });
      } else if (it.type === 'image' && it.img) {
        const [x, y] = conv(it.x, it.y + it.h);
        if (!okPt(x, y)) { skipped++; console.warn('Skipping image (page', it.page, '):', it); continue; }
        const c = document.createElement('canvas');
        c.width = it.img.naturalWidth; c.height = it.img.naturalHeight;
        c.getContext('2d').drawImage(it.img, 0, 0);
        const blob = await canvasToBlob(c, 'image/png');
        const png = await doc.embedPng(await blob.arrayBuffer());
        page.drawImage(png, { x, y, width: it.w * sx, height: it.h * sy });
      } else if (it.type === 'rect') {
        const [x, y] = conv(it.x, it.y + it.h);
        if (!okPt(x, y) || !Number.isFinite(it.w * sx) || !Number.isFinite(it.h * sy)) { skipped++; console.warn('Skipping rect (page', it.page, '):', it); continue; }
        page.drawRectangle({ x, y, width: it.w * sx, height: it.h * sy, borderColor: hexToRgb(it.color), borderWidth: it.width * sy });
      } else if (it.type === 'line') {
        const [x1, y1] = conv(it.x1, it.y1);
        const [x2, y2] = conv(it.x2, it.y2);
        if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
          skipped++; console.warn('Skipping line (page', it.page, '):', { x1, y1, x2, y2 });
          continue;
        }
        page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color: hexToRgb(it.color), thickness: it.width * sy });
      } else if (it.type === 'check') {
        const [x, y] = conv(it.x, it.y + it.h);
        const w = it.w * sx, h = it.h * sy;
        if (!okPt(x, y) || !Number.isFinite(w) || !Number.isFinite(h)) { skipped++; console.warn('Skipping check:', it); continue; }
        page.drawLine({ start: { x, y: y + h * 0.25 }, end: { x: x + w * 0.35, y }, color: hexToRgb(it.color), thickness: Math.max(1, it.width * sy) });
        page.drawLine({ start: { x: x + w * 0.35, y }, end: { x: x + w, y: y + h * 0.75 }, color: hexToRgb(it.color), thickness: Math.max(1, it.width * sy) });
      } else if (it.type === 'scribble') {
        if (!okPts(it.pts)) { skipped++; console.warn('Skipping scribble (page', it.page, '):', it); continue; }
        const rgb = hexToRgb(it.color);
        for (let i = 0; i + 1 < it.pts.length; i++) {
          const [x1, y1] = conv(it.pts[i][0], it.pts[i][1]);
          const [x2, y2] = conv(it.pts[i + 1][0], it.pts[i + 1][1]);
          if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) { skipped++; console.warn('Skipping scribble segment:', it); continue; }
          page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color: rgb, thickness: it.width * sy });
        }
      }
    }
    if (skipped > 0) {
      tkAlert('warning', 'Disimpan, tapi ' + skipped + ' elemen dilewati karena koordinat tidak valid (biasanya karena elemen digambar sebelum halaman selesai dilukis). Silakan redrawn elemen tersebut di halaman yang sama.');
    }
    const out = await doc.save();
    const base = file.name.replace(/\.pdf$/i, '');
    $('#prog').textContent = '';
    showDownload(new Blob([out], { type: 'application/pdf' }), base + '-diedit.pdf', items.length + ' elemen');
  } catch (e) {
    $('#prog').textContent = '';
    tkAlert('danger', 'Gagal menyimpan: ' + e.message);
  }
  $('#run').disabled = false;
};

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

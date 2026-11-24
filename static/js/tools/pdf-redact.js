
let file = null, pdfDoc = null, pageNo = 1, scale = 1.6;
let canvas = $('#pdf-canvas'), overlay = $('#overlay'), octx = overlay.getContext('2d');
let areas = [];   // {page, x, y, w, h} in canvas coords
let drawing = null;

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
  areas = [];
  $('#pg-total').textContent = '/ ' + pdfDoc.numPages + ' halaman';
  $('#pg-num').max = pdfDoc.numPages;
  await renderPage();
  $('#prog').textContent = '';
}
async function renderPage() {
  const { canvas: c } = await TK.renderPage(pdfDoc, pageNo, scale);
  canvas.width = c.width; canvas.height = c.height;
  canvas.getContext('2d').drawImage(c, 0, 0);
  overlay.width = c.width; overlay.height = c.height;
  redraw();
}
function redraw() {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  for (const a of areas) {
    if (a.page !== pageNo) continue;
    octx.fillStyle = 'rgba(220,38,38,.55)';
    octx.fillRect(a.x, a.y, a.w, a.h);
    octx.strokeStyle = '#ef4444'; octx.lineWidth = 2;
    octx.strokeRect(a.x, a.y, a.w, a.h);
  }
  if (drawing) {
    octx.fillStyle = 'rgba(220,38,38,.4)';
    octx.fillRect(drawing.x, drawing.y, drawing.w, drawing.h);
  }
}
function canvasPos(e) {
  const r = overlay.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (overlay.width / r.width), y: (e.clientY - r.top) * (overlay.height / r.height) };
}
overlay.addEventListener('pointerdown', e => {
  e.preventDefault();
  overlay.setPointerCapture(e.pointerId);
  const p = canvasPos(e);
  drawing = { page: pageNo, x: p.x, y: p.y, w: 0, h: 0 };
});
overlay.addEventListener('pointermove', e => {
  if (!drawing) return;
  const p = canvasPos(e);
  drawing.w = p.x - drawing.x; drawing.h = p.y - drawing.y;
  redraw();
});
['pointerup', 'pointerleave'].forEach(ev => overlay.addEventListener(ev, () => {
  if (drawing && Math.abs(drawing.w) > 3 && Math.abs(drawing.h) > 3) {
    areas.push({ page: drawing.page, x: Math.min(drawing.x, drawing.x + drawing.w), y: Math.min(drawing.y, drawing.y + drawing.h), w: Math.abs(drawing.w), h: Math.abs(drawing.h) });
  }
  drawing = null; redraw();
}));
$('#pg-num').onchange = () => { pageNo = Math.min(Math.max(1, +$('#pg-num').value || 1), pdfDoc.numPages); $('#pg-num').value = pageNo; renderPage(); };
$('#pg-prev').onclick = () => { if (pageNo > 1) { pageNo--; $('#pg-num').value = pageNo; renderPage(); } };
$('#pg-next').onclick = () => { if (pageNo < pdfDoc.numPages) { pageNo++; $('#pg-num').value = pageNo; renderPage(); } };
$('#undo').onclick = () => { areas.pop(); redraw(); };
$('#clear-all').onclick = () => { areas = []; redraw(); };

$('#run').onclick = async () => {
  if (!areas.length) return tkAlert('warning', 'Tandai dulu area yang mau dihitamkan.');
  try {
    $('#run').disabled = true;
    $('#prog').textContent = 'Merender ulang halaman & menghapus teks…';
    const blobs = [], sizes = [];
    for (let n = 1; n <= pdfDoc.numPages; n++) {
      $('#prog').textContent = `Memproses halaman ${n}/${pdfDoc.numPages}…`;
      const { canvas: c, width, height } = await TK.renderPage(pdfDoc, n, 2);
      const ctx = c.getContext('2d');
      // hitamkan area yang ditandai (skala halaman: 2.0x; koordinat tanda 1.6x => kalikan 1.25)
      const sx2 = 2 / 1.6;
      for (const a of areas.filter(x => x.page === n)) {
        ctx.fillStyle = '#000000';
        const nx = Math.max(0, a.x * sx2), ny = Math.max(0, a.y * sx2);
        const nw = Math.max(0, a.w * sx2), nh = Math.max(0, a.h * sx2);
        if (nw && nh) ctx.fillRect(nx, ny, nw, nh);
      }
      const blob = await canvasToBlob(c, 'image/jpeg', 0.92);
      blobs.push(blob);
      sizes.push([width, height]);
    }
    $('#prog').textContent = 'Menyusun PDF…';
    const bytes = await TK.blobsToPdf(blobs, sizes);
    const base = file.name.replace(/\.pdf$/i, '');
    $('#prog').textContent = '';
    showDownload(new Blob([bytes], { type: 'application/pdf' }), base + '-redaksi.pdf',
      pdfDoc.numPages + ' halaman, ' + areas.length + ' area dihitamkan');
  } catch (e) {
    $('#prog').textContent = '';
    tkAlert('danger', 'Redaksi gagal: ' + e.message);
  }
  $('#run').disabled = false;
};

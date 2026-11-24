
let file = null, sigFile = null, sigDataUrl = null;

// ---- canvas tanda tangan dengan dukungan tekanan ----
const pad = $('#sig-pad');
const pctx = pad.getContext('2d');
pctx.fillStyle = '#fff'; pctx.fillRect(0, 0, pad.width, pad.height);
pctx.strokeStyle = $('#sig-color').value; pctx.lineWidth = +$('#sig-width').value;
pctx.lineCap = 'round'; pctx.lineJoin = 'round';
let drawing = false, lastPt = null, hasInk = false;

function ptFrom(e) {
  const r = pad.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (pad.width / r.width), y: (e.clientY - r.top) * (pad.height / r.height) };
}
function strokeTo(a, b, pressure) {
  pctx.beginPath();
  pctx.moveTo(a.x, a.y);
  pctx.lineTo(b.x, b.y);
  pctx.lineWidth = Math.max(1, (+$('#sig-width').value) * (pressure ? pressure : 1));
  pctx.stroke();
}
pad.addEventListener('pointerdown', e => {
  drawing = true; hasInk = true;
  pad.setPointerCapture(e.pointerId);
  const p = ptFrom(e);
  lastPt = p; pctx.beginPath(); pctx.arc(p.x, p.y, 1, 0, Math.PI * 2); pctx.fill();
});
pad.addEventListener('pointermove', e => {
  if (!drawing) return;
  const p = ptFrom(e);
  const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.6;
  strokeTo(lastPt, p, pressure);
  lastPt = p;
});
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => pad.addEventListener(ev, () => { drawing = false; }));
$('#sig-color').oninput = () => pctx.strokeStyle = $('#sig-color').value;
$('#sig-clear').onclick = () => {
  pctx.fillStyle = '#fff'; pctx.fillRect(0, 0, pad.width, pad.height);
  pctx.strokeStyle = $('#sig-color').value;
  hasInk = false; sigDataUrl = null;
};

// ---- upload tanda tangan ----
setupDrop('#sig-drop', files => {
  sigFile = files[0];
  $('#sig-fileinfo').textContent = `${sigFile.name} · ${fmtBytes(sigFile.size)}`;
  tkClearAlert();
});

// ---- drop PDF ----
setupDrop('#drop', files => {
  file = files[0];
  renderFileList([file], '#filelist', () => { file = null; $('#opts').classList.add('d-none'); });
  $('#opts').classList.remove('d-none');
  tkClearAlert();
});

$('#run').onclick = async () => {
  if (!file) return tkAlert('warning', 'Pilih PDF dulu.');
  // tentukan sumber tanda tangan
  const useUpload = document.querySelector('#tab-upload').classList.contains('active');
  let dataUrl = null;
  if (useUpload) {
    if (!sigFile) return tkAlert('warning', 'Unggah gambar tanda tangan dulu (atau pakai tab Gambar).');
    dataUrl = await readDataURL(sigFile);
  } else {
    if (!hasInk) return tkAlert('warning', 'Bubuhkan tanda tangan dulu di kanvas.');
    dataUrl = pad.toDataURL('image/png');
  }
  try {
    $('#run').disabled = true;
    $('#prog').textContent = 'Menyisipkan tanda tangan…';
    const bytes = dataUrlToBytes(dataUrl);
    const doc = await PDFLib.PDFDocument.load(await readAB(file), { ignoreEncryption: true });
    const pages = doc.getPageCount();
    const pno = Math.min(Math.max(1, +$('#sig-page').value || 1), pages);
    const page = doc.getPages()[pno - 1];
    const { width, height } = page.getSize();
    const mm = 72 / 25.4;
    const wmm = Math.max(5, +$('#sig-w').value || 50);
    const w = wmm * mm;
    const h = w * (bytes.h / bytes.w);
    const x = Math.min(width - w, Math.max(0, (+$('#sig-x').value || 30) * mm));
    const y = Math.min(height - h, Math.max(0, (+$('#sig-y').value || 20) * mm));
    const png = await doc.embedPng(bytes.buf);
    page.drawImage(png, { x, y, width: w, height: h });
    const out = await doc.save();
    const base = file.name.replace(/\.pdf$/i, '');
    $('#prog').textContent = '';
    showDownload(new Blob([out], { type: 'application/pdf' }), base + '-bertanda.pdf', 'halaman ' + pno);
  } catch (e) {
    $('#prog').textContent = '';
    tkAlert('danger', 'Gagal menandatangani: ' + e.message);
  }
  $('#run').disabled = false;
};

function dataUrlToBytes(dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  // baca dimensi dari PNG header
  const dv = new DataView(buf.buffer);
  const w = dv.getUint32(16), h = dv.getUint32(20);
  return { buf, w, h };
}

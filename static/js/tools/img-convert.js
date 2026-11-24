const state = [];
const refresh = () => { renderFileList(state, '#filelist', refresh); $('#run').disabled = !state.length; };

function modeFiles() { $('#file-mode').classList.remove('d-none'); $('#url-mode').classList.add('d-none'); $('#url-errors').classList.add('d-none'); }
function modeUrls()  { $('#file-mode').classList.add('d-none');  $('#url-mode').classList.remove('d-none');  $('#url-input').focus(); }
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
let currentMode = 'files';
window.setMode = m => {
  currentMode = m;
  m === 'files' ? modeFiles() : modeUrls();
  $('#run').disabled = (m === 'files' ? !state.length : !$('#url-input').value.trim());
};
// URL-mode input langsung atur disabled (tanpa harus klik tab lagi)
$('#url-input').addEventListener('input', () => {
  if (currentMode === 'urls') $('#run').disabled = !$('#url-input').value.trim();
});

setupDrop('#drop', files => {
  const imgs = files.filter(f => f.type.startsWith('image/') || /\\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name));
  if (!imgs.length) return tkAlert('warning', 'Pilih file gambar.');
  state.push(...imgs); refresh(); tkClearAlert();
}, true);

$('#quality').oninput = () => $('#qlabel').textContent = $('#quality').value;

// ---- core conversion (works for files OR proxy-fetched blobs) ----
async function convertItem(blob, name, fmt, q) {
  const img = await loadImage(blob);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  if (fmt === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(img, 0, 0);
  const b = await canvasToBlob(c, 'image/' + fmt, q);
  const ext = fmt === 'jpeg' ? 'jpg' : fmt;
  const base = name.replace(/\\.[^.]+$/, '');
  return { name: base + '-' + fmt + '.' + ext, blob: b };
}

async function convertItems(items, fmt, q, onProgress) {
  const zip = new JSZip();
  let single = null;
  for (let i = 0; i < items.length; i++) {
    onProgress(i + 1, items.length);
    const res = await convertItem(items[i].blob, items[i].name, fmt, q);
    if (zip) zip.file(res.name, res.blob); else single = res;
  }
  return { single, zip, count: items.length };
}

async function showResult(result, fmt) {
  const { single, zip, count } = result;
  if (zip) {
    showDownload(await zip.generateAsync({ type: 'blob' }), 'gambar-konversi.zip', count + ' gambar');
  } else if (single) {
    const url = URL.createObjectURL(single.blob);
    showDownload(single.blob, single.name, fmt.toUpperCase());
    $('#result').insertAdjacentHTML('beforeend',
      `<div class="d-flex gap-3 justify-content-center flex-wrap mt-3"><img src="${url}" style="max-width:280px;max-height:280px;border-radius:.5rem;border:1px solid #24304a"><div class="text-secondary small">${esc(single.name)} · ${fmtBytes(single.blob.size)}</div></div>`);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

// ---- URL mode: proxy fetch ----
async function fetchUrlList(lines) {
  const items = [], errs = [];
  for (let i = 0; i < lines.length; i++) {
    const u = lines[i];
    try {
      const res = await fetch('/api/proxy?url=' + encodeURIComponent(u));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      let name = u.split('/').pop().split('?')[0] || 'gambar';
      name = decodeURIComponent(name).replace(/[^a-zA-Z0-9._-]/g, '_');
      if (!$('#url-ext').checked && /\.[a-z0-9]+$/i.test(name)) name = name.replace(/\.[a-z0-9]+$/i, '');
      items.push({ blob, name });
    } catch (e) { errs.push(u.slice(0, 50) + ' → ' + e.message); }
  }
  return { items, errs };
}

// ---- run ----
$('#run').onclick = async () => {
  // toggle enable: file mode butuh file, URL mode butuh isi URL
  $('#run').disabled = (currentMode === 'files' ? !state.length : !$('#url-input').value.trim());
  try {
    let items;
    if (currentMode === 'files') {
      if (!state.length) return tkAlert('warning', 'Pilih gambar dulu.');
      items = state;
    } else {
      const lines = $('#url-input').value.split('\n').map(s => s.trim()).filter(Boolean);
      if (!lines.length) return tkAlert('warning', 'Isi URL dulu.');
      const { items: it, errs } = await fetchUrlList(lines);
      if (errs.length) { $('#url-errors').classList.remove('d-none'); $('#url-errors').innerHTML = errs.join('<br>'); }
      if (!it.length) return;
      items = it;
    }
    const fmt = $('#fmt').value, q = (+$('#quality').value) / 100;
    $('#run').disabled = true; $('#prog').textContent = 'Memproses…';
    const result = await convertItems(items, fmt, q, (i, n) => { $('#prog').textContent = `Memproses ${i}/${n}…`; });
    $('#prog').textContent = '';
    showResult(result, fmt);
    tkClearAlert();
  } catch (e) { tkAlert('danger', 'Gagal konversi: ' + e.message); }
  $('#run').disabled = false;
};

// init: active mode matches URL-mode tab state
setMode(currentMode);
// enable run button based on current mode state (so button is clickable immediately)
$('#run').disabled = (currentMode === 'files' ? !state.length : !$('#url-input').value.trim());

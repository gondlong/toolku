// ToolKu common helpers — semua proses lokal di browser (server hanya untuk toolberbasis konversi)
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

// pdf.js memakai requestAnimationFrame untuk loop render; tab tersembunyi/background
// men-throttle rAF sehingga render bisa mandek. Fallback ke setTimeout saat hidden.
const _tkRaf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null;
window.requestAnimationFrame = cb => (document.hidden || !_tkRaf)
  ? setTimeout(() => cb(performance.now()), 16)
  : _tkRaf(cb);

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/static/vendor/pdf.worker.min.js';
}

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function tkAlert(type, msg) {
  $('#tk-alert').innerHTML = `<div class="alert alert-${type} py-2">${esc(msg)}</div>`;
}
function tkClearAlert() { $('#tk-alert').innerHTML = ''; }

// Tampilkan kartu hasil + tombol download; simpan blob di window.__tkLast utk verifikasi
function showDownload(blob, name, extraHtml) {
  window.__tkLast = { blob, name };
  $('#result').innerHTML = `
    <div class="tk-result-card d-flex flex-wrap align-items-center gap-3">
      <span class="fs-3">✅</span>
      <div class="flex-grow-1">
        <div class="fw-bold">${esc(name)}</div>
        <div class="small text-secondary">${fmtBytes(blob.size)}${extraHtml ? ' · ' + extraHtml : ''}</div>
      </div>
      <button id="tk-dl" class="btn btn-tk">⬇️ Download</button>
    </div>`;
  $('#tk-dl').onclick = () => downloadBlob(blob, name);
}

function readAB(file) { return file.arrayBuffer(); }
function readText(file) { return file.text(); }
function readDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// Dropzone standar: klik / drag-drop -> onFiles(File[])
function setupDrop(sel, onFiles, multiple) {
  const zone = $(sel);
  const input = document.createElement('input');
  input.type = 'file';
  if (multiple) input.multiple = true;
  input.style.display = 'none';
  zone.appendChild(input);
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { if (input.files.length) onFiles(Array.from(input.files)); input.value = ''; });
  ['dragover', 'dragenter'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('dragover'); }));
  zone.addEventListener('drop', e => {
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(multiple ? files : [files[0]]);
    zone.__tkLastFiles = files;
  });
}

// Daftar file dengan tombol naik/turun/hapus; state = array file
function renderFileList(state, listSel, onChange) {
  const ul = $(listSel);
  ul.innerHTML = '';
  state.forEach((f, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="fname">${esc(f.name)}</span><span class="text-secondary small">${fmtBytes(f.size)}</span>`;
    const mk = (txt, title, fn, disabled) => {
      const b = document.createElement('button');
      b.className = 'btn btn-sm btn-outline-secondary';
      b.textContent = txt; b.title = title; b.disabled = !!disabled;
      b.onclick = e => { e.stopPropagation(); fn(); };
      li.appendChild(b);
    };
    if (onChange) {
      mk('↑', 'Naik', () => { [state[i-1], state[i]] = [state[i], state[i-1]]; onChange(); }, i === 0);
      mk('↓', 'Turun', () => { [state[i+1], state[i]] = [state[i], state[i+1]]; onChange(); }, i === state.length - 1);
    }
    mk('✕', 'Hapus', () => { state.splice(i, 1); onChange(); });
    ul.appendChild(li);
  });
}

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) { const old = btn.textContent; btn.textContent = '✅ Tersalin'; setTimeout(() => btn.textContent = old, 1200); }
  }).catch(() => tkAlert('warning', 'Clipboard tidak tersedia — salin manual dari kolom teks.'));
}

function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { setTimeout(() => URL.revokeObjectURL(url), 10000); res(img); };
    img.onerror = () => { setTimeout(() => URL.revokeObjectURL(url), 10000); rej(new Error('Gagal memuat gambar: ' + (file && file.name))); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Konversi gagal')), type, quality));
}

// Server-side upload helper (untuk tool Office/DWG/compress/protect)
const TK_CSRF = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';

function uploadToServer(url, file, formData, onProgressText) {
  return new Promise(async (resolve, reject) => {
    try {
      const fd = formData || new FormData();
      fd.append('file', file, file.name);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'X-CSRF-Token': TK_CSRF },
        body: fd,
      });
      if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) { /* non-json */ }
        reject(new Error(msg));
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="?([^";]+)"?/);
      resolve({ blob, name: m ? m[1] : 'hasil.pdf' });
    } catch (e) { reject(e); }
  });
}

// Server download: simpan blob hasil server + tombol download
function showServerResult(res) {
  window.__tkLast = { blob: res.blob, name: res.name };
  $('#result').innerHTML = `
    <div class="tk-result-card d-flex flex-wrap align-items-center gap-3">
      <span class="fs-3">✅</span>
      <div class="flex-grow-1">
        <div class="fw-bold">${esc(res.name)}</div>
        <div class="small text-secondary">${fmtBytes(res.blob.size)} — file diproses di server lalu otomatis dihapus</div>
      </div>
      <button id="tk-dl" class="btn btn-tk">⬇️ Download</button>
    </div>`;
  $('#tk-dl').onclick = () => downloadBlob(res.blob, res.name);
}

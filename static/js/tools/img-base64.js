
setupDrop('#drop', async files => {
  try {
    const f = files[0];
    const dataUrl = await readDataURL(f);
    $('#enc-text').value = dataUrl;
    $('#enc-info').textContent = `${f.name} · ${fmtBytes(f.size)} → ${fmtBytes(dataUrl.length)} teks`;
    $('#enc-out').classList.remove('d-none');
    $('#enc-copy').onclick = () => copyText(dataUrl, $('#enc-copy'));
    $('#enc-dl').onclick = () => downloadBlob(new Blob([dataUrl], { type: 'text/plain' }), f.name + '.base64.txt');
    tkClearAlert();
  } catch (e) { tkAlert('danger', 'Gagal membaca gambar: ' + e.message); }
});
$('#dec-run').onclick = () => {
  let s = $('#dec-text').value.trim();
  if (!s) return tkAlert('warning', 'Tempel Base64 dulu.');
  let mime = 'image/png';
  const m = s.match(/^data:(image\/[a-z+.-]+);base64,(.*)$/is);
  if (m) { mime = m[1]; s = m[2]; }
  s = s.replace(/\s/g, '');
  try {
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    const url = URL.createObjectURL(blob);
    window.__tkLast = { blob, name: 'base64-gambar.' + ext };
    $('#dec-out').innerHTML = `
      <div class="tk-result-card">
        <img src="${url}" style="max-width:100%;max-height:300px;border-radius:.5rem" alt="gambar">
        <div class="mt-2"><button id="dec-dl" class="btn btn-tk btn-sm">⬇️ Download gambar</button>
        <span class="small text-secondary ms-2">${esc(mime)} · ${fmtBytes(blob.size)}</span></div>
      </div>`;
    setTimeout(() => {
      const img = $('#dec-out').querySelector('img');
      if (img) {
        img.addEventListener('error', () => {
          img.outerHTML = '<div class="text-warning small">Data bukan gambar yang valid.</div>';
        });
      }
    }, 0);
    $('#dec-dl').onclick = () => downloadBlob(blob, 'base64-gambar.' + ext);
    tkClearAlert();
  } catch (e) { tkAlert('danger', 'Base64 tidak valid: ' + e.message); }
};

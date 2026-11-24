
let file = null;
setupDrop('#drop', files => {
  file = files[0];
  $('#opts').classList.remove('d-none');
  $('#fileinfo').textContent = `${file.name} · ${fmtBytes(file.size)} — klik area di atas untuk ganti gambar`;
  tkClearAlert();
});
$('#quality').oninput = () => $('#qlabel').textContent = $('#quality').value;
$('#run').onclick = async () => {
  if (!file) return;
  try {
    const img = await loadImage(file);
    let w = img.naturalWidth, h = img.naturalHeight;
    const maxw = +$('#maxw').value || 0, maxh = +$('#maxh').value || 0;
    const s = Math.min(maxw ? maxw / w : 1, maxh ? maxh / h : 1, 1);
    w = Math.round(w * s); h = Math.round(h * s);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const fmt = $('#fmt').value;
    if (fmt === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await canvasToBlob(c, 'image/' + fmt, (+$('#quality').value) / 100);
    const ext = fmt === 'jpeg' ? 'jpg' : fmt;
    const base = file.name.replace(/\.[^.]+$/, '');
    const saved = file.size - blob.size;
    const pct = ((saved / file.size) * 100).toFixed(1);
    const url = URL.createObjectURL(blob);
    showDownload(blob, `${base}-kompres.${ext}`,
      `${fmtBytes(file.size)} → ${fmtBytes(blob.size)} (${saved > 0 ? 'hemat ' + pct + '%' : 'bertambah ' + Math.abs(pct) + '%'}) · ${w}×${h}px`);
    $('#result').insertAdjacentHTML('beforeend',
      `<div class="mt-3 text-center"><img src="${url}" style="max-width:100%;max-height:340px;border-radius:.5rem;border:1px solid #24304a"></div>`);
  } catch (e) { tkAlert('danger', 'Gagal kompres: ' + e.message); }
};

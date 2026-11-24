
$('#run').onclick = async () => {
  const text = $('#text').value;
  if (!text) return tkAlert('warning', 'Isi teks atau URL dulu.');
  try {
    const qr = qrcode(0, $('#ecc').value);
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const size = +$('#size').value;
    const margin = 4; // modul quiet zone
    const cell = size / (n + margin * 2);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = $('#bg').value;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = $('#fg').value;
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) {
      if (qr.isDark(r, col)) ctx.fillRect(Math.round((col + margin) * cell), Math.round((r + margin) * cell), Math.ceil(cell), Math.ceil(cell));
    }
    const blob = await canvasToBlob(c, 'image/png');
    const url = URL.createObjectURL(blob);
    window.__tkLast = { blob, name: 'qrcode.png' };
    $('#result').innerHTML = `
      <div class="tk-result-card text-center">
        <img src="${url}" style="max-width:280px;width:100%;border-radius:.5rem">
        <div class="mt-2"><button id="qr-dl" class="btn btn-tk btn-sm">⬇️ Download PNG (${size}×${size})</button></div>
      </div>`;
    $('#qr-dl').onclick = () => downloadBlob(blob, 'qrcode.png');
    tkClearAlert();
  } catch (e) { tkAlert('danger', 'Gagal membuat QR (teks terlalu panjang?): ' + e.message); }
};

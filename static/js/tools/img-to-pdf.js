
const state = [];
const refresh = () => { renderFileList(state, '#filelist', refresh); $('#run').disabled = !state.length; };
setupDrop('#drop', files => {
  const imgs = files.filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name));
  if (!imgs.length) return tkAlert('warning', 'Pilih file gambar.');
  state.push(...imgs); refresh(); tkClearAlert();
}, true);
const SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
$('#run').onclick = async () => {
  try {
    $('#run').disabled = true;
    const out = await PDFLib.PDFDocument.create();
    const margin = Math.max(0, +$('#margin').value || 0);
    const sizeMode = $('#size').value, orient = $('#orient').value;
    for (let i = 0; i < state.length; i++) {
      $('#prog').textContent = `Memproses gambar ${i + 1}/${state.length}…`;
      const f = state[i];
      let embedded;
      if (/jpe?g$/i.test(f.name) || f.type === 'image/jpeg') {
        embedded = await out.embedJpg(await readAB(f));
      } else {
        // format lain -> PNG via canvas (sekaligus flatten transparency ke putih)
        const img = await loadImage(f);
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        const blob = await canvasToBlob(c, 'image/png');
        embedded = await out.embedPng(await blob.arrayBuffer());
      }
      const iw = embedded.width, ih = embedded.height;
      let pw, ph;
      if (sizeMode === 'fit') { pw = iw + margin * 2; ph = ih + margin * 2; }
      else {
        let [a, b] = SIZES[sizeMode];
        const landscape = orient === 'landscape' || (orient === 'auto' && iw > ih);
        [pw, ph] = landscape ? [b, a] : [a, b];
      }
      const page = out.addPage([pw, ph]);
      const maxW = pw - margin * 2, maxH = ph - margin * 2;
      const s = Math.min(maxW / iw, maxH / ih, sizeMode === 'fit' ? 1 : Infinity);
      const w = iw * s, h = ih * s;
      page.drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
    $('#prog').textContent = '';
    const bytes = await out.save();
    showDownload(new Blob([bytes], { type: 'application/pdf' }), 'gambar.pdf', state.length + ' halaman');
  } catch (e) { tkAlert('danger', 'Gagal membuat PDF: ' + e.message); }
  $('#run').disabled = !state.length;
};

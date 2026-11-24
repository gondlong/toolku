
let file = null;
setupDrop('#drop', files => {
  file = files[0];
  renderFileList([file], '#filelist', () => { file = null; $('#opts').classList.add('d-none'); });
  $('#opts').classList.remove('d-none'); tkClearAlert();
});
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
$('#run').onclick = async () => {
  if (!file) return;
  const text = $('#wm-text').value.trim();
  if (!text) return tkAlert('warning', 'Isi teks watermark dulu.');
  try {
    $('#run').disabled = true;
    const doc = await PDFLib.PDFDocument.load(await readAB(file), { ignoreEncryption: true });
    const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const size = Math.min(200, Math.max(8, +$('#wm-size').value || 48));
    const opacity = Math.min(100, Math.max(1, +$('#wm-opacity').value || 15)) / 100;
    const color = hexToRgb($('#wm-color').value);
    const tile = $('#wm-mode').value === 'tile';
    const angle = Math.PI / 4;
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      const tw = font.widthOfTextAtSize(text, size);
      const opts = { font, size, color, opacity, rotate: PDFLib.degrees(45) };
      if (!tile) {
        page.drawText(text, { ...opts, x: width / 2 - (tw / 2) * Math.cos(angle), y: height / 2 - (tw / 2) * Math.sin(angle) });
      } else {
        const stepX = tw + size * 2, stepY = size * 5;
        for (let y = -height * 0.25; y < height * 1.25; y += stepY) {
          for (let x = -width * 0.25; x < width * 1.25; x += stepX) {
            page.drawText(text, { ...opts, x, y });
          }
        }
      }
    }
    const bytes = await doc.save();
    const base = file.name.replace(/\.pdf$/i, '');
    showDownload(new Blob([bytes], { type: 'application/pdf' }), base + '-watermark.pdf', doc.getPageCount() + ' halaman');
  } catch (e) { tkAlert('danger', 'Gagal memasang watermark: ' + e.message); }
  $('#run').disabled = false;
};

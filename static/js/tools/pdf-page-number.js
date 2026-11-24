
let file = null;
setupDrop('#drop', files => {
  file = files[0];
  renderFileList([file], '#filelist', () => { file = null; $('#opts').classList.add('d-none'); });
  $('#opts').classList.remove('d-none'); tkClearAlert();
});
$('#run').onclick = async () => {
  if (!file) return;
  try {
    $('#run').disabled = true;
    const doc = await PDFLib.PDFDocument.load(await readAB(file), { ignoreEncryption: true });
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const pos = $('#pn-pos').value, fmt = $('#pn-fmt').value;
    const start = +$('#pn-start').value || 1;
    const size = Math.min(48, Math.max(6, +$('#pn-size').value || 11));
    const total = doc.getPageCount();
    const m = 24;
    doc.getPages().forEach((page, i) => {
      const n = start + i;
      const label = fmt === 'nn' ? `${n} / ${total + start - 1}` : fmt === 'hal' ? `Halaman ${n}` : String(n);
      const { width, height } = page.getSize();
      const tw = font.widthOfTextAtSize(label, size);
      let x = pos.endsWith('c') ? (width - tw) / 2 : pos.endsWith('r') ? width - tw - m : m;
      let y = pos.startsWith('b') ? m : height - m - size;
      page.drawText(label, { x, y, size, font, color: PDFLib.rgb(0.1, 0.1, 0.1) });
    });
    const bytes = await doc.save();
    const base = file.name.replace(/\.pdf$/i, '');
    showDownload(new Blob([bytes], { type: 'application/pdf' }), base + '-bernomor.pdf', total + ' halaman');
  } catch (e) { tkAlert('danger', 'Gagal menambah nomor: ' + e.message); }
  $('#run').disabled = false;
};

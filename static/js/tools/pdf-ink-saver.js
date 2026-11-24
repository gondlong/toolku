
let file = null;
setupDrop('#drop', files => {
  file = files[0];
  renderFileList([file], '#filelist', () => { file = null; $('#opts').classList.add('d-none'); });
  $('#opts').classList.remove('d-none');
  tkClearAlert();
});
$('#threshold').oninput = () => $('#thr').textContent = $('#threshold').value;
$('#quality').oninput = () => $('#ql').textContent = $('#quality').value;

$('#run').onclick = async () => {
  if (!file) return;
  try {
    $('#run').disabled = true;
    const mode = $('#mode').value;
    const thr = +$('#threshold').value;
    const q = (+$('#quality').value) / 100;
    const pdf = await TK.loadPdf(file);
    const blobs = [], sizes = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      $('#prog').textContent = `Memproses halaman ${n}/${pdf.numPages}…`;
      const { canvas, width, height } = await TK.renderPage(pdf, n, 2);
      const ctx = canvas.getContext('2d');
      const img = ctx.getImageData(0, 0, width, height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i], g = d[i + 1], b = d[i + 2];
        if (mode === 'gray') {
          const v = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          d[i] = d[i + 1] = d[i + 2] = v;
        } else {
          const v = 0.299 * r + 0.587 * g + 0.114 * b;
          const out = v >= thr ? 255 : 0;
          d[i] = d[i + 1] = d[i + 2] = out;
        }
      }
      ctx.putImageData(img, 0, 0);
      const blob = await canvasToBlob(canvas, 'image/jpeg', q);
      blobs.push(blob);
      sizes.push([width, height]);
    }
    $('#prog').textContent = 'Menyusun PDF…';
    const bytes = await TK.blobsToPdf(blobs, sizes);
    const base = file.name.replace(/\.pdf$/i, '');
    $('#prog').textContent = '';
    showDownload(new Blob([bytes], { type: 'application/pdf' }), base + '-hematinta.pdf', pdf.numPages + ' halaman');
  } catch (e) {
    $('#prog').textContent = '';
    tkAlert('danger', 'Gagal memproses: ' + e.message);
  }
  $('#run').disabled = false;
};

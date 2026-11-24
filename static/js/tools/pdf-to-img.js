
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
    const pdf = await pdfjsLib.getDocument({ data: await readAB(file) }).promise;
    const scale = +$('#scale').value;
    const fmt = $('#fmt').value;
    const mime = 'image/' + fmt;
    const q = Math.min(100, Math.max(10, +$('#quality').value || 92)) / 100;
    const ext = fmt === 'jpeg' ? 'jpg' : 'png';
    const base = file.name.replace(/\.pdf$/i, '');
    const zip = pdf.numPages > 1 ? new JSZip() : null;
    let single = null;
    for (let i = 1; i <= pdf.numPages; i++) {
      $('#prog').textContent = `Merender halaman ${i}/${pdf.numPages}…`;
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      const ctx = canvas.getContext('2d');
      if (fmt === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await canvasToBlob(canvas, mime, q);
      const name = `${base}-halaman-${String(i).padStart(2, '0')}.${ext}`;
      if (zip) zip.file(name, blob); else single = { blob, name };
    }
    $('#prog').textContent = '';
    if (zip) {
      const blob = await zip.generateAsync({ type: 'blob' });
      showDownload(blob, base + '-gambar.zip', pdf.numPages + ' gambar');
    } else {
      showDownload(single.blob, single.name, `${Math.round(scale * 72)} dpi`);
    }
  } catch (e) { tkAlert('danger', 'Gagal konversi: ' + e.message); }
  $('#run').disabled = false;
};

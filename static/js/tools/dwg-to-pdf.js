
let file = null;
setupDrop('#drop', files => {
  const f = files[0];
  if (!/\.(dwg|dxf)$/i.test(f.name)) return tkAlert('warning', 'Format harus .dwg atau .dxf.');
  file = f;
  renderFileList([file], '#filelist', () => { file = null; $('#opts').classList.add('d-none'); });
  $('#opts').classList.remove('d-none');
  tkClearAlert();
});
$('#run').onclick = async () => {
  if (!file) return;
  try {
    $('#run').disabled = true;
    $('#prog').textContent = 'Mengonversi di server (bisa memakan waktu 10-30 detik)…';
    const fd = new FormData();
    fd.append('paper', $('#paper').value);
    fd.append('orientation', $('#orient').value);
    fd.append('scale', $('#scale').value);
    const res = await uploadToServer('/api/dwg-to-pdf', file, fd);
    $('#prog').textContent = '';
    showServerResult(res);
  } catch (e) {
    $('#prog').textContent = '';
    tkAlert('danger', 'Konversi gagal: ' + e.message);
  }
  $('#run').disabled = false;
};

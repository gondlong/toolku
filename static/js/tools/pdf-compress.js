let file = null;

setupDrop('#drop', files => {
  file = files[0];
  renderFileList([file], '#filelist', () => { file = null; $('#opts').classList.add('d-none'); });
  $('#opts').classList.remove('d-none');
  tkClearAlert();
});

$('#run').onclick = async () => {
  if (!file) return;
  try {
    $('#run').disabled = true;
    $('#prog').textContent = 'Mengompresi di server…';
    const before = file.size;
    const fd = new FormData();
    fd.append('dpi', document.getElementById('dpi').value);
    fd.append('quality', document.getElementById('quality').value);
    const res = await uploadToServer('/api/pdf-compress', file, fd);
    const after = res.blob.size;
    const pct = ((before - after) / before * 100).toFixed(1);
    $('#prog').textContent = '';
    showServerResult(res);
    $('#result').insertAdjacentHTML('beforeend',
      `<div class="small text-secondary mt-2">Sebelum: ${fmtBytes(before)} → sesudah: ${fmtBytes(after)} (${pct >= 0 ? 'hemat' : 'bertambah'} ${Math.abs(pct)}%) · dpi ${document.getElementById('dpi').value}, quality ${document.getElementById('quality').value}</div>`);
  } catch (e) {
    $('#prog').textContent = '';
    tkAlert('danger', 'Kompresi gagal: ' + e.message);
  } finally {
    $('#run').disabled = false;
  }
};

$('#quality').addEventListener('input', () => {
  document.getElementById('qlabel').textContent = $('#quality').value;
});

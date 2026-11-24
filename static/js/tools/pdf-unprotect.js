
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
    $('#prog').textContent = 'Membuka di server…';
    const fd = new FormData();
    fd.append('password', $('#u-pass').value);
    const res = await uploadToServer('/api/pdf-unprotect', file, fd);
    $('#prog').textContent = '';
    showServerResult(res);
  } catch (e) {
    $('#prog').textContent = '';
    tkAlert('danger', 'Gagal membuka: ' + e.message);
  }
  $('#run').disabled = false;
};

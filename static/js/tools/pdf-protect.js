
let file = null;
setupDrop('#drop', files => {
  file = files[0];
  renderFileList([file], '#filelist', () => { file = null; $('#opts').classList.add('d-none'); });
  $('#opts').classList.remove('d-none');
  tkClearAlert();
});
$('#run').onclick = async () => {
  if (!file) return;
  const pass = $('#p-pass').value;
  if (!pass || pass.length < 4) return tkAlert('warning', 'Password minimal 4 karakter.');
  try {
    $('#run').disabled = true;
    $('#prog').textContent = 'Melindungi di server…';
    const fd = new FormData();
    fd.append('password', pass);
    if ($('#p-owner').value) fd.append('owner_password', $('#p-owner').value);
    const perms = [];
    document.querySelectorAll('.perm:checked').forEach(c => perms.push(c.value));
    fd.append('permissions', perms.join(',') || 'print');
    const res = await uploadToServer('/api/pdf-protect', file, fd);
    $('#prog').textContent = '';
    showServerResult(res);
  } catch (e) {
    $('#prog').textContent = '';
    tkAlert('danger', 'Proteksi gagal: ' + e.message);
  }
  $('#run').disabled = false;
};

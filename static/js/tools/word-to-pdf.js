
let file = null;
setupDrop('#drop', files => {
  const f = files[0];
  if (!/\.(docx|doc|odt|rtf|txt)$/i.test(f.name)) return tkAlert('warning', 'Format harus .docx/.doc/.odt/.rtf/.txt (kamu pilih ' + f.name + ').');
  file = f;
  renderFileList([file], '#filelist', () => { file = null; $('#opts').classList.add('d-none'); });
  $('#opts').classList.remove('d-none');
  tkClearAlert();
});
$('#run').onclick = async () => {
  if (!file) return;
  try {
    $('#run').disabled = true;
    $('#prog').textContent = 'Mengonversi di server…';
    const res = await uploadToServer('/api/convert/word-to-pdf', file);
    $('#prog').textContent = '';
    showServerResult(res);
  } catch (e) {
    $('#prog').textContent = '';
    tkAlert('danger', 'Konversi gagal: ' + e.message);
  }
  $('#run').disabled = false;
};

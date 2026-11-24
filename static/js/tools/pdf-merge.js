
const state = [];
const refresh = () => { renderFileList(state, '#filelist', refresh); $('#run').disabled = state.length < 2; };
setupDrop('#drop', files => {
  const pdfs = files.filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
  if (!pdfs.length) return tkAlert('warning', 'Pilih file PDF.');
  state.push(...pdfs); refresh(); tkClearAlert();
}, true);
$('#run').onclick = async () => {
  try {
    $('#run').disabled = true;
    const out = await PDFLib.PDFDocument.create();
    for (const f of state) {
      const src = await PDFLib.PDFDocument.load(await readAB(f), { ignoreEncryption: true });
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(p => out.addPage(p));
    }
    const bytes = await out.save();
    showDownload(new Blob([bytes], { type: 'application/pdf' }), 'gabungan.pdf', out.getPageCount() + ' halaman');
  } catch (e) { tkAlert('danger', 'Gagal menggabung: ' + e.message); }
  $('#run').disabled = state.length < 2;
};

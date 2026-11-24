
let file = null, pageCount = 0;
setupDrop('#drop', async files => {
  file = files[0];
  try {
    const doc = await PDFLib.PDFDocument.load(await readAB(file), { ignoreEncryption: true });
    pageCount = doc.getPageCount();
    renderFileList([file], '#filelist', () => { file = null; $('#opts').classList.add('d-none'); });
    $('#opts').classList.remove('d-none');
    $('#info').textContent = `PDF ini punya ${pageCount} halaman.`;
    $('#range').value = '1-' + pageCount;
    tkClearAlert();
  } catch (e) { tkAlert('danger', 'Tidak bisa membaca PDF: ' + e.message); }
});
$('#mode').onchange = () => {
  const m = $('#mode').value;
  $('#range-wrap').classList.toggle('d-none', m !== 'range');
  $('#every-wrap').classList.toggle('d-none', m !== 'every');
};
function parseRange(str, max) {
  const set = new Set();
  for (const part of str.split(',')) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let [a, b] = [+m[1], +m[2]];
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) if (i >= 1 && i <= max) set.add(i - 1);
    } else if (/^\d+$/.test(p)) {
      const n = +p; if (n >= 1 && n <= max) set.add(n - 1);
    } else throw new Error('Format rentang tidak valid: "' + p + '"');
  }
  return Array.from(set).sort((a, b) => a - b);
}
async function extract(src, indices) {
  const out = await PDFLib.PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach(p => out.addPage(p));
  return out.save();
}
$('#run').onclick = async () => {
  if (!file) return;
  try {
    $('#run').disabled = true;
    const src = await PDFLib.PDFDocument.load(await readAB(file), { ignoreEncryption: true });
    const base = file.name.replace(/\.pdf$/i, '');
    const mode = $('#mode').value;
    if (mode === 'range') {
      const idx = parseRange($('#range').value, pageCount);
      if (!idx.length) throw new Error('Tidak ada halaman yang dipilih.');
      const bytes = await extract(src, idx);
      showDownload(new Blob([bytes], { type: 'application/pdf' }), base + '-halaman.pdf', idx.length + ' halaman');
    } else {
      const n = mode === 'each' ? 1 : Math.max(1, +$('#everyn').value || 1);
      const zip = new JSZip();
      let part = 0;
      for (let s = 0; s < pageCount; s += n) {
        part++;
        const idx = []; for (let i = s; i < Math.min(s + n, pageCount); i++) idx.push(i);
        $('#prog').textContent = `Memproses bagian ${part}…`;
        const bytes = await extract(src, idx);
        zip.file(`${base}-bagian-${String(part).padStart(2, '0')}.pdf`, bytes);
      }
      $('#prog').textContent = '';
      const blob = await zip.generateAsync({ type: 'blob' });
      showDownload(blob, base + '-pisah.zip', part + ' file PDF');
    }
  } catch (e) { tkAlert('danger', 'Gagal memisah: ' + e.message); }
  $('#run').disabled = false;
};

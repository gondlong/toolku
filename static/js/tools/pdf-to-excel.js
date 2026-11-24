
let file = null;
setupDrop('#drop', files => {
  file = files[0];
  renderFileList([file], '#filelist', () => { file = null; $('#opts').classList.add('d-none'); });
  $('#opts').classList.remove('d-none');
  tkClearAlert();
});

function buildRows(items, gapThreshold) {
  if (!items.length) return [];
  const sorted = items.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const lines = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(it.y - last.y) < Math.max(3, it.h * 0.6)) last.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  // tentukan batas kolom dari seluruh item
  const allX = [];
  lines.forEach(l => l.items.forEach(i => allX.push(i.x)));
  allX.sort((a, b) => a - b);
  const colStarts = [];
  for (const x of allX) {
    if (!colStarts.length || x - colStarts[colStarts.length - 1] > gapThreshold) colStarts.push(x);
  }
  return lines.map(l => {
    l.items.sort((a, b) => a.x - b.x);
    const row = new Array(colStarts.length).fill('');
    l.items.forEach(it => {
      let ci = 0;
      for (let k = 0; k < colStarts.length; k++) if (it.x >= colStarts[k] - 1) ci = k;
      row[ci] = (row[ci] ? row[ci] + ' ' : '') + it.text.replace(/\s+/g, ' ').trim();
    });
    return row.map(s => s.trim());
  }).filter(r => r.some(c => c !== ''));
}

function maybeNumber(s) {
  const t = s.trim();
  if (!t) return '';
  if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(t)) return parseFloat(t.replace(/\./g, '').replace(',', '.'));
  if (/^-?\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  if (/^-?\d{1,3}(,\d{3})*$/.test(t)) return parseInt(t.replace(/,/g, ''));
  return s;
}

$('#run').onclick = async () => {
  if (!file) return;
  try {
    $('#run').disabled = true;
    $('#prog').textContent = 'Mengekstrak teks…';
    const pdf = await TK.loadPdf(file);
    const first = Math.max(1, +$('#first').value || 1);
    const gap = +$('#gap').value || 12;
    const detect = $('#detect').value;

    const wb = XLSX.utils.book_new();
    let count = 0;
    for (let n = first; n <= pdf.numPages; n++) {
      $('#prog').textContent = `Memproses halaman ${n}/${pdf.numPages}…`;
      const page = await pdf.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items
        .filter(it => it.str && it.str.trim() !== '')
        .map(it => ({
          text: it.str,
          x: it.transform[4],
          y: vp.height - it.transform[5],
          h: it.height || 10,
        }));
      if (!items.length) continue;
      const rows = buildRows(items, detect === 'never' ? 1e9 : gap);
      const aoa = rows.map(r => r.map(maybeNumber));
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = (aoa[0] || []).map(() => ({ wch: 18 }));
      XLSX.utils.book_append_sheet(wb, ws, `Halaman ${n}`);
      count++;
    }
    if (!count) return tkAlert('warning', 'Tidak ada teks yang bisa diekstrak dari PDF ini (kemungkinan PDF hasil scan).');
    $('#prog').textContent = 'Menyimpan workbook…';
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const base = file.name.replace(/\.pdf$/i, '');
    $('#prog').textContent = '';
    showDownload(blob, base + '.xlsx', count + ' sheet, ' + fmtBytes(blob.size));
  } catch (e) {
    $('#prog').textContent = '';
    tkAlert('danger', 'Konversi gagal: ' + e.message);
  }
  $('#run').disabled = false;
};

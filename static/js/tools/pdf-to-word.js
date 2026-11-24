
let file = null;
setupDrop('#drop', files => {
  file = files[0];
  renderFileList([file], '#filelist', () => { file = null; $('#opts').classList.add('d-none'); });
  $('#opts').classList.remove('d-none');
  tkClearAlert();
});

// Gabung item teks yang sejajar (line clustering) menjadi baris logis
function buildLines(items) {
  if (!items.length) return [];
  const sorted = items.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const lines = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(it.y - last.y) < Math.max(3, it.h * 0.6)) {
      last.items.push(it);
    } else {
      lines.push({ y: it.y, items: [it] });
    }
  }
  return lines.map(l => {
    l.items.sort((a, b) => a.x - b.x);
    const text = l.items.map(i => i.text).join('').replace(/\s+/g, ' ').trim();
    const bold = l.items.some(i => /bold|black|heavy/i.test(i.font));
    return { text, bold, x: l.items[0].x, size: Math.max(l.items[0].h, 8) };
  }).filter(l => l.text);
}

$('#run').onclick = async () => {
  if (!file) return;
  try {
    $('#run').disabled = true;
    $('#prog').textContent = 'Mengekstrak teks…';
    const pdf = await TK.loadPdf(file);
    const pages = await TK.extractText(pdf);
    $('#prog').textContent = 'Menyusun dokumen Word…';
    const fs = +$('#fsize').value || 11;

    const children = [];
    for (const p of pages) {
      const lines = buildLines(p.items);
      if (!lines.length) { children.push(new docx.Paragraph({ children: [new docx.TextRun('')] })); continue; }
      for (const l of lines) {
        const run = new docx.TextRun({ text: l.text, bold: l.bold, size: Math.round(fs * 2), font: 'Calibri' });
        children.push(new docx.Paragraph({ children: [run], spacing: { after: 60 } }));
      }
      if (p !== pages[pages.length - 1]) {
        children.push(new docx.Paragraph({ children: [new docx.TextRun('')], pageBreakBefore: true }));
      }
    }

    const doc = new docx.Document({
      sections: [{ properties: {}, children }],
    });
    const blob = await docx.Packer.toBlob(doc);
    const base = file.name.replace(/\.pdf$/i, '');
    $('#prog').textContent = '';
    showDownload(blob, base + '.docx', pages.length + ' halaman, ' + fmtBytes(blob.size));
  } catch (e) {
    $('#prog').textContent = '';
    tkAlert('danger', 'Konversi gagal: ' + e.message);
  }
  $('#run').disabled = false;
};

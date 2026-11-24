
let file = null;
setupDrop('#drop', files => {
  file = files[0];
  renderFileList([file], '#filelist', () => { file = null; $('#opts').classList.add('d-none'); });
  $('#opts').classList.remove('d-none');
  tkClearAlert();
});

// --- writer DXF minimal (R12 ASCII) ---
function dxfEscape(s) {
  return String(s).replace(/[\r\n]/g, ' ').replace(/([\\"])/g, '');
}
function buildDxf(entities) {
  const out = [];
  const p = (code, val) => { out.push(String(code), String(val)); };
  p(0, 'SECTION'); p(2, 'HEADER');
  p(9, '$ACADVER'); p(1, 'AC1009');
  p(9, '$INSUNITS'); p(70, 0);
  p(0, 'ENDSEC');
  p(0, 'SECTION'); p(2, 'TABLES');
  p(0, 'TABLE'); p(2, 'LAYER'); p(70, 1);
  p(0, 'LAYER'); p(2, '0'); p(70, 0); p(62, 7); p(6, 'CONTINUOUS');
  p(0, 'ENDTAB'); p(0, 'ENDSEC');
  p(0, 'SECTION'); p(2, 'ENTITIES');
  for (const e of entities) {
    if (e.type === 'line') {
      p(0, 'LINE'); p(8, '0');
      p(10, e.x1.toFixed(4)); p(20, e.y1.toFixed(4)); p(30, '0.0');
      p(11, e.x2.toFixed(4)); p(21, e.y2.toFixed(4)); p(31, '0.0');
    } else if (e.type === 'circle') {
      p(0, 'CIRCLE'); p(8, '0');
      p(10, e.cx.toFixed(4)); p(20, e.cy.toFixed(4)); p(30, '0.0');
      p(40, e.r.toFixed(4));
    } else if (e.type === 'text') {
      p(0, 'TEXT'); p(8, '0');
      p(10, e.x.toFixed(4)); p(20, e.y.toFixed(4)); p(30, '0.0');
      p(40, e.h.toFixed(4));
      p(1, dxfEscape(e.text));
    }
  }
  p(0, 'ENDSEC');
  p(0, 'EOF');
  return out.join('\r\n');
}

// Ambil vector ops dari pdf.js
async function getOperatorList(pdf, pageNum) {
  const page = await pdf.getPage(pageNum);
  const ops = await page.getOperatorList();
  const OPS = pdfjsLib.OPS;
  const paths = [];
  const texts = [];
  let cur = null;
  let path = null;
  let tm = null;
  let fontSize = 10;
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) { cur = { x: 0, y: 0 }; }
    else if (fn === OPS.restore) { cur = null; }
    else if (fn === OPS.transform) { tm = args; }
    else if (fn === OPS.setFont) { fontSize = args[1] || 10; }
    else if (fn === OPS.moveTo) {
      path = { type: 'path', subpaths: [], start: args.slice(0, 2) };
      path.subpaths.push([args.slice(0, 2)]);
    }
    else if (fn === OPS.lineTo) {
      if (!path) { path = { type: 'path', subpaths: [] }; path.subpaths.push([args.slice(0, 2)]); }
      path.subpaths[path.subpaths.length - 1].push(args.slice(0, 2));
    }
    else if (fn === OPS.curveTo) { if (path) path.subpaths[path.subpaths.length - 1].push(args.slice(0, 2)); }
    else if (fn === OPS.closePath) { if (path) path.subpaths[path.subpaths.length - 1].closed = true; }
    else if (fn === OPS.stroke || fn === OPS.fill || fn === OPS.eoFill) {
      if (path && path.subpaths.length) { paths.push(path); }
      path = null;
    }
    else if (fn === OPS.showText) {
      if (args && args.length) {
        const glyphs = args[0];
        const t = (glyphs.str || '').trim();
        if (t) texts.push({ x: (tm ? tm[4] : 0), y: (tm ? tm[5] : 0), text: t, h: fontSize });
      }
    }
  }
  return { paths, texts };
}

$('#run').onclick = async () => {
  if (!file) return;
  try {
    $('#run').disabled = true;
    const pdf = await TK.loadPdf(file);
    const entities = [];
    let lines = 0, texts = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      $('#prog').textContent = `Mengekstrak vektor halaman ${n}/${pdf.numPages}…`;
      const { paths, texts: pageTexts } = await getOperatorList(pdf, n);
      for (const p of paths) {
        for (const sp of p.subpaths) {
          for (let i = 0; i + 1 < sp.length; i++) {
            entities.push({ type: 'line', x1: sp[i][0], y1: sp[i][1], x2: sp[i + 1][0], y2: sp[i + 1][1] });
            lines++;
          }
        }
      }
      for (const t of pageTexts) {
        entities.push({ type: 'text', x: t.x, y: t.y, text: t.text, h: Math.max(1, t.h * 0.5) });
        texts++;
      }
    }
    if (!entities.length) return tkAlert('warning', 'Tidak ada vektor atau teks yang bisa diekstrak (PDF mungkin hasil scan/foto).');
    const dxf = buildDxf(entities);
    const blob = new Blob([dxf], { type: 'application/dxf' });
    const base = file.name.replace(/\.pdf$/i, '');
    $('#prog').textContent = '';
    showDownload(blob, base + '.dxf', lines + ' garis, ' + texts + ' teks');
  } catch (e) {
    $('#prog').textContent = '';
    tkAlert('danger', 'Ekstraksi gagal: ' + e.message);
  }
  $('#run').disabled = false;
};

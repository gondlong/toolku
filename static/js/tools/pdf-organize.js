
let file = null, srcDoc = null;
let pages = []; // {srcIndex, rot, origRot, thumb}
let dragItem = null;

setupDrop('#drop', async files => {
  try {
    file = files[0];
    const ab = await readAB(file);
    srcDoc = await PDFLib.PDFDocument.load(ab.slice(0), { ignoreEncryption: true });
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
    pages = [];
    $('#thumbs').innerHTML = '';
    $('#editor').classList.remove('d-none');
    renderFileList([file], '#filelist', () => { file = null; $('#editor').classList.add('d-none'); });
    for (let i = 0; i < pdf.numPages; i++) {
      $('#prog').textContent = `Membuat thumbnail ${i + 1}/${pdf.numPages}…`;
      const origRot = srcDoc.getPage(i).getRotation().angle;
      const item = { srcIndex: i, rot: 0, origRot };
      pages.push(item);
      const page = await pdf.getPage(i + 1);
      const vp = page.getViewport({ scale: 0.35 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      addThumb(item, canvas);
    }
    $('#prog').textContent = '';
    tkClearAlert();
  } catch (e) { tkAlert('danger', 'Gagal memuat PDF: ' + e.message); }
});

function addThumb(item, canvas) {
  const col = document.createElement('div');
  col.className = 'col-6 col-md-3 col-lg-2';
  col.draggable = true;
  const box = document.createElement('div');
  box.className = 'tk-thumb';
  const label = document.createElement('div');
  label.className = 'small text-secondary my-1';
  const update = () => { label.textContent = `Hal. ${item.srcIndex + 1} · ${item.rot}°`; canvas.style.transform = `rotate(${item.rot}deg)`; };
  const bar = document.createElement('div');
  bar.className = 'd-flex justify-content-center gap-1';
  const mk = (txt, title, fn) => { const b = document.createElement('button'); b.className = 'btn btn-sm btn-outline-secondary py-0'; b.textContent = txt; b.title = title; b.onclick = fn; bar.appendChild(b); };
  mk('⟲', 'Putar kiri', () => { item.rot = (item.rot + 270) % 360; update(); });
  mk('⟳', 'Putar kanan', () => { item.rot = (item.rot + 90) % 360; update(); });
  mk('⧉', 'Duplikat halaman', () => {
    const copy = { srcIndex: item.srcIndex, rot: item.rot, origRot: item.origRot };
    const idx = pages.indexOf(item);
    pages.splice(idx + 1, 0, copy);
    const clone = col.cloneNode(true);
    // rebuild clone handlers
    rebuildThumbs();
    const wrap = $('#thumbs');
    wrap.innerHTML = '';
    pages.forEach(p => wrap.appendChild(p._col));
  });
  mk('✕', 'Hapus halaman', () => {
    pages = pages.filter(p => p !== item);
    rebuildThumbs();
  });
  box.append(canvas, label, bar);
  col.appendChild(box);
  col.addEventListener('dragstart', () => { dragItem = item; col.classList.add('dragging'); });
  col.addEventListener('dragend', () => { col.classList.remove('dragging'); dragItem = null; });
  col.addEventListener('dragover', e => e.preventDefault());
  col.addEventListener('drop', e => {
    e.preventDefault();
    if (!dragItem || dragItem === item) return;
    const from = pages.indexOf(dragItem), to = pages.indexOf(item);
    pages.splice(from, 1); pages.splice(to, 0, dragItem);
    rebuildThumbs();
  });
  item._col = col;
  item._canvas = canvas;
  item._update = update;
  $('#thumbs').appendChild(col);
  update();
}

// bangun ulang semua thumbnail dari state `pages` (mendukung duplikat)
function rebuildThumbs() {
  const wrap = $('#thumbs');
  const saved = pages.map(p => ({ item: p, canvas: p._canvas }));
  wrap.innerHTML = '';
  // thumbnail canvas tidak bisa dipakai dua kali; buat ulang dari cache
  saved.forEach(({ item, canvas }) => {
    const col = document.createElement('div');
    col.className = 'col-6 col-md-3 col-lg-2';
    col.draggable = true;
    const box = document.createElement('div');
    box.className = 'tk-thumb';
    const label = document.createElement('div');
    label.className = 'small text-secondary my-1';
    const update = () => { label.textContent = `Hal. ${item.srcIndex + 1} · ${item.rot}°`; canvas.style.transform = `rotate(${item.rot}deg)`; };
    const bar = document.createElement('div');
    bar.className = 'd-flex justify-content-center gap-1';
    const mk = (txt, title, fn) => { const b = document.createElement('button'); b.className = 'btn btn-sm btn-outline-secondary py-0'; b.textContent = txt; b.title = title; b.onclick = fn; bar.appendChild(b); };
    mk('⟲', 'Putar kiri', () => { item.rot = (item.rot + 270) % 360; update(); });
    mk('⟳', 'Putar kanan', () => { item.rot = (item.rot + 90) % 360; update(); });
    mk('⧉', 'Duplikat halaman', () => {
      const copy = { srcIndex: item.srcIndex, rot: item.rot, origRot: item.origRot };
      const idx = pages.indexOf(item);
      pages.splice(idx + 1, 0, copy);
      rebuildThumbs();
    });
    mk('✕', 'Hapus halaman', () => { pages = pages.filter(p => p !== item); rebuildThumbs(); });
    box.append(canvas, label, bar);
    col.appendChild(box);
    col.addEventListener('dragstart', () => { dragItem = item; col.classList.add('dragging'); });
    col.addEventListener('dragend', () => { col.classList.remove('dragging'); dragItem = null; });
    col.addEventListener('dragover', e => e.preventDefault());
    col.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragItem || dragItem === item) return;
      const from = pages.indexOf(dragItem), to = pages.indexOf(item);
      pages.splice(from, 1); pages.splice(to, 0, dragItem);
      rebuildThumbs();
    });
    item._col = col; item._canvas = canvas; item._update = update;
    wrap.appendChild(col);
    update();
  });
}

$('#run').onclick = async () => {
  if (!pages.length) return tkAlert('warning', 'Tidak ada halaman tersisa.');
  try {
    $('#run').disabled = true;
    $('#prog').textContent = 'Menyusun PDF…';
    const out = await PDFLib.PDFDocument.create();
    const copied = await out.copyPages(srcDoc, pages.map(p => p.srcIndex));
    copied.forEach((p, i) => {
      p.setRotation(PDFLib.degrees((pages[i].origRot + pages[i].rot) % 360));
      out.addPage(p);
    });
    const bytes = await out.save();
    const base = file.name.replace(/\.pdf$/i, '');
    $('#prog').textContent = '';
    showDownload(new Blob([bytes], { type: 'application/pdf' }), base + '-diatur.pdf', out.getPageCount() + ' halaman');
  } catch (e) {
    $('#prog').textContent = '';
    tkAlert('danger', 'Gagal menyimpan: ' + e.message);
  }
  $('#run').disabled = false;
};

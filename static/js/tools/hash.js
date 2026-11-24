
let file = null;
setupDrop('#drop', files => { file = files[0]; $('#fileinfo').textContent = `${file.name} · ${fmtBytes(file.size)}`; tkClearAlert(); });
const toHex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
$('#run').onclick = async () => {
  const algos = $$('#algos input:checked').map(i => i.value);
  if (!algos.length) return tkAlert('warning', 'Pilih minimal satu algoritma.');
  let data, label;
  const fileTab = $('#tab-file').classList.contains('active');
  if (fileTab) {
    if (!file) return tkAlert('warning', 'Pilih file dulu.');
    data = await readAB(file); label = file.name;
  } else {
    const t = $('#text').value;
    if (!t) return tkAlert('warning', 'Isi teks dulu.');
    data = new TextEncoder().encode(t).buffer; label = 'teks (' + t.length + ' karakter)';
  }
  try {
    let html = `<div class="small text-secondary mb-2">Sumber: ${esc(label)}</div>`;
    for (const a of algos) {
      let hex;
      if (a === 'MD5') hex = md5(data);
      else hex = toHex(await crypto.subtle.digest(a, data));
      html += `
        <div class="tk-result-card mb-2">
          <div class="d-flex justify-content-between align-items-center">
            <span class="badge bg-secondary">${a}</span>
            <button class="btn btn-outline-info btn-sm py-0" data-h="${hex}">📋 Salin</button>
          </div>
          <code class="small d-block mt-1" style="word-break:break-all">${hex}</code>
        </div>`;
    }
    $('#result').innerHTML = html;
    $$('#result button[data-h]').forEach(b => b.onclick = () => copyText(b.dataset.h, b));
    tkClearAlert();
  } catch (e) { tkAlert('danger', 'Gagal menghitung hash: ' + e.message); }
};

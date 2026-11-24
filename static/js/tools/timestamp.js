
function tick() { const n = Date.now(); $('#now-s').textContent = Math.floor(n / 1000); $('#now-ms').textContent = n; }
tick(); setInterval(tick, 1000);
function row(k, v) { return `<div class="d-flex justify-content-between border-bottom border-secondary py-1 small"><span class="text-secondary">${k}</span><code>${esc(v)}</code></div>`; }
$('#ts-run').onclick = () => {
  const v = $('#ts').value.trim();
  if (!/^-?\d+$/.test(v)) return tkAlert('warning', 'Masukkan angka timestamp.');
  let n = +v;
  const isMs = Math.abs(n) >= 1e12;
  const d = new Date(isMs ? n : n * 1000);
  if (isNaN(d)) return tkAlert('danger', 'Timestamp di luar jangkauan.');
  $('#ts-out').innerHTML =
    row('Terbaca sebagai', isMs ? 'milidetik' : 'detik') +
    row('Lokal (' + Intl.DateTimeFormat().resolvedOptions().timeZone + ')', d.toLocaleString('id-ID')) +
    row('WIB (Asia/Jakarta)', d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB') +
    row('UTC', d.toUTCString()) +
    row('ISO 8601', d.toISOString());
  tkClearAlert();
};
$('#dt-run').onclick = () => {
  const v = $('#dt').value;
  if (!v) return tkAlert('warning', 'Pilih tanggal & jam dulu.');
  const d = new Date(v);
  const s = Math.floor(d.getTime() / 1000);
  $('#dt-out').innerHTML = row('Unix (detik)', s) + row('Unix (ms)', d.getTime()) + row('ISO 8601', d.toISOString());
  tkClearAlert();
};
$('#ts').value = Math.floor(Date.now() / 1000);
$('#ts-run').click();

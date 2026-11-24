
function update() {
  const t = $('#input').value;
  const words = (t.match(/\S+/g) || []).length;
  const sentences = (t.match(/[.!?]+(\s|$)/g) || []).length;
  const paragraphs = t.split(/\n\s*\n/).filter(p => p.trim()).length;
  const lines = t ? t.split('\n').length : 0;
  const readMin = words / 200, speakMin = words / 130;
  const fmtTime = m => m < 1 ? Math.ceil(m * 60) + ' detik' : Math.ceil(m) + ' menit';
  const items = [
    ['Kata', words], ['Karakter', t.length], ['Karakter (tanpa spasi)', t.replace(/\s/g, '').length],
    ['Kalimat', sentences], ['Paragraf', paragraphs], ['Baris', lines],
    ['Waktu baca', words ? '~' + fmtTime(readMin) : '0'], ['Waktu bicara', words ? '~' + fmtTime(speakMin) : '0']
  ];
  $('#stats').innerHTML = items.map(([k, v]) => `<div class="col-6 col-md-3"><div class="tk-stat"><div class="num">${v}</div><div class="small text-secondary">${k}</div></div></div>`).join('');
}
$('#input').addEventListener('input', update);
update();

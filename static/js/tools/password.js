
const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?/~'
};
$('#len').oninput = () => $('#lenlabel').textContent = $('#len').value;
function randInt(max) {
  const lim = Math.floor(0xFFFFFFFF / max) * max;
  let x;
  do { x = crypto.getRandomValues(new Uint32Array(1))[0]; } while (x >= lim);
  return x % max;
}
$('#run').onclick = () => {
  let sets = Object.keys(SETS).filter(k => $('#' + k).checked).map(k => SETS[k]);
  if (!sets.length) return tkAlert('warning', 'Pilih minimal satu jenis karakter.');
  if ($('#noambig').checked) sets = sets.map(s => s.replace(/[0O1lI]/g, ''));
  const pool = sets.join('');
  const len = +$('#len').value;
  let pw = '';
  for (let attempt = 0; attempt < 200; attempt++) {
    pw = Array.from({ length: len }, () => pool[randInt(pool.length)]).join('');
    if (sets.every(s => [...pw].some(c => s.includes(c)))) break;
  }
  $('#output').value = pw;
  const entropy = Math.round(len * Math.log2(pool.length));
  const pct = Math.min(100, entropy / 1.28);
  const [label, cls] = entropy < 40 ? ['Lemah', 'bg-danger'] : entropy < 70 ? ['Sedang', 'bg-warning'] : entropy < 100 ? ['Kuat', 'bg-info'] : ['Sangat kuat', 'bg-success'];
  $('#meter').className = 'progress-bar ' + cls;
  $('#meter').style.width = pct + '%';
  $('#strength').textContent = `Entropi ~${entropy} bit — ${label}. Dibuat dengan crypto.getRandomValues, tidak pernah dikirim ke mana pun.`;
  tkClearAlert();
};
$('#copy').onclick = () => copyText($('#output').value, $('#copy'));
$('#run').click();

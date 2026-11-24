
function uuidv4() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
$('#run').onclick = () => {
  const n = Math.min(1000, Math.max(1, +$('#count').value || 1));
  const lines = [];
  for (let i = 0; i < n; i++) {
    let u = uuidv4();
    if ($('#nohyphen').checked) u = u.replace(/-/g, '');
    if ($('#upper').checked) u = u.toUpperCase();
    lines.push(u);
  }
  $('#output').value = lines.join('\n');
};
$('#copy').onclick = () => copyText($('#output').value, $('#copy'));
$('#dl').onclick = () => { if ($('#output').value) downloadBlob(new Blob([$('#output').value], { type: 'text/plain' }), 'uuid.txt'); };
$('#run').click();

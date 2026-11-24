
let mode = 'enc';
function setMode(m) {
  mode = m;
  $('#mode-enc').className = 'btn btn-sm ' + (m === 'enc' ? 'btn-tk' : 'btn-outline-info');
  $('#mode-dec').className = 'btn btn-sm ' + (m === 'dec' ? 'btn-tk' : 'btn-outline-info');
  $('#run').textContent = m === 'enc' ? '🔐 Encode Base64' : '🔓 Decode Base64';
  $('#input').placeholder = m === 'enc' ? 'Teks biasa…' : 'Teks Base64…';
}
$('#mode-enc').onclick = () => setMode('enc');
$('#mode-dec').onclick = () => setMode('dec');
function b64encode(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return btoa(bin);
}
function b64decode(s) {
  const bin = atob(s.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}
$('#run').onclick = () => {
  try {
    const v = $('#input').value;
    $('#output').value = mode === 'enc' ? b64encode(v) : b64decode(v);
    tkClearAlert();
  } catch (e) { tkAlert('danger', (mode === 'enc' ? 'Encode' : 'Decode') + ' gagal — pastikan input Base64 valid.'); }
};
$('#swap').onclick = () => { const o = $('#output').value; $('#output').value = $('#input').value; $('#input').value = o; setMode(mode === 'enc' ? 'dec' : 'enc'); };
$('#copy').onclick = () => copyText($('#output').value, $('#copy'));
$('#dl').onclick = () => { if ($('#output').value) downloadBlob(new Blob([$('#output').value], { type: 'text/plain' }), 'base64.txt'); };

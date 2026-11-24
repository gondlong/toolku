
function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function claimDate(v) {
  const d = new Date(v * 1000);
  return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';
}
$('#run').onclick = () => {
  const t = $('#token').value.trim();
  const parts = t.split('.');
  if (parts.length !== 3) return tkAlert('danger', 'Token JWT harus punya 3 bagian (header.payload.signature).');
  try {
    const header = JSON.parse(b64urlDecode(parts[0]));
    const payload = JSON.parse(b64urlDecode(parts[1]));
    let dates = '';
    for (const k of ['exp', 'iat', 'nbf']) {
      if (typeof payload[k] === 'number') dates += `<div class="small"><span class="badge bg-secondary me-1">${k}</span>${claimDate(payload[k])}${k === 'exp' ? (payload[k] * 1000 < Date.now() ? ' <span class="text-danger">(sudah kedaluwarsa)</span>' : ' <span class="text-success">(masih berlaku)</span>') : ''}</div>`;
    }
    $('#result').innerHTML = `
      <div class="alert alert-warning py-2 small">⚠️ Signature TIDAK diverifikasi — ini hanya decode, bukan validasi keaslian token.</div>
      <label class="form-label small">Header</label>
      <pre class="tk-result-card small">${esc(JSON.stringify(header, null, 2))}</pre>
      <label class="form-label small mt-2">Payload</label>
      <pre class="tk-result-card small">${esc(JSON.stringify(payload, null, 2))}</pre>
      ${dates ? '<div class="mt-2">' + dates + '</div>' : ''}`;
    tkClearAlert();
  } catch (e) { tkAlert('danger', 'Gagal decode: ' + e.message); }
};


function parse() {
  const raw = $('#input').value;
  if (!raw.trim()) throw new Error('Input masih kosong.');
  return JSON.parse(raw);
}
function indentVal() { const v = $('#indent').value; return v === 'tab' ? '\t' : +v; }
function ok(msg) { $('#status').innerHTML = `<span class="text-success">✅ ${esc(msg)}</span>`; }
function err(e) {
  let msg = e.message;
  const m = msg.match(/position (\d+)/i);
  if (m) {
    const pos = +m[1];
    const upto = $('#input').value.slice(0, pos);
    const line = upto.split('\n').length;
    const col = pos - upto.lastIndexOf('\n');
    msg += ` (baris ${line}, kolom ${col})`;
  }
  $('#status').innerHTML = `<span class="text-danger">❌ ${esc(msg)}</span>`;
}
$('#format').onclick = () => { try { const o = parse(); $('#output').value = JSON.stringify(o, null, indentVal()); ok('JSON valid & rapi.'); } catch (e) { err(e); } };
$('#minify').onclick = () => { try { const o = parse(); $('#output').value = JSON.stringify(o); ok('JSON valid & minified.'); } catch (e) { err(e); } };
$('#validate').onclick = () => { try { parse(); ok('JSON valid.'); } catch (e) { err(e); } };
$('#copy').onclick = () => copyText($('#output').value, $('#copy'));
$('#dl').onclick = () => { if ($('#output').value) downloadBlob(new Blob([$('#output').value], { type: 'application/json' }), 'data.json'); };


function run() {
  const pattern = $('#pattern').value;
  const text = $('#text').value;
  $('#error').textContent = '';
  if (!pattern) { $('#highlight').textContent = text; $('#matches').innerHTML = ''; return; }
  const flags = $$('.fl:checked').map(i => i.value).join('');
  let re;
  try { re = new RegExp(pattern, flags); } catch (e) { $('#error').textContent = '❌ ' + e.message; return; }
  const ms = [];
  if (flags.includes('g')) {
    for (const m of text.matchAll(re)) { ms.push(m); if (ms.length > 5000) break; }
  } else {
    const m = re.exec(text); if (m) ms.push(m);
  }
  let html = '', last = 0;
  for (const m of ms) {
    html += esc(text.slice(last, m.index)) + '<mark class="tk-match">' + esc(m[0] || '\u200B') + '</mark>';
    last = m.index + (m[0].length || 0);
    if (m[0].length === 0) last++;
  }
  html += esc(text.slice(last));
  $('#highlight').innerHTML = html;
  let list = `<div class="small text-secondary mb-2">${ms.length} match ditemukan</div>`;
  ms.slice(0, 200).forEach((m, i) => {
    const groups = m.slice(1).map((g, j) => g !== undefined ? `<span class="badge bg-secondary me-1">$${j + 1}: ${esc(g)}</span>` : '').join('');
    list += `<div class="small mb-1"><span class="text-info">#${i + 1}</span> @${m.index}: <code>${esc(m[0])}</code> ${groups}</div>`;
  });
  if (ms.length > 200) list += '<div class="small text-secondary">…dan ' + (ms.length - 200) + ' match lainnya</div>';
  $('#matches').innerHTML = list;
}
$('#pattern').addEventListener('input', run);
$('#text').addEventListener('input', run);
$$('.fl').forEach(i => i.addEventListener('change', run));
run();

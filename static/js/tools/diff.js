
$('#run').onclick = () => {
  const parts = Diff.diffLines($('#old').value, $('#new').value);
  let add = 0, del = 0, html = '';
  for (const p of parts) {
    const lines = p.value.replace(/\n$/, '').split('\n');
    const cls = p.added ? 'tk-diff-add' : p.removed ? 'tk-diff-del' : '';
    const prefix = p.added ? '+ ' : p.removed ? '- ' : '  ';
    if (p.added) add += lines.length;
    if (p.removed) del += lines.length;
    html += `<pre class="${cls}">${lines.map(l => prefix + esc(l)).join('\n')}</pre>`;
  }
  $('#result').innerHTML = html;
  $('#result').classList.remove('d-none');
  $('#stats').innerHTML = `<span class="text-success">+${add} baris ditambah</span> · <span class="text-danger">-${del} baris dihapus</span>`;
};

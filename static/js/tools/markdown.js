
function render() {
  const html = DOMPurify.sanitize(marked.parse($('#input').value));
  $('#preview').innerHTML = html;
  return html;
}
$('#input').addEventListener('input', render);
$('#input').value = '# Contoh Markdown\n\nTulis **tebal**, *miring*, atau `kode`.\n\n- daftar satu\n- daftar dua\n\n| Kolom A | Kolom B |\n|---|---|\n| 1 | 2 |\n\n> Kutipan keren\n\n```js\nconsole.log("halo");\n```';
render();
$('#copy').onclick = () => copyText(render(), $('#copy'));
$('#dl').onclick = () => {
  const html = render();
  const doc = `<!DOCTYPE html>\n<html lang="id"><head><meta charset="utf-8"><title>Dokumen Markdown</title></head><body>\n${html}\n</body></html>`;
  downloadBlob(new Blob([doc], { type: 'text/html' }), 'markdown.html');
};


$('#enc').onclick = () => {
  const v = $('#input').value;
  $('#output').value = $('#mode').value === 'component' ? encodeURIComponent(v) : encodeURI(v);
  tkClearAlert();
};
$('#dec').onclick = () => {
  try {
    const v = $('#input').value;
    $('#output').value = $('#mode').value === 'component' ? decodeURIComponent(v) : decodeURI(v);
    tkClearAlert();
  } catch (e) { tkAlert('danger', 'Decode gagal — urutan percent-encoding tidak valid.'); }
};
$('#swap').onclick = () => { const o = $('#output').value; $('#output').value = $('#input').value; $('#input').value = o; };
$('#copy').onclick = () => copyText($('#output').value, $('#copy'));

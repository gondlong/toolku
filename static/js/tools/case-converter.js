
const words = s => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean);
const cap = w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
const CONV = {
  upper: s => s.toUpperCase(),
  lower: s => s.toLowerCase(),
  title: s => s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()),
  sentence: s => s.toLowerCase().replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase()),
  camel: s => words(s).map((w, i) => i ? cap(w) : w.toLowerCase()).join(''),
  pascal: s => words(s).map(cap).join(''),
  snake: s => words(s).map(w => w.toLowerCase()).join('_'),
  kebab: s => words(s).map(w => w.toLowerCase()).join('-'),
  constant: s => words(s).map(w => w.toUpperCase()).join('_'),
  alternating: s => [...s].map((c, i) => i % 2 ? c.toUpperCase() : c.toLowerCase()).join(''),
  inverse: s => [...s].map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('')
};
$$('#btns button').forEach(b => b.onclick = () => { $('#output').value = CONV[b.dataset.case]($('#input').value); });
$('#copy').onclick = () => copyText($('#output').value, $('#copy'));

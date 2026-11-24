
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = [...hex].map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
const toHex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
function apply(rgb) {
  const hex = toHex(rgb);
  const [h, s, l] = rgbToHsl(...rgb);
  $('#picker').value = hex;
  $('#hex').value = hex;
  $('#rgb').value = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  $('#hsl').value = `hsl(${h}, ${s}%, ${l}%)`;
  $('#swatch').style.background = hex;
}
$('#picker').oninput = () => apply(hexToRgb($('#picker').value));
$('#hex').addEventListener('change', () => { const rgb = hexToRgb($('#hex').value); if (rgb) apply(rgb); else tkAlert('warning', 'HEX tidak valid.'); });
$('#manual-run').onclick = () => {
  const v = $('#manual').value.trim();
  let m = v.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (m) { const rgb = m.slice(1).map(Number); if (rgb.every(x => x <= 255)) return apply(rgb); }
  m = v.match(/^hsl\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*\)$/i);
  if (m) return apply(hslToRgb(+m[1] % 360, Math.min(100, +m[2]), Math.min(100, +m[3])));
  const rgb = hexToRgb(v);
  if (rgb) return apply(rgb);
  tkAlert('warning', 'Format tidak dikenali. Gunakan #hex, rgb(r,g,b), atau hsl(h,s%,l%).');
};
['hex', 'rgb', 'hsl'].forEach(id => $('#' + id + '-copy').onclick = () => copyText($('#' + id).value, $('#' + id + '-copy')));
apply(hexToRgb('#38bdf8'));

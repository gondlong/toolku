
const CATS = {
  'Panjang': { m: 1, km: 1000, cm: 0.01, mm: 0.001, 'inci (in)': 0.0254, 'kaki (ft)': 0.3048, 'yard (yd)': 0.9144, 'mil (mi)': 1609.344 },
  'Berat': { kg: 1, g: 0.001, mg: 1e-6, ton: 1000, 'ons (oz)': 0.028349523125, 'pon (lb)': 0.45359237 },
  'Data': { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1048576, GiB: 1073741824 },
  'Waktu': { detik: 1, ms: 0.001, menit: 60, jam: 3600, hari: 86400, minggu: 604800 },
  'Kecepatan': { 'm/s': 1, 'km/jam': 1 / 3.6, 'mph': 0.44704, knot: 0.514444 },
  'Suhu': { 'Celsius (°C)': 'C', 'Fahrenheit (°F)': 'F', 'Kelvin (K)': 'K' }
};
function fillCats() { $('#cat').innerHTML = Object.keys(CATS).map(c => `<option>${c}</option>`).join(''); }
function fillUnits() {
  const units = Object.keys(CATS[$('#cat').value]);
  const opts = units.map(u => `<option>${u}</option>`).join('');
  $('#from').innerHTML = opts; $('#to').innerHTML = opts;
  $('#to').selectedIndex = Math.min(1, units.length - 1);
}
function toBase(cat, unit, v) {
  if (cat === 'Suhu') { const u = CATS[cat][unit]; return u === 'C' ? v : u === 'F' ? (v - 32) * 5 / 9 : v - 273.15; }
  return v * CATS[cat][unit];
}
function fromBase(cat, unit, v) {
  if (cat === 'Suhu') { const u = CATS[cat][unit]; return u === 'C' ? v : u === 'F' ? v * 9 / 5 + 32 : v + 273.15; }
  return v / CATS[cat][unit];
}
function calc() {
  const v = parseFloat($('#val').value);
  if (isNaN(v)) { $('#out').textContent = '—'; return; }
  const cat = $('#cat').value;
  const r = fromBase(cat, $('#to').value, toBase(cat, $('#from').value, v));
  $('#out').textContent = (Math.abs(r) >= 1e15 || (Math.abs(r) < 1e-9 && r !== 0)) ? r.toExponential(6) : parseFloat(r.toPrecision(10)).toLocaleString('id-ID', { maximumFractionDigits: 10 });
}
fillCats(); fillUnits(); calc();
$('#cat').onchange = () => { fillUnits(); calc(); };
['val', 'from', 'to'].forEach(id => $('#' + id).addEventListener('input', calc));

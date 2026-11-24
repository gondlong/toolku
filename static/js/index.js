const search = document.getElementById('search');
search.addEventListener('input', () => {
  const q = search.value.trim().toLowerCase();
  let any = false;
  document.querySelectorAll('.tk-cat').forEach(sec => {
    let vis = 0;
    sec.querySelectorAll('.tk-card-wrap').forEach(c => {
      const hit = !q || c.dataset.name.includes(q);
      c.classList.toggle('d-none', !hit);
      if (hit) vis++;
    });
    sec.classList.toggle('d-none', vis === 0);
    if (vis) any = true;
  });
  document.getElementById('noresult').classList.toggle('d-none', any);
});

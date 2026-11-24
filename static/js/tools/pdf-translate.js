/**
 * Terjemah PDF — upload PDF ke server, server menerjemahkan tiap blok teks
 * memakai LibreTranslate lokal dan mengembalikan hasil sebagai PDF / DOCX / TXT.
 */
let file = null;

setupDrop('#drop', files => {
  const f = files[0];
  if (!f) return;
  if (!/\.pdf$/i.test(f.name)) {
    tkAlert('warning', 'Hanya file PDF yang bisa diterjemahkan.');
    return;
  }
  file = f;
  renderFileList([file], '#filelist', () => { file = null; $('#opts').classList.add('d-none'); });
  $('#opts').classList.remove('d-none');
  $('#result').innerHTML = '';
  tkClearAlert();
});

// Daftar bahasa diambil dari container LibreTranslate yang sedang jalan,
// supaya dropdown hanya menampilkan bahasa yang benar-benar tersedia.
async function loadLanguages() {
  const src = $('#source-lang');
  const tgt = $('#target-lang');
  try {
    const res = await fetch('/api/languages');
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.languages) || !data.languages.length) return;
    const langs = data.languages;
    const fill = (sel, keepAuto) => {
      const cur = sel.value;
      sel.innerHTML = '';
      if (keepAuto) {
        const opt = document.createElement('option');
        opt.value = 'auto';
        opt.textContent = 'Deteksi otomatis (auto)';
        sel.appendChild(opt);
      }
      langs.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.code;
        opt.textContent = `${l.name} (${l.code})`;
        sel.appendChild(opt);
      });
      if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
    };
    fill(src, true);
    fill(tgt, false);
    const idOpt = [...tgt.options].find(o => o.value === 'id');
    if (idOpt) tgt.value = 'id';
  } catch (e) {
    console.warn('Gagal memuat daftar bahasa:', e);
  }
}

// Penjelasan singkat sesuai format output yang dipilih.
const FMT_HINTS = {
  pdf: 'Teks asli diganti di tempatnya, gambar & tata letak tetap terjaga. Cocok untuk dokumen yang perlu dicetak.',
  docx: 'Menghasilkan dokumen Word berisi paragraf hasil terjemahan — teksnya bisa diedit lagi.',
  txt: 'Teks murni hasil terjemahan, dikelompokkan per halaman. Ringan dan mudah disalin.',
};

$('#out-format').addEventListener('change', () => {
  $('#fmt-hint').textContent = FMT_HINTS[$('#out-format').value] || '';
});
$('#fmt-hint').textContent = FMT_HINTS.pdf;

$('#run').onclick = async () => {
  if (!file) return;
  const btn = $('#run');
  const prog = $('#prog');
  const spin = $('#spin');
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';
  try {
    btn.disabled = true;
    spin.classList.remove('d-none');
    prog.textContent = 'Mengirim permintaan ke server…';

    const fd = new FormData();
    fd.append('source', $('#source-lang').value);
    fd.append('target', $('#target-lang').value);
    fd.append('format', $('#out-format').value);
    fd.append('file', file, file.name);

    const res = await fetch('/api/pdf-translate', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
      body: fd,
    });
    if (!res.ok) {
      const j = await res.json();
      throw new Error(j.error || 'Gagal membuat tugas terjemahan');
    }
    const jobData = await res.json();
    const job_id = jobData.job_id;
    prog.textContent = '';
    spin.classList.remove('d-none');

    // Start polling every 2 seconds
    let pollTimer = setInterval(async () => {
      try {
        const statusRes = await fetch(`/api/pdf-translate/status/${job_id}`);
        if (!statusRes.ok) {
          clearInterval(pollTimer);
          throw new Error('Gagal mengambil status pekerjaan.');
        }
        const status = await statusRes.json();
        if (status.status === 'processing') {
          const cur = status.current_page || 0;
          const total = status.total_pages || 0;
          prog.textContent = `Menerjemahkan halaman ${cur} dari ${total}…`;
          const pct = total ? ((cur / total) * 100).toFixed(2) : 0;
          $('#spin .progress-bar').style.width = pct + '%';
          $('#spin .progress-bar').classList.add('progress-bar-animated');
        } else if (status.status === 'done') {
          clearInterval(pollTimer);
          spin.classList.add('d-none');
          prog.textContent = '';
          // Trigger download directly via an anchor tag to avoid
          // handling large payloads through XHR (Cloudflare 100‑second
          // proxy timeout) and let the browser stream the file.
          const a = document.createElement('a');
          a.href = `/api/pdf-translate/download/${job_id}`;
          a.download = ''; // server decides the filename via Content-Disposition
          a.rel = 'noopener';
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          a.remove();

          // Inform the user that the download has been initiated.
          $('#result').insertAdjacentHTML('beforeend',
            `<div class="small text-secondary mt-2">Mengunduh file otomatis. File akan otomatis dihapus setelah 15 menit.</div>`);
        } else if (status.status === 'error') {
          clearInterval(pollTimer);
          spin.classList.add('d-none');
          prog.textContent = '';
          tkAlert('danger', status.error || 'Terjemahan gagal.');
        } else {
          // unknown status
          prog.textContent = `Status tidak dikenal: ${status.status}`;
        }
      } catch (e) {
        clearInterval(pollTimer);
        spin.classList.add('d-none');
        prog.textContent = '';
        tkAlert('danger', e.message || 'Terjadi kesalahan saat memantau pekerjaan.');
      }
    }, 2000); // 2 seconds
  } catch (e) {
    prog.textContent = '';
    spin.classList.add('d-none');
    tkAlert('danger', e.message || 'Terjemahan gagal.');
  } finally {
    btn.disabled = false;
  }
};

loadLanguages();

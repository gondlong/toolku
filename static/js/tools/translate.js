/**
 * Terjemah Teks — frontend for LibreTranslate API
 * Uses LibreTranslate public API (libretranslate.com)
 */

document.addEventListener("DOMContentLoaded", function () {
  const btnTranslate = document.getElementById("btn-translate");
  const btnClear = document.getElementById("btn-clear");
  const btnCopy = document.getElementById("btn-copy");
  const inputText = document.getElementById("input-text");
  const sourceLang = document.getElementById("source-lang");
  const targetLang = document.getElementById("target-lang");
  const output = document.getElementById("output");

  const API_URL = "/api/translate";

  // Language list is fetched from the running LibreTranslate container so
  // the dropdown only offers languages that are actually loaded.
  async function loadLanguages() {
    try {
      const res = await fetch("/api/languages");
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.languages) || !data.languages.length) return;
      const langs = data.languages;
      const fill = (sel, keepAuto) => {
        const cur = sel.value;
        sel.innerHTML = "";
        if (keepAuto) {
          const opt = document.createElement("option");
          opt.value = "auto";
          opt.textContent = "Mengdeteksi otomatis (auto)";
          sel.appendChild(opt);
        }
        langs.forEach((l) => {
          const opt = document.createElement("option");
          opt.value = l.code;
          opt.textContent = `${l.name} (${l.code})`;
          sel.appendChild(opt);
        });
        if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
        else if (!keepAuto && sel.options.length) sel.selectedIndex = 0;
      };
      fill(sourceLang, true);
      fill(targetLang, false);
      const idOpt = [...targetLang.options].find((o) => o.value === "id");
      if (idOpt) targetLang.value = "id";
    } catch (e) {
      console.warn("Gagal memuat daftar bahasa:", e);
    }
  }

  function showAlert(msg, type = "info") {
    const alert = document.getElementById("tk-alert");
    alert.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">${msg}<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>`;
  }

  async function translateText() {
    const text = inputText.value.trim();
    if (!text) {
      showAlert("Masukkan teks untuk diterjemahkan!", "warning");
      return;
    }

    const source = sourceLang.value;
    const target = targetLang.value;
    btnTranslate.disabled = true;
    btnTranslate.textContent = "⏳ Memproses...";

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": TK_CSRF,
        },
        body: JSON.stringify({
          text: text,
          source: source,
          target: target,
        }),
      });

      const data = await response.json();

      if (data && data.ok && data.translatedText) {
        output.innerHTML = `<pre>${escapeHtml(data.translatedText)}</pre>`;
      } else {
        showAlert(data.error || "Terjadi kesalahan tidak diketahui.", "danger");
        output.innerHTML = `<p class="text-danger mb-0">${escapeHtml(data.error || "Terjadi kesalahan tidak diketahui.")}</p>`;
      }
    } catch (err) {
      console.error("Translation error:", err);
      showAlert("Gagal terhubung ke layanan terjemahan. Coba lagi nanti.", "danger");
      output.innerHTML = `<p class="text-danger mb-0">Gagal terhubung ke layanan terjemahan.</p>`;
    } finally {
      btnTranslate.disabled = false;
      btnTranslate.textContent = "🌐 Terjemahkan";
    }
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  btnTranslate.addEventListener("click", translateText);

  loadLanguages();

  btnClear.addEventListener("click", function () {
    inputText.value = "";
    output.innerHTML = `<p class="text-muted mb-0">Hasil akan muncul di sini setelah menerjemahkan...</p>`;
  });

  btnCopy.addEventListener("click", function () {
    const text = output.querySelector("pre")?.textContent || output.querySelector("p")?.textContent || "";
    if (!text || text.startsWith("Hasil akan muncul")) {
      showAlert("Tidak ada teks untuk disalin.", "info");
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      showAlert("Teks disalin ke clipboard!", "success");
    }).catch(() => {
      showAlert("Gagal menyalin teks.", "danger");
    });
  });
});


(function () {
  document.addEventListener("DOMContentLoaded", function () {
    const fileInput = document.getElementById("dataFileInput");
    const button = document.getElementById("dataUploadButton");
    const metaEl = document.getElementById("uploadMeta");
    const STORAGE_KEY = "shorttrack_hub_excel_meta_v1";

    if (!fileInput || !button || !metaEl) return;

    function renderMeta(meta) {
      if (!meta) {
        metaEl.innerHTML = "<span>Nog geen bestand geladen.</span>";
        return;
      }

      let html = "";
      html += `<span>Laatst geladen: <strong>${meta.fileName}</strong> (${meta.sheetCount} tabs)</span><br>`;
      html += `<span><small>${meta.loadedAt}</small></span>`;

      if (meta.sheets && meta.sheets.length) {
        const sheetSummary = meta.sheets
          .map(function (s) {
            if (typeof s.rows === "number") {
              return s.name + " (" + s.rows + " rijen)";
            }
            return s.name;
          })
          .join(" · ");
        html += `<div class="upload-sheets">Tabs: ${sheetSummary}</div>`;
      }

      metaEl.innerHTML = html;
    }

    // Probeer oude info uit localStorage te lezen
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const meta = JSON.parse(stored);
        renderMeta(meta);
      } else {
        renderMeta(null);
      }
    } catch (e) {
      console.warn("Kon opgeslagen Excel-meta niet lezen:", e);
      renderMeta(null);
    }

    button.addEventListener("click", function () {
      fileInput.click();
    });

    fileInput.addEventListener("change", function (event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      handleFile(file);
      // Reset zodat je hetzelfde bestand opnieuw kunt kiezen indien nodig
      fileInput.value = "";
    });

    async function handleFile(file) {
      if (typeof XLSX === "undefined") {
        metaEl.innerHTML =
          "<span>Kon de Excel-bibliotheek (XLSX) niet laden. Controleer je internetverbinding.</span>";
        return;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });

        const sheets = workbook.SheetNames.map(function (name) {
          const ws = workbook.Sheets[name];
          let rows = null;
          if (ws && ws["!ref"]) {
            const range = XLSX.utils.decode_range(ws["!ref"]);
            rows = range.e.r - range.s.r + 1;
          }
          return { name: name, rows: rows };
        });

        const meta = {
          fileName: file.name,
          sheetCount: sheets.length,
          sheets: sheets,
          loadedAt: new Date().toLocaleString(),
        };

        // Voor nu slaan we alleen meta-info op.
        // Later kunnen we hier een vaste structuur afspreken en de echte data
        // (per sheet) in localStorage zetten zodat modules ermee kunnen werken.
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
        } catch (e) {
          console.warn("Kon Excel-meta niet opslaan in localStorage:", e);
        }

        renderMeta(meta);
      } catch (error) {
        console.error("Fout bij lezen van Excel-bestand:", error);
        metaEl.innerHTML =
          "<span>Er ging iets mis bij het lezen van het bestand. Controleer of het een geldig Excel-bestand is (.xlsx of .xls).</span>";
      }
    }
  });
})();

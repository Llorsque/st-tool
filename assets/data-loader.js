(function () {
  document.addEventListener("DOMContentLoaded", function () {
    const fileInput = document.getElementById("dataFileInput");
    const button = document.getElementById("dataUploadButton");
    const metaEl = document.getElementById("uploadMeta");

    const STORAGE_META_KEY = "shorttrack_hub_excel_meta_v1";
    const STORAGE_DATA_KEY = "shorttrack_hub_excel_data_v1";

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
      const stored = localStorage.getItem(STORAGE_META_KEY);
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

        const sheetMeta = workbook.SheetNames.map(function (name) {
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
          sheetCount: sheetMeta.length,
          sheets: sheetMeta,
          loadedAt: new Date().toLocaleString(),
        };

        // Parsed data: per sheet een array met rijen (objects op basis van headers)
        const parsed = {
          version: 1,
          fileName: file.name,
          loadedAtISO: new Date().toISOString(),
          sheets: {},
        };

        workbook.SheetNames.forEach(function (name) {
          const ws = workbook.Sheets[name];
          if (!ws) return;

          // raw:false => pakt de "weergavewaarde" (handig voor leading zeros / opmaak)
          const rows = XLSX.utils.sheet_to_json(ws, {
            defval: "",
            raw: false,
            blankrows: false,
          });

          // headers (voor mapping / kolomkeuze)
          const headerRow = XLSX.utils.sheet_to_json(ws, {
            header: 1,
            defval: "",
            raw: false,
            blankrows: false,
          });

          const headers =
            Array.isArray(headerRow) && Array.isArray(headerRow[0])
              ? headerRow[0].map(function (h) {
                  return String(h || "").trim();
                })
              : [];

          parsed.sheets[name] = {
            headers: headers,
            rows: rows,
          };
        });

        try {
          localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));
        } catch (e) {
          console.warn("Kon Excel-meta niet opslaan in localStorage:", e);
        }

        // Data kan groter zijn dan localStorage toelaat. Daarom in try/catch met duidelijke melding.
        try {
          localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(parsed));
        } catch (e) {
          console.warn("Kon Excel-data niet opslaan in localStorage:", e);
          // We tonen een hint: bestand mogelijk te groot.
          metaEl.innerHTML =
            "<span><strong>Bestand geladen, maar data is te groot om op te slaan in de browser.</strong><br/>" +
            "<small>Tip: maak je Excel compacter (minder tabs/rijen) of splits per module. Meta-info is wel opgeslagen.</small></span>";
          return;
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
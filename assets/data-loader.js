
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    const fileInput = document.getElementById("dataFileInput");
    const button = document.getElementById("dataUploadButton");
    const metaEl = document.getElementById("uploadMeta");
    const META_KEY = "shorttrack_hub_excel_meta_v1";
    const DATA_KEY = "shorttrack_hub_excel_data_v1";

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

    // Probeer oude meta-info uit localStorage te lezen
    try {
      const stored = localStorage.getItem(META_KEY);
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

        const sheetsMeta = [];
        const sheetsData = {};

        workbook.SheetNames.forEach(function (name) {
          const ws = workbook.Sheets[name];
          if (!ws) return;

          // Haal de sheet op als 2D-array (eerste rij = headers)
          const sheetArray = XLSX.utils.sheet_to_json(ws, {
            header: 1,
            defval: "",
          });

          if (!sheetArray || !sheetArray.length) return;

          const headers = sheetArray[0].map(function (cell) {
            return String(cell == null ? "" : cell).trim();
          });

          const dataRows = sheetArray
            .slice(1)
            .filter(function (row) {
              // Filter lege rijen eruit
              return row.some(function (cell) {
                return String(cell).trim() !== "";
              });
            });

          sheetsMeta.push({
            name: name,
            rows: dataRows.length,
          });

          sheetsData[name] = {
            headers: headers,
            rows: dataRows,
          };
        });

        const loadedAt = new Date().toLocaleString();

        const meta = {
          fileName: file.name,
          sheetCount: sheetsMeta.length,
          sheets: sheetsMeta,
          loadedAt: loadedAt,
        };

        // Sla compacte meta-info op (voor weergave op de homepage)
        try {
          localStorage.setItem(META_KEY, JSON.stringify(meta));
        } catch (e) {
          console.warn("Kon Excel-meta niet opslaan in localStorage:", e);
        }

        // Sla volledige data op in een aparte key (voor modules zoals Standings / Men's Skaters)
        const fullData = {
          fileName: file.name,
          loadedAt: loadedAt,
          sheets: sheetsData,
        };

        try {
          localStorage.setItem(DATA_KEY, JSON.stringify(fullData));
        } catch (e) {
          console.warn(
            "Kon volledige Excel-data niet opslaan in localStorage (bestand mogelijk te groot):",
            e
          );
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

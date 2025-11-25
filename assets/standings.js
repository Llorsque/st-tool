
(function () {
  const DATA_KEY = "shorttrack_hub_excel_data_v1";

  const POINTS_TO_RANK = {
    100: 1,
    80: 2,
    70: 3,
    60: 4,
    50: 5,
    44: 6,
    40: 7,
    36: 8,
    32: 9,
    28: 10,
    24: 11,
    20: 12,
    18: 13,
    16: 14,
    14: 15,
    12: 16,
    10: 17,
    8: 18,
    6: 19,
    5: 20,
    4: 21,
    3: 22,
    2: 23,
    1: 24,
  };

  function pointsToRank(cell) {
    const num = Number(cell);
    if (!num || !POINTS_TO_RANK[num]) return "";
    return POINTS_TO_RANK[num];
  }

  function loadExcelData() {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn("Kon Excel-data niet lezen:", e);
      return null;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    const data = loadExcelData();
    const statusEl = document.getElementById("standingsStatus");
    const tabs = Array.from(document.querySelectorAll(".standings-tab"));
    const panels = Array.from(document.querySelectorAll(".standings-panel"));
    const searchInput = document.getElementById("standingsSearch");
    const landSelect = document.getElementById("standingsFilterLand");
    const clearBtn = document.getElementById("standingsClearFilters");

    if (!tabs.length || !panels.length) return;

    if (!data || !data.sheets) {
      if (statusEl) {
        statusEl.textContent =
          "Geen Excel-data gevonden. Upload eerst een datafile op het hoofdmenu.";
      }
      return;
    }

    const sheets = data.sheets;

    const TAB_CONFIG = {
      "overall-men": { sheetName: "Overall Men", withRounds: false },
      "500-men": { sheetName: "500 Men", withRounds: true },
      "1000-men": { sheetName: "1000 Men", withRounds: true },
      "1500-men": { sheetName: "1500 Men", withRounds: true },
      "relay-men": { sheetName: "Relay Men", withRounds: true },
    };

    let activeTabKey = "overall-men";
    let currentSearch = "";
    let selectedLands = [];

    function getPanelBody(tabKey) {
      const panel = panels.find(function (p) {
        return p.dataset.tab === tabKey;
      });
      if (!panel) return null;
      return panel.querySelector("tbody");
    }

    function getPanelMeta(tabKey) {
      const panel = panels.find(function (p) {
        return p.dataset.tab === tabKey;
      });
      if (!panel) return null;
      return panel.querySelector(".standings-panel-meta");
    }

    function getSheetForTab(tabKey) {
      const cfg = TAB_CONFIG[tabKey];
      if (!cfg) return null;
      return sheets[cfg.sheetName] || null;
    }

    function baseRowFromSheetRow(row) {
      // Excel kolommen: A=0 (RANK), D=3 (NAME), E=4 (LAND), J=9 (TOTAL)
      return {
        rank: row[0] || "",
        name: row[3] || "",
        land: row[4] || "",
        total: row[9] || "",
      };
    }

    function buildRowsForTab(tabKey) {
      const sheet = getSheetForTab(tabKey);
      if (!sheet || !sheet.rows) return [];

      const cfg = TAB_CONFIG[tabKey];
      const rows = sheet.rows.map(function (row) {
        const base = baseRowFromSheetRow(row);

        if (cfg.withRounds) {
          // F=5, G=6, H=7 omzetten van punten naar klassering
          // Labels in UI: CAN 1 (F), CAN 2 (G), POL (H)
          base.can1 = pointsToRank(row[5]);
          base.can2 = pointsToRank(row[6]);
          base.pol = pointsToRank(row[7]);
        }

        return base;
      });

      return rows;
    }

    function applyFilters(rows) {
      const search = currentSearch.trim().toLowerCase();
      const landSet = new Set(selectedLands);

      return rows.filter(function (row) {
        if (landSet.size && row.land && !landSet.has(row.land)) {
          return false;
        }

        if (search) {
          const haystack = [row.rank, row.name, row.land, row.total, row.can1, row.can2, row.pol]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(search)) return false;
        }

        return true;
      });
    }

    function populateLandFilter(allRows) {
      if (!landSelect) return;
      const unique = Array.from(
        new Set(
          allRows
            .map(function (r) {
              return r.land;
            })
            .filter(Boolean)
        )
      ).sort();

      const prevSelected = new Set(selectedLands);

      landSelect.innerHTML = "";

      unique.forEach(function (land) {
        const opt = document.createElement("option");
        opt.value = land;
        opt.textContent = land;
        if (prevSelected.has(land)) {
          opt.selected = true;
        }
        landSelect.appendChild(opt);
      });
    }

    function renderActiveTab() {
      const rows = buildRowsForTab(activeTabKey);
      populateLandFilter(rows);

      const filtered = applyFilters(rows);
      const tbody = getPanelBody(activeTabKey);
      const metaEl = getPanelMeta(activeTabKey);

      if (!tbody) return;

      tbody.innerHTML = "";

      if (!filtered.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 7;
        td.className = "standings-empty";
        td.textContent = "Geen rijen gevonden voor deze filters.";
        tr.appendChild(td);
        tbody.appendChild(tr);
      } else {
        filtered.forEach(function (row) {
          const tr = document.createElement("tr");

          function td(text, extraClass) {
            const cell = document.createElement("td");
            if (extraClass) cell.className = extraClass;
            cell.textContent = text == null ? "" : text;
            return cell;
          }

          const cfg = TAB_CONFIG[activeTabKey];

          tr.appendChild(td(row.rank, "standings-col-rank"));
          tr.appendChild(td(row.name));
          tr.appendChild(td(row.land, "standings-col-country"));

          if (cfg && cfg.withRounds) {
            tr.appendChild(td(row.can1 || ""));
            tr.appendChild(td(row.can2 || ""));
            tr.appendChild(td(row.pol || ""));
          }

          tr.appendChild(td(row.total, "standings-col-total"));

          tbody.appendChild(tr);
        });
      }

      if (metaEl) {
        const totalCount = rows.length;
        const filteredCount = filtered.length;
        if (!totalCount) {
          metaEl.textContent = "Geen data gevonden voor dit tabblad in de Excel.";
        } else if (filteredCount === totalCount) {
          metaEl.textContent = "Rijen in Excel-sheet: " + totalCount;
        } else {
          metaEl.textContent =
            "Gefilterd: " + filteredCount + " van " + totalCount + " rijen.";
        }
      }
    }

    function setActiveTab(tabKey) {
      activeTabKey = tabKey;

      tabs.forEach(function (btn) {
        if (btn.dataset.tab === tabKey) {
          btn.classList.add("is-active");
        } else {
          btn.classList.remove("is-active");
        }
      });

      panels.forEach(function (panel) {
        if (panel.dataset.tab === tabKey) {
          panel.classList.add("is-active");
        } else {
          panel.classList.remove("is-active");
        }
      });

      renderActiveTab();
    }

    tabs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const tabKey = btn.dataset.tab;
        if (!tabKey || tabKey === activeTabKey) return;
        setActiveTab(tabKey);
      });
    });

    if (searchInput) {
      searchInput.addEventListener("input", function (e) {
        currentSearch = e.target.value || "";
        renderActiveTab();
      });
    }

    if (landSelect) {
      landSelect.addEventListener("change", function () {
        selectedLands = Array.from(landSelect.selectedOptions).map(function (o) {
          return o.value;
        });
        renderActiveTab();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        currentSearch = "";
        selectedLands = [];
        if (searchInput) searchInput.value = "";
        if (landSelect) {
          Array.from(landSelect.options).forEach(function (opt) {
            opt.selected = false;
          });
        }
        renderActiveTab();
      });
    }

    // Initiële tab
    setActiveTab(activeTabKey);
  });
})();

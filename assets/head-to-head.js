
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

  function normalize(str) {
    return String(str || "").trim().toLowerCase();
  }

  function excelTimeToString(value) {
    if (value == null || value === "") return "";
    if (typeof value === "string") return value.trim();

    if (typeof value === "number") {
      const totalSeconds = value * 86400;
      if (!isFinite(totalSeconds) || totalSeconds <= 0) return String(value);

      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds - minutes * 60;
      const secWhole = Math.floor(seconds);
      const ms = Math.round((seconds - secWhole) * 1000);

      const mm = String(minutes).padStart(1, "0");
      const ss = String(secWhole).padStart(2, "0");
      const fff = String(ms).padStart(3, "0");

      return mm + ":" + ss + "." + fff;
    }

    return String(value);
  }

  function pickExistingSheet(sheets, candidates) {
    for (let i = 0; i < candidates.length; i++) {
      const name = candidates[i];
      if (sheets[name]) return name;
    }
    const keys = Object.keys(sheets || {});
    const lowerMap = new Map(keys.map((k) => [k.toLowerCase(), k]));
    for (let i = 0; i < candidates.length; i++) {
      const key = lowerMap.get(String(candidates[i]).toLowerCase());
      if (key && sheets[key]) return key;
    }
    return null;
  }

  function getSheetNamesFor(gender, distanceKey, sheets) {
    const isMen = gender === "men";
    const overallCandidates = isMen
      ? ["Overall Men", "Overall MEN", "Overall"]
      : ["Overall Women", "Overall WOMEN", "Overall Women ", "Overall"];

    const distanceCandidatesByKey = {
      "500": isMen ? ["500 Men", "500 MEN", "500m Men", "500"] : ["500 Women", "500 WOMEN", "500m Women", "500"],
      "1000": isMen ? ["1000 Men", "1000 MEN", "1000m Men", "1000"] : ["1000 Women", "1000 WOMEN", "1000m Women", "1000"],
      "1500": isMen ? ["1500 Men", "1500 MEN", "1500m Men", "1500"] : ["1500 Women", "1500 WOMEN", "1500m Women", "1500"],
      "relay": isMen ? ["Relay Men", "Relay MEN", "Relay"] : ["Relay Women", "Relay WOMEN", "Relay"],
      "mixed": ["Mixed Relay", "Mixed relay", "Mixed Relay ", "Mixed"],
    };

    const overallName = pickExistingSheet(sheets, overallCandidates);
    const distanceName = pickExistingSheet(sheets, distanceCandidatesByKey[distanceKey] || []);

    return { overallName, distanceName };
  }

  function buildIndex(sheet) {
    const index = new Map();
    const rows = (sheet && sheet.rows) || [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = row && row[3]; // D
      const key = normalize(name);
      if (!key) continue;
      if (!index.has(key)) index.set(key, row);
    }
    return index;
  }

  document.addEventListener("DOMContentLoaded", function () {
    const statusEl = document.getElementById("h2hStatus");
    const genderBtns = Array.from(document.querySelectorAll(".h2h-gender-btn"));
    const distanceBtns = Array.from(document.querySelectorAll(".h2h-distance-btn"));
    const pickerGrid = document.getElementById("h2hPickerGrid");
    const tableBody = document.getElementById("h2hBody");
    const tableTitle = document.getElementById("h2hTableTitle");

    const data = loadExcelData();
    if (!data || !data.sheets) {
      if (statusEl) {
        statusEl.textContent =
          "Geen Excel-data gevonden. Upload eerst een datafile op het hoofdmenu.";
      }
      return;
    }

    const sheets = data.sheets;

    let gender = "men";
    let distance = "500";
    const selected = new Array(8).fill("");

    let riderOptions = []; // {name, land}
    let overallIndex = new Map();
    let distanceIndex = new Map();
    let activeSheetNames = { overallName: null, distanceName: null };

    const comboboxes = [];

    function buildRiderListFromOverallSheet(overallName) {
      const sheet = sheets[overallName];
      const rows = (sheet && sheet.rows) || [];
      const items = rows
        .map((r) => ({
          name: String(r[3] || "").trim(), // D
          land: String(r[4] || "").trim(), // E
        }))
        .filter((x) => x.name);

      const seen = new Set();
      const unique = [];
      for (const item of items) {
        const key = normalize(item.name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(item);
      }

      unique.sort((a, b) => a.name.localeCompare(b.name));
      return unique;
    }

    function rebuildIndexes() {
      const { overallName, distanceName } = activeSheetNames;
      overallIndex = overallName ? buildIndex(sheets[overallName]) : new Map();
      distanceIndex = distanceName ? buildIndex(sheets[distanceName]) : new Map();
      riderOptions = overallName ? buildRiderListFromOverallSheet(overallName) : [];
    }

    function setActiveGender(next) {
      gender = next;
      genderBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.gender === gender));
      resolveSheetsAndRender();
    }

    function setActiveDistance(next) {
      distance = next;
      distanceBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.distance === distance));
      resolveSheetsAndRender();
    }

    function resolveSheetsAndRender() {
      activeSheetNames = getSheetNamesFor(gender, distance, sheets);

      const missing = [];
      if (!activeSheetNames.overallName) missing.push("Overall sheet (bijv. 'Overall Men')");
      if (!activeSheetNames.distanceName) missing.push("Distance sheet (bijv. '500 Men')");

      if (missing.length) {
        if (statusEl) {
          statusEl.textContent =
            "Kan benodigde tabbladen niet vinden: " + missing.join(" + ") + ".";
        }
      } else if (statusEl) {
        statusEl.textContent =
          "Bron: " + activeSheetNames.overallName + " + " + activeSheetNames.distanceName + ".";
      }

      rebuildIndexes();
      updateComboboxes();
      renderTable();
    }

    function updateComboboxes() {
      for (let i = 0; i < comboboxes.length; i++) {
        comboboxes[i].setLabel(selected[i] || "");
      }
    }

    function getOverallRow(name) {
      return overallIndex.get(normalize(name)) || null;
    }

    function getDistanceRow(name) {
      return distanceIndex.get(normalize(name)) || null;
    }

    function getOverallRank(name) {
      const row = getOverallRow(name);
      const val = row ? row[0] : ""; // A
      return val && String(val).trim() ? String(val).trim() : "-";
    }

    // WT = kolom A uit het tabblad van de gekozen afstand
    function getWTFromDistance(name) {
      const row = getDistanceRow(name);
      const wt = row ? row[0] : ""; // A
      return wt && String(wt).trim() ? String(wt).trim() : "-";
    }

    function getLand(name) {
      // Land altijd gevuld: prefer overall (E), fallback distance (E), else "-"
      const o = getOverallRow(name);
      const d = getDistanceRow(name);
      const land = (o && o[4]) || (d && d[4]) || "";
      return land && String(land).trim() ? String(land).trim() : "-";
    }

    function getDistanceFields(name) {
      const row = getDistanceRow(name);
      if (!row) {
        return { can1: "-", can2: "-", pol: "-", time: "-" };
      }

      const can1 = pointsToRank(row[5]); // F
      const can2 = pointsToRank(row[6]); // G
      const pol = pointsToRank(row[7]);  // H
      const timeVal = excelTimeToString(row[10]); // K

      return {
        can1: can1 !== "" ? String(can1) : "-",
        can2: can2 !== "" ? String(can2) : "-",
        pol: pol !== "" ? String(pol) : "-",
        time: timeVal && String(timeVal).trim() ? String(timeVal).trim() : "-",
      };
    }

    function getOptions(query, slotIndex) {
      const q = (query || "").trim().toLowerCase();

      const selectedElsewhere = new Set(
        selected
          .map((s, idx) => (idx === slotIndex ? "" : normalize(s)))
          .filter(Boolean)
      );

      const filtered = riderOptions.filter((opt) => {
        const key = normalize(opt.name);
        if (selectedElsewhere.has(key)) return false;
        if (!q) return true;
        const hay = (opt.name + " " + (opt.land || "")).toLowerCase();
        return hay.includes(q);
      });

      return filtered.map((opt) => ({
        value: opt.name,
        label: opt.name,                 // ✅ dropdown label: alleen naam
        meta: opt.land ? opt.land : "",
      }));
    }

    function onSelect(name, slotIndex) {
      selected[slotIndex] = name;
      renderTable();
      comboboxes[slotIndex].setLabel(name);
    }

    function onClear(slotIndex) {
      selected[slotIndex] = "";
      renderTable();
      comboboxes[slotIndex].setLabel("");
    }

    function renderTable() {
      if (!tableBody) return;

      const picked = selected.filter((s) => s && String(s).trim() !== "");
      tableBody.innerHTML = "";

      const labelMap = {
        "500": "500m",
        "1000": "1000m",
        "1500": "1500m",
        "relay": "Relay",
        "mixed": "Mixed relay",
      };

      if (tableTitle) {
        const g = gender === "men" ? "Men" : "Women";
        tableTitle.textContent =
          "Vergelijking · " + g + " · " + (labelMap[distance] || distance);
      }

      if (!picked.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 7;
        td.className = "h2h-empty";
        td.textContent = "Selecteer één of meer rijders (max 8) om te vergelijken.";
        tr.appendChild(td);
        tableBody.appendChild(tr);
        return;
      }

      picked.forEach((name) => {
        const land = getLand(name);
        const fields = getDistanceFields(name);
        const overall = getOverallRank(name);
        const wt = getWTFromDistance(name);

        const tr = document.createElement("tr");

        function cell(text, cls) {
          const td = document.createElement("td");
          if (cls) td.className = cls;
          td.textContent = text == null ? "" : text;
          return td;
        }

        tr.appendChild(cell(land, "h2h-col-small"));
        tr.appendChild(cell(fields.can1, "h2h-col-small"));
        tr.appendChild(cell(fields.can2, "h2h-col-small"));
        tr.appendChild(cell(fields.pol, "h2h-col-small"));
        tr.appendChild(cell(overall, "h2h-col-small"));
        tr.appendChild(cell(wt, "h2h-col-small"));
        tr.appendChild(cell(fields.time, "h2h-col-time"));

        tableBody.appendChild(tr);
      });
    }

    // --- Combobox component ---
    function createCombobox({ mountEl, slotIndex }) {
      const wrapper = document.createElement("div");
      wrapper.className = "h2h-combobox";

      const input = document.createElement("input");
      input.className = "h2h-input";
      input.type = "text";
      input.placeholder = "Type om te zoeken…";
      input.autocomplete = "off";
      input.spellcheck = false;

      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "h2h-clear";
      clear.title = "Leegmaken";
      clear.textContent = "×";

      const dropdown = document.createElement("div");
      dropdown.className = "h2h-dropdown";

      wrapper.appendChild(input);
      wrapper.appendChild(clear);
      wrapper.appendChild(dropdown);
      mountEl.appendChild(wrapper);

      let highlightedIndex = -1;
      let open = false;
      let currentItems = [];

      function render(items) {
        dropdown.innerHTML = "";
        currentItems = items;

        if (!items.length) {
          const empty = document.createElement("div");
          empty.className = "h2h-option";
          empty.textContent = "Geen resultaten";
          dropdown.appendChild(empty);
          highlightedIndex = -1;
          return;
        }

        items.forEach((item, idx) => {
          const opt = document.createElement("div");
          opt.className = "h2h-option";
          opt.dataset.idx = String(idx);
          opt.innerHTML = `${item.label} <small>${item.meta || ""}</small>`;

          opt.addEventListener("mousedown", (e) => {
            e.preventDefault();
            selectIdx(idx);
          });

          dropdown.appendChild(opt);
        });

        highlightedIndex = -1;
      }

      function openDropdown() {
        if (open) return;
        open = true;
        dropdown.classList.add("is-open");
      }

      function closeDropdown() {
        open = false;
        dropdown.classList.remove("is-open");
        highlightedIndex = -1;
        updateHighlight();
      }

      function updateHighlight() {
        const nodes = Array.from(dropdown.querySelectorAll(".h2h-option"));
        nodes.forEach((n) => n.classList.remove("is-highlighted"));
        if (highlightedIndex >= 0 && highlightedIndex < nodes.length) {
          nodes[highlightedIndex].classList.add("is-highlighted");
          nodes[highlightedIndex].scrollIntoView({ block: "nearest" });
        }
      }

      function selectIdx(idx) {
        const item = currentItems[idx];
        if (!item || !item.value) return;
        input.value = item.value;
        closeDropdown();
        onSelect(item.value, slotIndex);
      }

      function refresh() {
        const q = input.value.trim().toLowerCase();
        const items = getOptions(q, slotIndex);
        render(items.slice(0, 120));
        openDropdown();
      }

      input.addEventListener("focus", refresh);
      input.addEventListener("input", refresh);

      input.addEventListener("keydown", (e) => {
        if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          refresh();
          return;
        }

        if (e.key === "Escape") {
          closeDropdown();
          return;
        }

        if (e.key === "ArrowDown") {
          e.preventDefault();
          highlightedIndex = Math.min(highlightedIndex + 1, currentItems.length - 1);
          updateHighlight();
          return;
        }

        if (e.key === "ArrowUp") {
          e.preventDefault();
          highlightedIndex = Math.max(highlightedIndex - 1, 0);
          updateHighlight();
          return;
        }

        if (e.key === "Enter") {
          if (highlightedIndex >= 0) {
            e.preventDefault();
            selectIdx(highlightedIndex);
          }
          return;
        }
      });

      clear.addEventListener("click", () => {
        input.value = "";
        closeDropdown();
        onClear(slotIndex);
      });

      document.addEventListener("click", (e) => {
        if (!wrapper.contains(e.target)) closeDropdown();
      });

      return {
        setLabel(label) {
          input.value = label || "";
        },
      };
    }

    // Init UI
    genderBtns.forEach((btn) => {
      btn.addEventListener("click", () => setActiveGender(btn.dataset.gender));
    });

    distanceBtns.forEach((btn) => {
      btn.addEventListener("click", () => setActiveDistance(btn.dataset.distance));
    });

    // Build 8 pickers
    if (pickerGrid) {
      pickerGrid.innerHTML = "";
      for (let i = 0; i < 8; i++) {
        const card = document.createElement("div");
        card.className = "h2h-picker-card";

        const label = document.createElement("div");
        label.className = "h2h-picker-label";
        label.textContent = "Rijder " + (i + 1);

        card.appendChild(label);

        const mount = document.createElement("div");
        card.appendChild(mount);

        pickerGrid.appendChild(card);

        comboboxes.push(createCombobox({ mountEl: mount, slotIndex: i }));
      }
    }

    setActiveGender("men");
    setActiveDistance("500");
  });
})();

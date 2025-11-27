
(function () {
  const DATA_KEY = "shorttrack_hub_excel_data_v1";

  const POINTS_TO_RANK = {
    100: 1, 80: 2, 70: 3, 60: 4, 50: 5, 44: 6, 40: 7, 36: 8, 32: 9, 28: 10,
    24: 11, 20: 12, 18: 13, 16: 14, 14: 15, 12: 16, 10: 17, 8: 18, 6: 19, 5: 20,
    4: 21, 3: 22, 2: 23, 1: 24,
  };

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

  function normalize(v) {
    return String(v ?? "").trim().toLowerCase();
  }

  function pointsToRank(cell) {
    const n = Number(cell);
    if (!n || !POINTS_TO_RANK[n]) return "";
    return POINTS_TO_RANK[n];
  }

  function pickExistingSheet(sheets, candidates) {
    for (const name of candidates) if (sheets[name]) return name;
    const keys = Object.keys(sheets || {});
    const lowerMap = new Map(keys.map((k) => [k.toLowerCase(), k]));
    for (const cand of candidates) {
      const key = lowerMap.get(String(cand).toLowerCase());
      if (key && sheets[key]) return key;
    }
    return null;
  }

  function sheetNameFor(gender, tab, sheets) {
    const isMen = gender === "men";

    const overallCandidates = isMen
      ? ["Overall Men", "Overall MEN", "Overall"]
      : ["Overall Women", "Overall WOMEN", "Overall Women ", "Overall"];

    const distanceCandidates = (tabKey) => {
      if (tabKey === "relay") {
        return isMen ? ["Relay Men", "Relay MEN", "Relay"] : ["Relay Women", "Relay WOMEN", "Relay"];
      }
      if (tabKey === "mixed") {
        // Prefer gender-neutral tab if present; else try gender-specific
        return ["Mixed Relay", "Mixed relay", "Mixed Relay ", "Mixed"]
          .concat(isMen ? ["Mixed Relay Men", "Mixed MEN"] : ["Mixed Relay Women", "Mixed WOMEN"]);
      }
      if (tabKey === "500") return isMen ? ["500 Men", "500 MEN", "500"] : ["500 Women", "500 WOMEN", "500"];
      if (tabKey === "1000") return isMen ? ["1000 Men", "1000 MEN", "1000"] : ["1000 Women", "1000 WOMEN", "1000"];
      if (tabKey === "1500") return isMen ? ["1500 Men", "1500 MEN", "1500"] : ["1500 Women", "1500 WOMEN", "1500"];
      return overallCandidates;
    };

    if (tab === "overall") return pickExistingSheet(sheets, overallCandidates);
    return pickExistingSheet(sheets, distanceCandidates(tab));
  }

  function looksLikeHeader(row) {
    // Detect "RANK" in A and "NAME" in D or "LAND" in E etc.
    if (!row) return false;
    const a = normalize(row[0]);
    const d = normalize(row[3]);
    const e = normalize(row[4]);
    const j = normalize(row[9]);
    const hasRank = a.includes("rank");
    const hasName = d.includes("name") || d.includes("naam");
    const hasLand = e.includes("land") || e.includes("country") || e.includes("nation");
    const hasTotal = j.includes("total") || j.includes("punten") || j.includes("points");
    return hasRank && (hasName || hasLand || hasTotal);
  }

  function extractRows(sheetRows) {
    const rows = Array.isArray(sheetRows) ? sheetRows : [];
    if (!rows.length) return [];
    const startIdx = looksLikeHeader(rows[0]) ? 1 : 0;

    const out = [];
    for (let i = startIdx; i < rows.length; i++) {
      const r = rows[i] || [];
      const rank = String(r[0] ?? "").trim();     // A
      const name = String(r[3] ?? "").trim();     // D
      const land = String(r[4] ?? "").trim();     // E
      const total = String(r[9] ?? "").trim();    // J
      const can1 = pointsToRank(r[5]);            // F
      const can2 = pointsToRank(r[6]);            // G
      const pol  = pointsToRank(r[7]);            // H

      // Skip fully empty lines
      if (!rank && !name && !land && !total) continue;

      out.push({
        rank: rank || "-",
        name: name || "-",
        land: land || "-",
        total: total || "-",
        can1: can1 ? String(can1) : "-",
        can2: can2 ? String(can2) : "-",
        pol:  pol  ? String(pol)  : "-",
      });
    }

    // Sort by numeric rank when possible
    out.sort((a, b) => {
      const na = Number(a.rank);
      const nb = Number(b.rank);
      const aNum = Number.isFinite(na);
      const bNum = Number.isFinite(nb);
      if (aNum && bNum) return na - nb;
      if (aNum && !bNum) return -1;
      if (!aNum && bNum) return 1;
      return String(a.name).localeCompare(String(b.name));
    });

    return out;
  }

  // --- multiselect component (same as other modules) ---
  function createMultiSelect(mountEl, { placeholder, onChange }) {
    const state = { open: false, query: "", options: [], selected: new Set() };

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "st-multi-btn";

    const chipline = document.createElement("div");
    chipline.className = "st-chipline";

    const caret = document.createElement("div");
    caret.textContent = "▾";

    btn.appendChild(chipline);
    btn.appendChild(caret);

    const panel = document.createElement("div");
    panel.className = "st-panel";

    const top = document.createElement("div");
    top.className = "st-panel-top";

    const search = document.createElement("input");
    search.className = "st-panel-search";
    search.type = "search";
    search.placeholder = "Zoek…";
    search.autocomplete = "off";

    const actions = document.createElement("div");
    actions.className = "st-panel-actions";

    const btnAll = document.createElement("button");
    btnAll.type = "button";
    btnAll.className = "st-mini";
    btnAll.textContent = "Selecteer alles";

    const btnNone = document.createElement("button");
    btnNone.type = "button";
    btnNone.className = "st-mini";
    btnNone.textContent = "Wis selectie";

    actions.appendChild(btnAll);
    actions.appendChild(btnNone);

    top.appendChild(search);
    top.appendChild(actions);

    const opts = document.createElement("div");
    opts.className = "st-options";

    panel.appendChild(top);
    panel.appendChild(opts);

    mountEl.appendChild(btn);
    mountEl.appendChild(panel);

    function setOpen(next) {
      state.open = next;
      panel.classList.toggle("is-open", state.open);
      if (state.open) {
        search.focus();
        renderOptions();
      }
    }

    function renderChips() {
      chipline.innerHTML = "";
      const chosen = Array.from(state.selected);

      if (!chosen.length) {
        const t = document.createElement("div");
        t.style.color = "rgba(255,255,255,.75)";
        t.style.fontSize = "14px";
        t.textContent = placeholder;
        chipline.appendChild(t);
        return;
      }

      const max = 2;
      chosen.slice(0, max).forEach((v) => {
        const chip = document.createElement("span");
        chip.className = "st-chip";
        chip.textContent = v;
        chipline.appendChild(chip);
      });

      if (chosen.length > max) {
        const chip = document.createElement("span");
        chip.className = "st-chip";
        chip.textContent = `+${chosen.length - max}`;
        chipline.appendChild(chip);
      }
    }

    function renderOptions() {
      const q = normalize(state.query);
      opts.innerHTML = "";
      const filtered = state.options.filter((v) => !q || normalize(v).includes(q));

      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.style.color = "rgba(255,255,255,.72)";
        empty.style.padding = "10px 8px";
        empty.textContent = "Geen resultaten";
        opts.appendChild(empty);
        return;
      }

      filtered.forEach((v) => {
        const row = document.createElement("label");
        row.className = "st-option";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = state.selected.has(v);

        const span = document.createElement("span");
        span.textContent = v;

        row.appendChild(cb);
        row.appendChild(span);

        row.addEventListener("click", () => {
          if (state.selected.has(v)) state.selected.delete(v);
          else state.selected.add(v);
          renderChips();
          renderOptions();
          onChange(Array.from(state.selected));
        });

        opts.appendChild(row);
      });
    }

    btn.addEventListener("click", () => setOpen(!state.open));

    search.addEventListener("input", () => {
      state.query = search.value || "";
      renderOptions();
    });

    btnAll.addEventListener("click", (e) => {
      e.stopPropagation();
      const q = normalize(state.query);
      state.options.filter((v) => !q || normalize(v).includes(q)).forEach((v) => state.selected.add(v));
      renderChips();
      renderOptions();
      onChange(Array.from(state.selected));
    });

    btnNone.addEventListener("click", (e) => {
      e.stopPropagation();
      state.selected.clear();
      renderChips();
      renderOptions();
      onChange([]);
    });

    document.addEventListener("click", (e) => {
      if (!mountEl.contains(e.target)) setOpen(false);
    });

    renderChips();

    return {
      setOptions(values) {
        state.options = Array.from(new Set(values)).filter((x) => String(x).trim() !== "");
        state.options.sort((a, b) => String(a).localeCompare(String(b)));
        renderOptions();
      },
      clear() {
        state.selected.clear();
        state.query = "";
        search.value = "";
        renderChips();
        renderOptions();
        onChange([]);
      },
    };
  }

  document.addEventListener("DOMContentLoaded", () => {
    const statusEl = document.getElementById("stStatus");
    const headEl = document.getElementById("stHead");
    const bodyEl = document.getElementById("stBody");

    const genders = Array.from(document.querySelectorAll(".st-gender"));
    const tabs = Array.from(document.querySelectorAll(".st-tab"));
    const searchEl = document.getElementById("stSearch");
    const resetEl = document.getElementById("stReset");

    const store = loadExcelData();
    if (!store?.sheets) {
      statusEl.textContent = "Geen Excel-data gevonden. Upload eerst je Excel op het hoofdmenu.";
      return;
    }

    const state = {
      gender: "men",
      tab: "overall",
      query: "",
      countries: [],
      riders: [],
      rows: [],
      sheetName: null,
    };

    const countrySelect = createMultiSelect(document.getElementById("stCountryFilter"), {
      placeholder: "Alle landen",
      onChange: (values) => {
        state.countries = values;
        render();
      },
    });

    const riderSelect = createMultiSelect(document.getElementById("stRiderFilter"), {
      placeholder: "Alle rijders",
      onChange: (values) => {
        state.riders = values;
        render();
      },
    });

    function buildHeader() {
      const tr = document.createElement("tr");
      const th = (txt, cls) => {
        const el = document.createElement("th");
        el.textContent = txt;
        if (cls) el.className = cls;
        return el;
      };

      headEl.innerHTML = "";
      if (state.tab === "overall") {
        tr.appendChild(th("Rank", "st-col-small"));
        tr.appendChild(th("Name"));
        tr.appendChild(th("Land", "st-col-small"));
        tr.appendChild(th("Total", "st-col-small"));
      } else {
        tr.appendChild(th("Rank", "st-col-small"));
        tr.appendChild(th("Name"));
        tr.appendChild(th("Land", "st-col-small"));
        tr.appendChild(th("CAN 1", "st-col-small"));
        tr.appendChild(th("CAN 2", "st-col-small"));
        tr.appendChild(th("POL", "st-col-small"));
        tr.appendChild(th("Total", "st-col-small"));
      }
      headEl.appendChild(tr);
    }

    function resolveSheetAndRows() {
      const sheets = store.sheets;
      const name = sheetNameFor(state.gender, state.tab, sheets);
      state.sheetName = name;

      if (!name || !sheets[name]) {
        state.rows = [];
        return;
      }

      state.rows = extractRows(sheets[name].rows);

      // Refresh filter options for this tab/gender (based on available rows)
      countrySelect.setOptions(state.rows.map((r) => r.land).filter(Boolean));
      riderSelect.setOptions(state.rows.map((r) => r.name).filter(Boolean));

      // Reset selected filters when switching tab/gender to avoid blank results
      state.countries = [];
      state.riders = [];
      countrySelect.clear();
      riderSelect.clear();
    }

    function matches(r) {
      const q = normalize(state.query);
      const qOk =
        !q ||
        normalize(r.rank).includes(q) ||
        normalize(r.name).includes(q) ||
        normalize(r.land).includes(q);

      const cOk = !state.countries.length || state.countries.includes(r.land);
      const rOk = !state.riders.length || state.riders.includes(r.name);

      return qOk && cOk && rOk;
    }

    function render() {
      buildHeader();
      bodyEl.innerHTML = "";

      const filtered = state.rows.filter(matches);

      if (!state.sheetName) {
        statusEl.textContent = "Sheet niet gevonden voor deze selectie. Controleer tabbladnamen in Excel.";
      } else {
        const titleMap = {
          overall: "World Tour Classification",
          500: "500m",
          1000: "1000m",
          1500: "1500m",
          relay: "Relay",
          mixed: "Mixed Relay",
        };
        const g = state.gender === "men" ? "Men" : "Women";
        statusEl.textContent = `${g} · ${titleMap[state.tab]} · Sheet: ${state.sheetName} · Rijen: ${filtered.length} / ${state.rows.length}`;
      }

      if (!filtered.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = state.tab === "overall" ? 4 : 7;
        td.style.color = "rgba(255,255,255,.72)";
        td.style.padding = "14px 12px";
        td.textContent = "Geen resultaten (pas filters aan).";
        tr.appendChild(td);
        bodyEl.appendChild(tr);
        return;
      }

      filtered.forEach((r) => {
        const tr = document.createElement("tr");
        const td = (txt, cls) => {
          const el = document.createElement("td");
          el.textContent = txt;
          if (cls) el.className = cls;
          return el;
        };

        if (state.tab === "overall") {
          tr.appendChild(td(r.rank, "st-col-small"));
          tr.appendChild(td(r.name));
          tr.appendChild(td(r.land, "st-col-small"));
          tr.appendChild(td(r.total, "st-col-small"));
        } else {
          tr.appendChild(td(r.rank, "st-col-small"));
          tr.appendChild(td(r.name));
          tr.appendChild(td(r.land, "st-col-small"));
          tr.appendChild(td(r.can1, "st-col-small"));
          tr.appendChild(td(r.can2, "st-col-small"));
          tr.appendChild(td(r.pol, "st-col-small"));
          tr.appendChild(td(r.total, "st-col-small"));
        }

        bodyEl.appendChild(tr);
      });
    }

    function setGender(next) {
      state.gender = next;
      genders.forEach((b) => b.classList.toggle("is-active", b.dataset.gender === next));
      resolveSheetAndRows();
      render();
    }

    function setTab(next) {
      state.tab = next;
      tabs.forEach((b) => b.classList.toggle("is-active", b.dataset.tab === next));
      resolveSheetAndRows();
      render();
    }

    genders.forEach((btn) => btn.addEventListener("click", () => setGender(btn.dataset.gender)));
    tabs.forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

    searchEl.addEventListener("input", () => {
      state.query = searchEl.value || "";
      render();
    });

    resetEl.addEventListener("click", () => {
      state.query = "";
      searchEl.value = "";
      state.countries = [];
      state.riders = [];
      countrySelect.clear();
      riderSelect.clear();
      render();
    });

    // initial
    resolveSheetAndRows();
    render();
  });
})();

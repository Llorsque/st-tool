
(function () {
  const DATA_KEY = "shorttrack_hub_excel_data_v1";
  const SHEET_NAME = "Men";

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

  function isHeaderRow(row) {
    if (!row || row.length < 3) return false;
    const a = normalize(row[0]);
    const b = normalize(row[1]);
    const c = normalize(row[2]);
    const looksLike = (x) => ["helm", "helm id", "helmet", "helmet id", "id"].some((k) => x.includes(k));
    const looksName = (x) => ["naam", "name", "skater", "rijder"].some((k) => x.includes(k));
    const looksCountry = (x) => ["land", "country", "nation", "noc"].some((k) => x.includes(k));
    return looksLike(a) && looksName(b) && looksCountry(c);
  }

  function extractRows(sheetRows) {
    const rows = Array.isArray(sheetRows) ? sheetRows : [];
    if (!rows.length) return [];
    const startIdx = isHeaderRow(rows[0]) ? 1 : 0;

    const out = [];
    for (let i = startIdx; i < rows.length; i++) {
      const r = rows[i] || [];
      const helmId = String(r[0] ?? "").trim();
      const name = String(r[1] ?? "").trim();
      const land = String(r[2] ?? "").trim();
      if (!helmId && !name && !land) continue;
      out.push({ helmId, name, land });
    }
    return out;
  }

  function createMultiSelect(mountEl, { placeholder, onChange }) {
    const state = { open: false, query: "", options: [], selected: new Set() };

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ms-multi-btn";
    btn.setAttribute("aria-haspopup", "listbox");

    const chipline = document.createElement("div");
    chipline.className = "ms-chipline";
    const caret = document.createElement("div");
    caret.className = "ms-caret";
    caret.textContent = "▾";

    btn.appendChild(chipline);
    btn.appendChild(caret);

    const panel = document.createElement("div");
    panel.className = "ms-panel";
    panel.setAttribute("role", "listbox");

    const top = document.createElement("div");
    top.className = "ms-panel-top";

    const search = document.createElement("input");
    search.className = "ms-panel-search";
    search.type = "search";
    search.placeholder = "Zoek…";
    search.autocomplete = "off";

    const actions = document.createElement("div");
    actions.className = "ms-panel-actions";

    const btnAll = document.createElement("button");
    btnAll.type = "button";
    btnAll.className = "ms-mini";
    btnAll.textContent = "Selecteer alles";

    const btnNone = document.createElement("button");
    btnNone.type = "button";
    btnNone.className = "ms-mini";
    btnNone.textContent = "Wis selectie";

    actions.appendChild(btnAll);
    actions.appendChild(btnNone);

    top.appendChild(search);
    top.appendChild(actions);

    const opts = document.createElement("div");
    opts.className = "ms-options";

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
        chip.className = "ms-chip";
        chip.textContent = v;
        chipline.appendChild(chip);
      });

      if (chosen.length > max) {
        const chip = document.createElement("span");
        chip.className = "ms-chip";
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
        row.className = "ms-option";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = state.selected.has(v);

        const span = document.createElement("span");
        span.textContent = v;

        row.appendChild(cb);
        row.appendChild(span);

        row.addEventListener("click", (e) => {
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
      state.options
        .filter((v) => !q || normalize(v).includes(q))
        .forEach((v) => state.selected.add(v));
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
      getSelected() {
        return Array.from(state.selected);
      },
    };
  }

  document.addEventListener("DOMContentLoaded", () => {
    const statusEl = document.getElementById("msStatus");
    const bodyEl = document.getElementById("msBody");
    const searchEl = document.getElementById("msSearch");
    const resetEl = document.getElementById("msReset");

    const store = loadExcelData();
    if (!store?.sheets) {
      statusEl.textContent = "Geen Excel-data gevonden. Upload eerst je Excel op het hoofdmenu.";
      return;
    }

    const direct = store.sheets[SHEET_NAME];
    const fallbackKey = Object.keys(store.sheets).find((k) => k.toLowerCase() === SHEET_NAME.toLowerCase());
    const sheet = direct || (fallbackKey ? store.sheets[fallbackKey] : null);

    if (!sheet) {
      statusEl.textContent = `Tabblad "${SHEET_NAME}" niet gevonden in je Excel.`;
      return;
    }

    const sheetName = sheet.name || SHEET_NAME;
    const rows = extractRows(sheet.rows);

    const countrySelect = createMultiSelect(document.getElementById("msCountryFilter"), {
      placeholder: "Alle landen",
      onChange: (values) => {
        state.countries = values;
        render();
      },
    });

    const riderSelect = createMultiSelect(document.getElementById("msRiderFilter"), {
      placeholder: "Alle rijders",
      onChange: (values) => {
        state.riders = values;
        render();
      },
    });

    const state = { query: "", countries: [], riders: [] };

    countrySelect.setOptions(rows.map((r) => r.land).filter(Boolean));
    riderSelect.setOptions(rows.map((r) => r.name).filter(Boolean));

    function matchesRow(r) {
      const q = normalize(state.query);
      const qOk =
        !q ||
        normalize(r.helmId).includes(q) ||
        normalize(r.name).includes(q) ||
        normalize(r.land).includes(q);

      const countriesOk = !state.countries.length || state.countries.includes(r.land);
      const ridersOk = !state.riders.length || state.riders.includes(r.name);

      return qOk && countriesOk && ridersOk;
    }

    function render() {
      const filtered = rows.filter(matchesRow);
      bodyEl.innerHTML = "";

      filtered.forEach((r) => {
        const tr = document.createElement("tr");

        const tdId = document.createElement("td");
        tdId.textContent = r.helmId || "-";
        tdId.className = "ms-col-id";

        const tdName = document.createElement("td");
        tdName.textContent = r.name || "-";

        const tdLand = document.createElement("td");
        tdLand.textContent = r.land || "-";
        tdLand.className = "ms-col-country";

        tr.appendChild(tdId);
        tr.appendChild(tdName);
        tr.appendChild(tdLand);
        bodyEl.appendChild(tr);
      });

      statusEl.textContent = `Sheet: ${sheetName} · Rijen: ${filtered.length} / ${rows.length}`;
    }

    searchEl.addEventListener("input", () => {
      state.query = searchEl.value || "";
      render();
    });

    resetEl.addEventListener("click", () => {
      state.query = "";
      searchEl.value = "";
      countrySelect.clear();
      riderSelect.clear();
      render();
    });

    render();
  });
})();

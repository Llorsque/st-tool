(function () {
  const DATA_KEY = "shorttrack_hub_excel_data_v1";
  const MAP_KEY = "shorttrack_hub_men_mapping_v1";

  const state = {
    rawRows: [],
    headers: [],
    helmetKey: null,
    nameKey: null,
    nationKey: null,
    globalQuery: "",
    selectedNations: new Set(),
    selectedSkaters: new Set(), // store helmet IDs by default
  };

  function $(id) {
    return document.getElementById(id);
  }

  function safeString(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function detectColumn(headers, candidates) {
    const lower = headers.map((h) => safeString(h).toLowerCase());
    for (const cand of candidates) {
      const idx = lower.findIndex((h) => h === cand || h.includes(cand));
      if (idx >= 0) return headers[idx];
    }
    return null;
  }

  function readStoredData() {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed;
    } catch (e) {
      console.warn("Kon data niet lezen:", e);
      return null;
    }
  }

  function readStoredMapping() {
    try {
      const raw = localStorage.getItem(MAP_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function storeMapping(mapping) {
    try {
      localStorage.setItem(MAP_KEY, JSON.stringify(mapping));
    } catch (e) {
      console.warn("Kon mapping niet opslaan:", e);
    }
  }

  function buildSelect(selectEl, label, headers, currentKey) {
    selectEl.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = label + " (kies kolom)";
    selectEl.appendChild(opt0);

    headers.forEach((h) => {
      const opt = document.createElement("option");
      opt.value = h;
      opt.textContent = h || "(leeg)";
      if (currentKey && h === currentKey) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  // --- Multi-select component ---
  function createMultiSelect(opts) {
    const {
      mount,
      title,
      placeholder,
      items, // array of { value, label }
      selectedSet,
      onChange,
    } = opts;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ms-button";
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.flexDirection = "column";
    left.style.gap = "0.15rem";

    const strong = document.createElement("strong");
    strong.textContent = title;

    const summary = document.createElement("span");
    summary.textContent = placeholder;

    left.appendChild(strong);
    left.appendChild(summary);

    const chevron = document.createElement("div");
    chevron.className = "ms-chevron";
    chevron.textContent = "▾";

    button.appendChild(left);
    button.appendChild(chevron);

    const popover = document.createElement("div");
    popover.className = "ms-popover";
    popover.setAttribute("role", "dialog");

    const search = document.createElement("input");
    search.className = "ms-search";
    search.type = "search";
    search.placeholder = "Zoek…";
    search.autocomplete = "off";

    const controls = document.createElement("div");
    controls.className = "ms-controls";

    const btnAll = document.createElement("button");
    btnAll.type = "button";
    btnAll.className = "ms-pillbtn";
    btnAll.textContent = "Selecteer alles";

    const btnNone = document.createElement("button");
    btnNone.type = "button";
    btnNone.className = "ms-pillbtn";
    btnNone.textContent = "Wis selectie";

    controls.appendChild(btnAll);
    controls.appendChild(btnNone);

    const list = document.createElement("div");
    list.className = "ms-list";
    list.setAttribute("role", "listbox");

    const empty = document.createElement("div");
    empty.className = "ms-empty";
    empty.textContent = "Geen resultaten.";

    popover.appendChild(search);
    popover.appendChild(controls);
    popover.appendChild(list);

    mount.appendChild(button);
    mount.appendChild(popover);

    let filteredItems = items.slice();

    function updateSummary() {
      const count = selectedSet.size;
      if (count === 0) {
        summary.textContent = placeholder;
        return;
      }
      if (count === 1) {
        const onlyVal = Array.from(selectedSet)[0];
        const found = items.find((i) => i.value === onlyVal);
        summary.textContent = found ? found.label : "1 geselecteerd";
        return;
      }
      summary.textContent = `${count} geselecteerd`;
    }

    function renderList() {
      list.innerHTML = "";
      const q = safeString(search.value).toLowerCase();
      filteredItems = q
        ? items.filter((i) => i.label.toLowerCase().includes(q))
        : items.slice();

      if (filteredItems.length === 0) {
        list.appendChild(empty);
        return;
      }

      filteredItems.forEach((item) => {
        const row = document.createElement("div");
        row.className = "ms-item";

        const id = `ms_${title}_${item.value}`.replace(/\s+/g, "_");

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.id = id;
        cb.checked = selectedSet.has(item.value);

        const label = document.createElement("label");
        label.setAttribute("for", id);
        label.textContent = item.label;

        cb.addEventListener("change", () => {
          if (cb.checked) selectedSet.add(item.value);
          else selectedSet.delete(item.value);
          updateSummary();
          onChange();
        });

        row.appendChild(cb);
        row.appendChild(label);
        list.appendChild(row);
      });
    }

    function open() {
      popover.classList.add("is-open");
      button.setAttribute("aria-expanded", "true");
      search.value = "";
      renderList();
      setTimeout(() => search.focus(), 0);
    }

    function close() {
      popover.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
    }

    function toggle() {
      if (popover.classList.contains("is-open")) close();
      else open();
    }

    button.addEventListener("click", toggle);

    btnAll.addEventListener("click", () => {
      items.forEach((i) => selectedSet.add(i.value));
      updateSummary();
      renderList();
      onChange();
    });

    btnNone.addEventListener("click", () => {
      selectedSet.clear();
      updateSummary();
      renderList();
      onChange();
    });

    search.addEventListener("input", renderList);

    document.addEventListener("click", (e) => {
      if (!popover.classList.contains("is-open")) return;
      if (mount.contains(e.target)) return;
      close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && popover.classList.contains("is-open")) {
        close();
        button.focus();
      }
    });

    updateSummary();

    return {
      updateItems(newItems) {
        while (selectedSet.size && !newItems.some((i) => selectedSet.has(i.value))) {
          // keep selected, but if items changed drastically this could leave orphan values
          break;
        }
        // Note: we don't overwrite selectedSet here.
        items.length = 0;
        newItems.forEach((x) => items.push(x));
        updateSummary();
        renderList();
      },
      close,
    };
  }

  function getMappedValue(row, key) {
    return safeString(row[key]);
  }

  function buildDerivedLists() {
    // Nations
    const nationSet = new Set();
    const skaterItems = [];

    state.rawRows.forEach((row, idx) => {
      const helmet = getMappedValue(row, state.helmetKey);
      const name = getMappedValue(row, state.nameKey);
      const nation = getMappedValue(row, state.nationKey);

      if (nation) nationSet.add(nation);

      // rider selector uses helmet-id as value, label = "Name (ID) · NATION"
      const labelParts = [];
      if (name) labelParts.push(name);
      if (helmet) labelParts.push(`(${helmet})`);
      const label = labelParts.join(" ") + (nation ? ` · ${nation}` : "");
      if (helmet || name) {
        skaterItems.push({ value: helmet || String(idx), label });
      }
    });

    const nations = Array.from(nationSet)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const nationItems = nations.map((n) => ({ value: n, label: n }));

    return { nationItems, skaterItems };
  }

  function rowMatchesFilters(row, skaterIdx) {
    const helmet = getMappedValue(row, state.helmetKey);
    const name = getMappedValue(row, state.nameKey);
    const nation = getMappedValue(row, state.nationKey);

    // Global search
    const q = safeString(state.globalQuery).toLowerCase();
    if (q) {
      const hay = `${helmet} ${name} ${nation}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    // Nation multi-select
    if (state.selectedNations.size > 0 && !state.selectedNations.has(nation)) return false;

    // Skater multi-select (by helmet-id)
    if (state.selectedSkaters.size > 0) {
      const key = helmet || String(skaterIdx);
      if (!state.selectedSkaters.has(key)) return false;
    }

    return true;
  }

  function renderTable() {
    const tbody = $("skaterTableBody");
    tbody.innerHTML = "";

    let shown = 0;

    state.rawRows.forEach((row, idx) => {
      if (!rowMatchesFilters(row, idx)) return;

      const tr = document.createElement("tr");

      const tdHelmet = document.createElement("td");
      tdHelmet.className = "col-helmet";
      tdHelmet.textContent = getMappedValue(row, state.helmetKey);

      const tdName = document.createElement("td");
      tdName.textContent = getMappedValue(row, state.nameKey);

      const tdNation = document.createElement("td");
      tdNation.className = "col-nation";
      tdNation.textContent = getMappedValue(row, state.nationKey);

      tr.appendChild(tdHelmet);
      tr.appendChild(tdName);
      tr.appendChild(tdNation);

      tbody.appendChild(tr);
      shown++;
    });

    const meta = $("resultMeta");
    meta.innerHTML = `Resultaat: <strong>${shown}</strong> van <strong>${state.rawRows.length}</strong> rijders.`;
  }

  function init() {
    const data = readStoredData();
    const noData = $("noDataNotice");
    const card = $("dataCard");

    if (!data || !data.sheets || !data.sheets["Men"]) {
      noData.hidden = false;
      card.hidden = true;
      return;
    }

    noData.hidden = true;
    card.hidden = false;

    const sheet = data.sheets["Men"];
    state.headers = Array.isArray(sheet.headers) ? sheet.headers : [];
    state.rawRows = Array.isArray(sheet.rows) ? sheet.rows : [];

    // Default mapping (auto detect)
    const storedMap = readStoredMapping();
    if (storedMap && storedMap.helmetKey && storedMap.nameKey && storedMap.nationKey) {
      state.helmetKey = storedMap.helmetKey;
      state.nameKey = storedMap.nameKey;
      state.nationKey = storedMap.nationKey;
    } else {
      const headers = state.headers.length ? state.headers : Object.keys(state.rawRows[0] || {});
      state.helmetKey =
        detectColumn(headers, ["helm", "helmet", "bib", "id"]) || headers[0] || null;
      state.nameKey =
        detectColumn(headers, ["naam", "name", "skater"]) || headers[1] || null;
      state.nationKey =
        detectColumn(headers, ["land", "nation", "country", "noc"]) || headers[2] || null;

      storeMapping({
        helmetKey: state.helmetKey,
        nameKey: state.nameKey,
        nationKey: state.nationKey,
      });
    }

    const headerSource = state.headers.length ? state.headers : Object.keys(state.rawRows[0] || {});

    // Build mapping selects
    const mapHelmet = $("mapHelmet");
    const mapName = $("mapName");
    const mapNation = $("mapNation");

    buildSelect(mapHelmet, "Helm ID", headerSource, state.helmetKey);
    buildSelect(mapName, "Naam", headerSource, state.nameKey);
    buildSelect(mapNation, "Land", headerSource, state.nationKey);

    function onMappingChange() {
      const newHelmet = mapHelmet.value || state.helmetKey;
      const newName = mapName.value || state.nameKey;
      const newNation = mapNation.value || state.nationKey;

      state.helmetKey = newHelmet;
      state.nameKey = newName;
      state.nationKey = newNation;

      storeMapping({
        helmetKey: state.helmetKey,
        nameKey: state.nameKey,
        nationKey: state.nationKey,
      });

      // Reset selections (because values could change)
      state.selectedNations.clear();
      state.selectedSkaters.clear();
      state.globalQuery = $("globalSearch").value || "";

      // Rebuild filter items
      const lists = buildDerivedLists();
      countryMS.updateItems(lists.nationItems);
      skaterMS.updateItems(lists.skaterItems);

      renderTable();
    }

    mapHelmet.addEventListener("change", onMappingChange);
    mapName.addEventListener("change", onMappingChange);
    mapNation.addEventListener("change", onMappingChange);

    // Build filters
    const lists = buildDerivedLists();

    const countryMount = $("countryFilter");
    const skaterMount = $("skaterFilter");

    const countryItems = lists.nationItems;
    const skaterItems = lists.skaterItems;

    const countryMS = createMultiSelect({
      mount: countryMount,
      title: "Land",
      placeholder: "Alle landen",
      items: countryItems.slice(),
      selectedSet: state.selectedNations,
      onChange: renderTable,
    });

    const skaterMS = createMultiSelect({
      mount: skaterMount,
      title: "Rijder",
      placeholder: "Alle rijders",
      items: skaterItems.slice(),
      selectedSet: state.selectedSkaters,
      onChange: renderTable,
    });

    // Search
    const search = $("globalSearch");
    search.addEventListener("input", () => {
      state.globalQuery = search.value || "";
      renderTable();
    });

    renderTable();
  }

  document.addEventListener("DOMContentLoaded", init);
})();

(function () {
  const DATA_KEY = "shorttrack_hub_excel_data_v1";
  const STORAGE_KEY = "shorttrack_h2h_state_v2";
  const HEATS = 5;
  const SLOTS = 7;

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

  function loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function savePersisted(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Opslaan mislukt:", e);
    }
  }

  function normalize(v) {
    return String(v ?? "").trim().toLowerCase();
  }

  function stripNonWord(s) {
    return normalize(s).replace(/[^a-z0-9]+/g, " ").trim();
  }

  function pointsToRankMaybe(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v ?? "").trim();
    return POINTS_TO_RANK[n] ? String(POINTS_TO_RANK[n]) : String(v ?? "").trim();
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

  function sheetNameForDistance(gender, dist, sheets) {
    const isMen = gender === "men";
    if (dist === "relay") {
      return pickExistingSheet(sheets, isMen ? ["Relay Men", "Relay MEN", "Relay"] : ["Relay Women", "Relay WOMEN", "Relay"]);
    }
    if (dist === "mixed") {
      return pickExistingSheet(sheets, ["Mixed Relay", "Mixed relay", "Mixed Relay ", "Mixed"]);
    }
    if (dist === "500") {
      return pickExistingSheet(sheets, isMen ? ["500 Men", "500 MEN", "500"] : ["500 Women", "500 WOMEN", "500"]);
    }
    if (dist === "1000") {
      return pickExistingSheet(sheets, isMen ? ["1000 Men", "1000 MEN", "1000"] : ["1000 Women", "1000 WOMEN", "1000"]);
    }
    if (dist === "1500") {
      return pickExistingSheet(sheets, isMen ? ["1500 Men", "1500 MEN", "1500"] : ["1500 Women", "1500 WOMEN", "1500"]);
    }
    return null;
  }

  function sheetNameForOverall(gender, sheets) {
    const isMen = gender === "men";
    return pickExistingSheet(sheets, isMen ? ["Overall Men", "Overall MEN", "Overall"] : ["Overall Women", "Overall WOMEN", "Overall"]);
  }

  function looksLikeRelayHeader(row) {
    if (!row) return false;
    const a = stripNonWord(row[0]);
    const b = stripNonWord(row[1]);
    const c = stripNonWord(row[2]);
    const h = stripNonWord(row[7]);
    const i = stripNonWord(row[8]);
    return a.includes("rank") && b.includes("name") && (c.includes("land") || c.includes("country") || c.includes("nation"))
      && h.includes("total") && i.includes("time");
  }

  function looksLikeNormalHeader(row) {
    if (!row) return false;
    const a = stripNonWord(row[0]);
    const d = stripNonWord(row[3]);
    const e = stripNonWord(row[4]);
    const j = stripNonWord(row[9]);
    return a.includes("rank") && (d.includes("name") || d.includes("naam") || e.includes("land") || j.includes("total"));
  }

  function buildHeaderIndexMap(headerRow) {
    const map = new Map();
    (headerRow || []).forEach((cell, idx) => {
      const key = stripNonWord(cell);
      if (!key) return;
      if (!map.has(key)) map.set(key, idx);
    });
    return map;
  }

  function getIdx(map, candidates, fallback) {
    for (const c of candidates) {
      const hit = map.get(stripNonWord(c));
      if (typeof hit === "number") return hit;
    }
    return fallback;
  }

  function getCell(row, idx) {
    if (!row) return "";
    return idx >= 0 && idx < row.length ? row[idx] : "";
  }

  function parseDistanceRows(sheetRows, mode) {
    const rows = Array.isArray(sheetRows) ? sheetRows : [];
    if (!rows.length) return [];

    const isRelay = mode === "relay";
    const hasHeader = isRelay ? looksLikeRelayHeader(rows[0]) : looksLikeNormalHeader(rows[0]);
    const headerMap = hasHeader ? buildHeaderIndexMap(rows[0]) : new Map();
    const startIdx = hasHeader ? 1 : 0;

    const relayIdx = {
      rank: getIdx(headerMap, ["rank", "RANK"], 0),
      name: getIdx(headerMap, ["name", "NAME"], 1),
      land: getIdx(headerMap, ["land", "LAND", "country"], 2),
      can1: getIdx(headerMap, ["can 1", "can1", "CAN 1", "CAN1"], 3),
      can2: getIdx(headerMap, ["can 2", "can2", "CAN 2", "CAN2"], 4),
      pol:  getIdx(headerMap, ["pol", "POL"], 5),
      time: getIdx(headerMap, ["time", "TIME"], 8),
    };

    const out = [];
    for (let i = startIdx; i < rows.length; i++) {
      const r = rows[i] || [];
      if (isRelay) {
        const rank = String(getCell(r, relayIdx.rank) ?? "").trim();
        const name = String(getCell(r, relayIdx.name) ?? "").trim();
        const land = String(getCell(r, relayIdx.land) ?? "").trim();
        const can1 = pointsToRankMaybe(getCell(r, relayIdx.can1));
        const can2 = pointsToRankMaybe(getCell(r, relayIdx.can2));
        const pol  = pointsToRankMaybe(getCell(r, relayIdx.pol));
        const time = String(getCell(r, relayIdx.time) ?? "").trim();
        if (!rank && !name && !land && !time) continue;
        out.push({ rank, name, land, can1, can2, pol, time });
      } else {
        const rank = String(r[0] ?? "").trim();
        const name = String(r[3] ?? "").trim();
        const land = String(r[4] ?? "").trim();
        const can1 = pointsToRankMaybe(r[5]);
        const can2 = pointsToRankMaybe(r[6]);
        const pol  = pointsToRankMaybe(r[7]);
        const time = String(r[10] ?? "").trim();
        if (!rank && !name && !land && !time) continue;
        out.push({ rank, name, land, can1, can2, pol, time });
      }
    }
    return out;
  }

  function parseOverallMap(sheetRows) {
    const rows = Array.isArray(sheetRows) ? sheetRows : [];
    if (!rows.length) return { byName: new Map(), byLand: new Map() };

    const hasHeader = looksLikeNormalHeader(rows[0]);
    const startIdx = hasHeader ? 1 : 0;

    const byName = new Map();
    const byLand = new Map();
    for (let i = startIdx; i < rows.length; i++) {
      const r = rows[i] || [];
      const rank = String(r[0] ?? "").trim();
      const name = String(r[3] ?? "").trim();
      const land = String(r[4] ?? "").trim();
      if (name) byName.set(normalize(name), rank);
      if (land) byLand.set(normalize(land), rank);
    }
    return { byName, byLand };
  }

  function emptyHeats() {
    return Array.from({ length: HEATS }, () => Array.from({ length: SLOTS }, () => null));
  }

  document.addEventListener("DOMContentLoaded", () => {
    const excel = loadExcelData();
    const statusEl = document.getElementById("h2hStatus");
    const saveBtn = document.getElementById("h2hSave");
    const clearHeatBtn = document.getElementById("h2hClearHeat");
    const saveStateEl = document.getElementById("h2hSaveState");
    const footerEl = document.getElementById("h2hFooter");
    const suggestEl = document.getElementById("h2hSuggest");

    if (!excel?.sheets) {
      statusEl.textContent = "Geen Excel-data gevonden. Upload eerst je Excel op het hoofdmenu.";
      return;
    }

    const genderBtns = Array.from(document.querySelectorAll(".h2h-gender"));
    const distBtns = Array.from(document.querySelectorAll(".h2h-tab"));
    const heatSelEl = document.getElementById("h2hHeatSelector");
    const heatsEl = document.getElementById("h2hHeats");
    const bodyEl = document.getElementById("h2hBody");

    const persisted = loadPersisted();

    const state = {
      gender: persisted?.gender || "men",
      dist: persisted?.dist || "500",
      activeHeat: Number.isFinite(persisted?.activeHeat) ? persisted.activeHeat : 0,
      heats: Array.isArray(persisted?.heats) ? persisted.heats : emptyHeats(),
      options: [],
      rows: [],
      overallMap: { byName: new Map(), byLand: new Map() },
      sheetName: null,
      overallSheetName: null,
      activeInput: null,
      dirty: false,
    };

    function markSaved(msg) {
      saveStateEl.textContent = msg;
      saveStateEl.style.opacity = "1";
      clearTimeout(markSaved._t);
      markSaved._t = setTimeout(() => {
        saveStateEl.style.opacity = "0.85";
      }, 1200);
    }

    function saveNow() {
      savePersisted({
        gender: state.gender,
        dist: state.dist,
        activeHeat: state.activeHeat,
        heats: state.heats,
        savedAt: Date.now(),
      });
      state.dirty = false;
      markSaved("Opgeslagen ✓");
    }

    function markDirty() {
      state.dirty = true;
      saveStateEl.textContent = "Wijzigingen…";
      saveStateEl.style.opacity = "1";
      clearTimeout(markDirty._t);
      markDirty._t = setTimeout(() => {
        saveNow();
      }, 350);
    }

    function setGender(next) {
      state.gender = next;
      genderBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.gender === next));
      rebuildData();
      markDirty();
    }

    function setDist(next) {
      state.dist = next;
      distBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.dist === next));
      rebuildData();
      markDirty();
    }

    function setActiveHeat(idx) {
      state.activeHeat = idx;
      renderHeatSelector();
      renderTable();
      markDirty();
    }

    function clearActiveHeat() {
      state.heats[state.activeHeat] = Array.from({ length: SLOTS }, () => null);
      markDirty();
      renderHeats();
      renderTable();
      closeSuggestions();
    }

    function isRelayMode() {
      return state.dist === "relay" || state.dist === "mixed";
    }

    function rebuildData() {
      const sheets = excel.sheets;

      const distSheet = sheetNameForDistance(state.gender, state.dist, sheets);
      state.sheetName = distSheet;

      state.rows = distSheet && sheets[distSheet]
        ? parseDistanceRows(sheets[distSheet].rows, isRelayMode() ? "relay" : "normal")
        : [];

      const seen = new Set();
      state.options = [];
      for (const r of state.rows) {
        const name = String(r.name || "").trim();
        const land = String(r.land || "").trim();
        if (!name) continue;
        const key = normalize(name) + "|" + normalize(land);
        if (seen.has(key)) continue;
        seen.add(key);
        state.options.push({ name, land });
      }
      state.options.sort((a, b) => String(a.name).localeCompare(String(b.name)));

      const overallGender = state.dist === "mixed" ? "men" : state.gender;
      const overallSheet = sheetNameForOverall(overallGender, sheets);
      state.overallSheetName = overallSheet;
      state.overallMap = overallSheet && sheets[overallSheet] ? parseOverallMap(sheets[overallSheet].rows) : { byName: new Map(), byLand: new Map() };

      renderStatus();
      renderHeats();
      renderTable();
      closeSuggestions();
    }

    function renderStatus() {
      const g = state.gender === "men" ? "Men" : "Women";
      const dLabel =
        state.dist === "500" ? "500m" :
        state.dist === "1000" ? "1000m" :
        state.dist === "1500" ? "1500m" :
        state.dist === "relay" ? "Relay" : "Mixed Relay";

      const distInfo = state.sheetName ? `Bron: ${state.sheetName}` : "Bron: (niet gevonden)";
      const overallInfo = state.overallSheetName ? `Overall: ${state.overallSheetName}` : "Overall: (niet gevonden)";
      const mixedHint = state.dist === "mixed" ? " · Mixed: schuif Men/Women heeft geen effect" : "";

      statusEl.textContent = `${dLabel} · ${g}${mixedHint} · ${distInfo} · ${overallInfo} · Opties: ${state.options.length}`;
      footerEl.textContent = `Vergelijking: ${state.dist === "mixed" ? "Mixed Relay" : `${g} · ${dLabel}`} · Rit ${state.activeHeat + 1}`;
    }

    function renderHeatSelector() {
      heatSelEl.innerHTML = "";
      for (let i = 0; i < HEATS; i++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "h2h-heatbtn" + (i === state.activeHeat ? " is-active" : "");
        b.textContent = String(i + 1);
        b.addEventListener("click", () => setActiveHeat(i));
        heatSelEl.appendChild(b);
      }
    }

    function slotValue(heatIdx, slotIdx) {
      const v = state.heats?.[heatIdx]?.[slotIdx];
      if (!v) return "";
      if (typeof v === "string") return v;
      return String(v.name || "");
    }

    function setSlot(heatIdx, slotIdx, objOrNull) {
      if (!state.heats[heatIdx]) state.heats[heatIdx] = Array.from({ length: SLOTS }, () => null);
      state.heats[heatIdx][slotIdx] = objOrNull;
      markDirty();
      renderHeats();
      renderTable();
    }

    function clearSlot(heatIdx, slotIdx) {
      setSlot(heatIdx, slotIdx, null);
      closeSuggestions();
    }

    function renderHeats() {
      renderHeatSelector();

      heatsEl.innerHTML = "";
      for (let h = 0; h < HEATS; h++) {
        const card = document.createElement("div");
        card.className = "h2h-heat";

        const head = document.createElement("div");
        head.className = "h2h-heathead";

        const title = document.createElement("div");
        title.className = "h2h-heattitle";
        title.textContent = `Rit ${h + 1}`;

        const filled = (state.heats[h] || []).filter(Boolean).length;
        const meta = document.createElement("div");
        meta.className = "h2h-heatmeta";
        meta.textContent = `${filled}/${SLOTS}`;

        head.appendChild(title);
        head.appendChild(meta);

        const slots = document.createElement("div");
        slots.className = "h2h-slots";

        for (let s = 0; s < SLOTS; s++) {
          const wrap = document.createElement("div");
          wrap.className = "h2h-slot";
          wrap.dataset.heat = String(h);
          wrap.dataset.slot = String(s);

          const input = document.createElement("input");
          input.type = "search";
          input.placeholder = "Type om te zoeken…";
          input.autocomplete = "off";
          input.value = slotValue(h, s);

          const clear = document.createElement("button");
          clear.type = "button";
          clear.className = "h2h-clear";
          clear.textContent = "×";
          clear.title = "Wissen";
          clear.style.visibility = (slotValue(h, s) ? "visible" : "hidden");

          clear.addEventListener("click", (e) => {
            e.stopPropagation();
            clearSlot(h, s);
          });

          input.addEventListener("focus", () => {
            setActiveInput(h, s, input, wrap);
            showSuggestionsForActiveInput();
          });

          input.addEventListener("input", () => {
            setActiveInput(h, s, input, wrap);
            showSuggestionsForActiveInput();
          });

          input.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
              closeSuggestions();
              input.blur();
            }
            if (e.key === "Enter") {
              e.preventDefault();
              const first = suggestEl.querySelector(".h2h-suggest-item:not(.is-disabled)");
              if (first) first.click();
            }
          });

          wrap.appendChild(input);
          wrap.appendChild(clear);

          if (h === state.activeHeat) {
            wrap.style.borderColor = "rgba(82,232,232,.25)";
          } else {
            wrap.style.borderColor = "rgba(255,255,255,.14)";
          }

          slots.appendChild(wrap);
        }

        card.appendChild(head);
        card.appendChild(slots);
        heatsEl.appendChild(card);
      }
    }

    function setActiveInput(heatIndex, slotIndex, inputEl, wrapEl) {
      document.querySelectorAll(".h2h-slot.is-active").forEach((el) => el.classList.remove("is-active"));
      wrapEl.classList.add("is-active");
      state.activeInput = { heatIndex, slotIndex, inputEl, wrapEl };
    }

    function selectedKeysForHeat(heatIdx) {
      const set = new Set();
      for (const v of (state.heats[heatIdx] || [])) {
        if (!v) continue;
        const name = typeof v === "string" ? v : (v.name || "");
        const land = typeof v === "string" ? "" : (v.land || "");
        set.add(normalize(name) + "|" + normalize(land));
      }
      return set;
    }

    function positionSuggestPanel() {
      if (!state.activeInput) return;
      const { inputEl } = state.activeInput;
      const rect = inputEl.getBoundingClientRect();
      const hostRect = document.querySelector(".h2h-layout")?.getBoundingClientRect() || { left: 0, top: 0 };

      const left = rect.left - hostRect.left;
      const top = rect.bottom - hostRect.top + 6;

      suggestEl.style.left = `${Math.max(0, left)}px`;
      suggestEl.style.top = `${Math.max(0, top)}px`;
      suggestEl.style.width = `${Math.max(260, rect.width)}px`;
    }

    function closeSuggestions() {
      suggestEl.classList.remove("is-open");
      suggestEl.innerHTML = "";
    }

    function showSuggestionsForActiveInput() {
      if (!state.activeInput) return;
      const { heatIndex, slotIndex, inputEl } = state.activeInput;
      const q = normalize(inputEl.value || "");
      suggestEl.innerHTML = "";

      if (!q) {
        closeSuggestions();
        return;
      }

      positionSuggestPanel();

      const used = selectedKeysForHeat(heatIndex);
      const cur = state.heats?.[heatIndex]?.[slotIndex];
      if (cur) {
        const curKey = normalize(cur.name || "") + "|" + normalize(cur.land || "");
        used.delete(curKey);
      }

      const hits = state.options
        .filter((o) => normalize(o.name).includes(q) || normalize(o.land).includes(q))
        .slice(0, 40);

      if (!hits.length) {
        const div = document.createElement("div");
        div.className = "h2h-suggest-item is-disabled";
        div.textContent = "Geen resultaten";
        suggestEl.appendChild(div);
        suggestEl.classList.add("is-open");
        return;
      }

      hits.forEach((o) => {
        const key = normalize(o.name) + "|" + normalize(o.land);
        const disabled = used.has(key);

        const item = document.createElement("div");
        item.className = "h2h-suggest-item" + (disabled ? " is-disabled" : "");

        const main = document.createElement("div");
        main.className = "h2h-suggest-main";
        main.textContent = o.name;

        const sub = document.createElement("div");
        sub.className = "h2h-suggest-sub";
        sub.textContent = o.land || "";

        item.appendChild(main);
        item.appendChild(sub);

        if (!disabled) {
          item.addEventListener("click", () => {
            setSlot(heatIndex, slotIndex, { name: o.name, land: o.land });
            closeSuggestions();
          });
        }

        suggestEl.appendChild(item);
      });

      suggestEl.classList.add("is-open");
    }

    function findDistanceRowByName(name, land) {
      const nameKey = normalize(name);
      const landKey = normalize(land);

      return (
        state.rows.find((r) => normalize(r.name) === nameKey) ||
        (land ? state.rows.find((r) => normalize(r.land) === landKey && normalize(r.name).includes(nameKey)) : null) ||
        null
      );
    }

    function buildCompareRow(sel) {
      const name = sel?.name || "-";
      const land = sel?.land || "-";

      const row = findDistanceRowByName(name, land);

      const outLand = (row?.land || land || "-").trim() || "-";
      const can1 = row?.can1 ? String(row.can1).trim() : "-";
      const can2 = row?.can2 ? String(row.can2).trim() : "-";
      const pol  = row?.pol  ? String(row.pol).trim() : "-";
      const wt   = row?.rank ? String(row.rank).trim() : "-";
      const time = row?.time ? String(row.time).trim() : "-";

      const nameKey = normalize(name);
      const landKey = normalize(outLand);
      let overall = "-";
      if (state.overallMap.byName.has(nameKey)) overall = state.overallMap.byName.get(nameKey) || "-";
      else if (state.overallMap.byLand.has(landKey)) overall = state.overallMap.byLand.get(landKey) || "-";

      return { name, land: outLand, can1, can2, pol, overall, wt, time };
    }

    function renderTable() {
      bodyEl.innerHTML = "";
      const selections = (state.heats[state.activeHeat] || []).filter(Boolean);

      if (!selections.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 8;
        td.style.color = "rgba(255,255,255,.72)";
        td.style.padding = "14px 12px";
        td.textContent = "Selecteer rijders/teams in Rit " + (state.activeHeat + 1) + " om te vergelijken.";
        tr.appendChild(td);
        bodyEl.appendChild(tr);
        return;
      }

      selections.map(buildCompareRow).forEach((r) => {
        const tr = document.createElement("tr");
        const td = (v) => {
          const el = document.createElement("td");
          el.textContent = v;
          return el;
        };
        tr.appendChild(td(r.name));
        tr.appendChild(td(r.land));
        tr.appendChild(td(r.can1));
        tr.appendChild(td(r.can2));
        tr.appendChild(td(r.pol));
        tr.appendChild(td(r.overall));
        tr.appendChild(td(r.wt));
        tr.appendChild(td(r.time));
        bodyEl.appendChild(tr);
      });
    }

    genderBtns.forEach((btn) => btn.addEventListener("click", () => setGender(btn.dataset.gender)));
    distBtns.forEach((btn) => btn.addEventListener("click", () => setDist(btn.dataset.dist)));
    clearHeatBtn.addEventListener("click", clearActiveHeat);

    window.addEventListener("scroll", () => {
      if (suggestEl.classList.contains("is-open")) positionSuggestPanel();
    }, { passive: true });

    window.addEventListener("resize", () => {
      if (suggestEl.classList.contains("is-open")) positionSuggestPanel();
    });

    document.addEventListener("click", (e) => {
      const inSuggest = suggestEl.contains(e.target);
      const inSlot = e.target.closest && e.target.closest(".h2h-slot");
      if (!inSuggest && !inSlot) closeSuggestions();
    });

    saveBtn.addEventListener("click", () => {
      saveNow();
    });

    genderBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.gender === state.gender));
    distBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.dist === state.dist));

    if (!Array.isArray(state.heats) || state.heats.length !== HEATS) state.heats = emptyHeats();
    for (let h = 0; h < HEATS; h++) {
      if (!Array.isArray(state.heats[h]) || state.heats[h].length !== SLOTS) {
        state.heats[h] = Array.from({ length: SLOTS }, () => null);
      }
      state.heats[h] = state.heats[h].map((v) => {
        if (!v) return null;
        if (typeof v === "string") return { name: v, land: "" };
        return { name: String(v.name || ""), land: String(v.land || "") };
      });
    }
    state.activeHeat = Math.max(0, Math.min(HEATS - 1, Number(state.activeHeat) || 0));

    renderHeatSelector();
    rebuildData();
    saveNow();
  });
})();

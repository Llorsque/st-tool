/**
 * Head-to-Head OS/WK columns (v3) — WOMEN FIX
 *
 * Why v3:
 * - In praktijk werd bij Women vaak niets gevonden omdat:
 *   1) Champions-data soms per ongeluk onder "men" werd opgeslagen, of
 *   2) Naamvelden bevatten soms extra ", CAN" / " CAN" in de naam.
 *
 * Fixes:
 * - Gender-agnostic lookup: voor 500/1000/1500/relay zoeken we in BOTH men + women buckets.
 * - Robuuste naam-normalisatie: verwijdert ook komma's en strip trailing landcodes
 *   op basis van landcodes uit (a) de huidige Head-to-Head tabel en (b) champions land velden.
 *
 * Result:
 * - OS & WK kolommen altijd direct na WT.
 * - Vulling volgens: 1 (25) / 2 (22) etc, meerdere regels indien meerdere medailles.
 */
(function () {
  const WORLD_KEY = "shorttrack_champions_world_v1";
  const OLYMPIC_KEY = "shorttrack_champions_olympic_v1";

  function safeJsonParse(raw, fallback) { try { return JSON.parse(raw); } catch { return fallback; } }

  function stripDiacritics(s) {
    try { return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
    catch { return String(s ?? ""); }
  }

  function cleanText(s) {
    return stripDiacritics(String(s ?? ""))
      .trim()
      .toUpperCase()
      .replace(/[’'"().,]/g, "")   // remove punctuation incl comma
      .replace(/-/g, " ")
      .replace(/\s+/g, " ");
  }

  function yyFromYear(y) {
    const s = String(y ?? "").trim();
    if (!s) return "";
    const m = s.match(/\d{2,4}/);
    if (!m) return "";
    return m[0].slice(-2);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function getActiveDistanceKey() {
    const active =
      document.querySelector(".h2h-tabs button.is-active, .h2h-tabs button.active, .h2h-tabs button[aria-pressed='true']")
      || document.querySelector("[data-dist].is-active, [data-dist].active, [data-dist][aria-pressed='true']")
      || Array.from(document.querySelectorAll("button.is-active, button.active, button[aria-pressed='true']"))
        .find(b => /(500|1000|1500|relay|mixed)/i.test(b.textContent || ""));

    const label = ((active ? active.textContent : document.querySelector(".h2h-status")?.textContent) || "").toLowerCase();
    if (label.includes("500")) return "500";
    if (label.includes("1000")) return "1000";
    if (label.includes("1500")) return "1500";
    if (label.includes("mixed")) return "mixed";
    if (label.includes("relay")) return "relay";
    return "500";
  }

  function loadState(storageKey) {
    return safeJsonParse(localStorage.getItem(storageKey), null);
  }

  function getBuckets(st, distKey) {
    // Return an array of rows merged across genders when applicable
    if (!st) return [];
    if (distKey === "mixed") return Array.isArray(st?.mixed?.mixed) ? st.mixed.mixed : [];
    const men = Array.isArray(st?.men?.[distKey]) ? st.men[distKey] : [];
    const women = Array.isArray(st?.women?.[distKey]) ? st.women[distKey] : [];
    // merge (dedupe not required)
    return [...men, ...women];
  }

  function findH2HTable() {
    const tables = Array.from(document.querySelectorAll("table"));
    for (const t of tables) {
      const headerRow = t.querySelector("thead tr") || t.querySelector("tr");
      if (!headerRow) continue;
      const labels = Array.from(headerRow.children).map(c => (c.textContent || "").trim().toUpperCase());
      if (labels.includes("WT") && labels.includes("TIME")) return { table: t, headerRow };
    }
    return null;
  }

  function getLandCodesFromTable(table, headerRow) {
    const labels = Array.from(headerRow.children).map(c => (c.textContent||"").trim().toUpperCase());
    const landIdx = labels.indexOf("LAND");
    if (landIdx === -1) return new Set();

    const rows = table.querySelectorAll("tbody tr").length
      ? Array.from(table.querySelectorAll("tbody tr"))
      : Array.from(table.querySelectorAll("tr")).slice(1);

    const set = new Set();
    for (const tr of rows) {
      const tds = Array.from(tr.children);
      const v = String(tds[landIdx]?.textContent || "").trim().toUpperCase();
      if (v && /^[A-Z]{3}$/.test(v)) set.add(v);
    }
    return set;
  }

  function tokenKey(name, landSet) {
    let clean = cleanText(name);
    if (!clean) return "";

    // If user typed "NAME CAN" or "NAME, CAN" into the name field, drop trailing land code if recognized
    let toks = clean.split(" ").filter(Boolean);
    if (toks.length >= 2) {
      const last = toks[toks.length - 1];
      if (landSet && landSet.has(last)) toks = toks.slice(0, -1);
    }

    // also handle accidental double last tokens like "CAN CAN"
    while (toks.length >= 2 && landSet && landSet.has(toks[toks.length - 1])) {
      toks.pop();
    }

    toks.sort();
    return toks.join(" ");
  }

  function buildLandSetFromChampions(rows) {
    const s = new Set();
    for (const r of rows || []) {
      for (const slot of ["gold", "silver", "bronze"]) {
        const land = String(r?.[slot]?.land ?? "").trim().toUpperCase();
        if (land && /^[A-Z]{3}$/.test(land)) s.add(land);
      }
    }
    return s;
  }

  function buildMedalMap(rows, landSet) {
    const map = new Map(); // key -> [{rank, yy, yearNum}]
    for (const r of rows || []) {
      const yy = yyFromYear(r?.year);
      const yearNum = parseInt(String(r?.year ?? "").replace(/\D/g, ""), 10);
      const medals = [
        { slot: "gold", rank: 1 },
        { slot: "silver", rank: 2 },
        { slot: "bronze", rank: 3 },
      ];
      for (const m of medals) {
        const nm = r?.[m.slot]?.name;
        const key = tokenKey(nm, landSet);
        if (!key) continue;
        const arr = map.get(key) || [];
        arr.push({ rank: m.rank, yy, yearNum: Number.isNaN(yearNum) ? -1 : yearNum });
        map.set(key, arr);
      }
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => (b.yearNum - a.yearNum) || (a.rank - b.rank));
    }
    return map;
  }

  function ensureOSWKHeaders(headerRow) {
    const cells = Array.from(headerRow.children);
    const labels = cells.map(c => (c.textContent || "").trim().toUpperCase());
    if (labels.includes("OS") && labels.includes("WK")) return;

    const wtIndex = labels.indexOf("WT");
    if (wtIndex === -1) return;

    const tag = (cells[0]?.tagName || "TH").toLowerCase();
    const mk = (txt) => {
      const el = document.createElement(tag);
      el.textContent = txt;
      el.classList.add("h2h-col-" + txt.toLowerCase());
      return el;
    };

    headerRow.insertBefore(mk("OS"), headerRow.children[wtIndex + 1] || null);
    headerRow.insertBefore(mk("WK"), headerRow.children[wtIndex + 2] || null);
  }

  function ensureOSWKBody(table, headerRow) {
    const labels = Array.from(headerRow.children).map(c => (c.textContent || "").trim().toUpperCase());
    const wtIndex = labels.indexOf("WT");
    const osIndex = labels.indexOf("OS");
    const wkIndex = labels.indexOf("WK");
    if (wtIndex === -1 || osIndex === -1 || wkIndex === -1) return;

    const rows = table.querySelectorAll("tbody tr").length
      ? Array.from(table.querySelectorAll("tbody tr"))
      : Array.from(table.querySelectorAll("tr")).slice(1);

    for (const tr of rows) {
      const tds = Array.from(tr.children);
      if (!tds.length) continue;

      if (tds[osIndex] && tds[wkIndex]) continue;

      const cellTag = (tds[0]?.tagName || "TD").toLowerCase();
      const tdOS = document.createElement(cellTag);
      tdOS.className = "h2h-col-os";
      tdOS.textContent = "-";

      const tdWK = document.createElement(cellTag);
      tdWK.className = "h2h-col-wk";
      tdWK.textContent = "-";

      tr.insertBefore(tdOS, tr.children[wtIndex + 1] || null);
      tr.insertBefore(tdWK, tr.children[wtIndex + 2] || null);
    }
  }

  function fillOSWK(table, headerRow) {
    const labels = Array.from(headerRow.children).map(c => (c.textContent || "").trim().toUpperCase());
    const osIndex = labels.indexOf("OS");
    const wkIndex = labels.indexOf("WK");
    if (osIndex === -1 || wkIndex === -1) return;

    const distKey = getActiveDistanceKey();

    const worldState = loadState(WORLD_KEY);
    const olympicState = loadState(OLYMPIC_KEY);

    const worldRows = getBuckets(worldState, distKey);
    const olympicRows = getBuckets(olympicState, distKey);

    const landFromChampions = new Set([...buildLandSetFromChampions(worldRows), ...buildLandSetFromChampions(olympicRows)]);
    const landFromTable = getLandCodesFromTable(table, headerRow);
    const landSet = new Set([...landFromChampions, ...landFromTable]);

    const wkMap = buildMedalMap(worldRows, landSet);
    const osMap = buildMedalMap(olympicRows, landSet);

    const rows = table.querySelectorAll("tbody tr").length
      ? Array.from(table.querySelectorAll("tbody tr"))
      : Array.from(table.querySelectorAll("tr")).slice(1);

    for (const tr of rows) {
      const tds = Array.from(tr.children);
      if (!tds.length) continue;

      const name = (tds[0]?.textContent || "").trim();
      const key = tokenKey(name, landSet);

      const osList = key ? (osMap.get(key) || null) : null;
      const wkList = key ? (wkMap.get(key) || null) : null;

      const osLines = osList ? osList.map(x => x.yy ? `${x.rank} (${x.yy})` : `${x.rank}`) : [];
      const wkLines = wkList ? wkList.map(x => x.yy ? `${x.rank} (${x.yy})` : `${x.rank}`) : [];

      if (tds[osIndex]) tds[osIndex].innerHTML = osLines.length ? osLines.map(escapeHtml).join("<br>") : "-";
      if (tds[wkIndex]) tds[wkIndex].innerHTML = wkLines.length ? wkLines.map(escapeHtml).join("<br>") : "-";
    }
  }

  function runOnce() {
    const found = findH2HTable();
    if (!found) return;
    const { table } = found;

    const headerRow = table.querySelector("thead tr") || table.querySelector("tr");
    if (!headerRow) return;

    ensureOSWKHeaders(headerRow);
    const hdr = table.querySelector("thead tr") || table.querySelector("tr");
    ensureOSWKBody(table, hdr);
    fillOSWK(table, hdr);
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      runOnce();
    });
  }

  function boot() {
    schedule();
    setTimeout(schedule, 150);
    setTimeout(schedule, 600);
    setTimeout(schedule, 1500);

    const obs = new MutationObserver(() => schedule());
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });

    window.addEventListener("storage", (e) => {
      if (e.key === WORLD_KEY || e.key === OLYMPIC_KEY) schedule();
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
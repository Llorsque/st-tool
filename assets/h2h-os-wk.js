/**
 * Head-to-Head OS/WK columns (v2)
 * Fix: betere matching (ook als in champions per ongeluk '..., CAN' in de naam is getypt),
 * en robuuster gender/distance detectie.
 *
 * Inserts OS and WK immediately after WT.
 */
(function () {
  const WORLD_KEY = "shorttrack_champions_world_v1";
  const OLYMPIC_KEY = "shorttrack_champions_olympic_v1";

  function safeJsonParse(raw, fallback) { try { return JSON.parse(raw); } catch { return fallback; } }

  function stripDiacritics(s) {
    try { return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
    catch { return String(s ?? ""); }
  }

  function cleanName(s) {
    return stripDiacritics(String(s ?? ""))
      .trim()
      .toUpperCase()
      .replace(/[’'".()]/g, "")
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

  function getActiveGender() {
    // Supported patterns: .is-active, .active, aria-pressed=true
    const candidates = [
      ".h2h-toggle button.is-active",
      ".h2h-toggle button.active",
      ".h2h-toggle button[aria-pressed='true']",
      "button.h2h-gender.is-active",
      "button.h2h-gender.active",
      "button.h2h-gender[aria-pressed='true']",
      "[data-gender].is-active",
      "[data-gender].active",
      "[data-gender][aria-pressed='true']",
    ];
    for (const sel of candidates) {
      const b = document.querySelector(sel);
      if (b) {
        const t = (b.textContent || "").toLowerCase();
        if (t.includes("women") || t.includes("vrouwen")) return "women";
        if (t.includes("men") || t.includes("mannen")) return "men";
      }
    }
    // fallback: find any active-ish button
    const any = Array.from(document.querySelectorAll("button.is-active, button.active, button[aria-pressed='true']"))
      .find(b => /men|women|mannen|vrouwen/i.test(b.textContent || ""));
    if (any) {
      const t = (any.textContent || "").toLowerCase();
      if (t.includes("women") || t.includes("vrouwen")) return "women";
      if (t.includes("men") || t.includes("mannen")) return "men";
    }
    return "men";
  }

  function getActiveDistanceKey() {
    const any = document.querySelector(".h2h-tabs button.is-active, .h2h-tabs button.active, .h2h-tabs button[aria-pressed='true']")
      || document.querySelector("[data-distance].is-active, [data-distance].active, [data-distance][aria-pressed='true']")
      || Array.from(document.querySelectorAll("button.is-active, button.active, button[aria-pressed='true']"))
        .find(b => /(500|1000|1500|relay|mixed)/i.test(b.textContent || ""));

    const label = ((any ? any.textContent : document.querySelector(".h2h-status")?.textContent) || "").toLowerCase();

    if (label.includes("500")) return "500";
    if (label.includes("1000")) return "1000";
    if (label.includes("1500")) return "1500";
    if (label.includes("mixed")) return "mixed";
    if (label.includes("relay")) return "relay";
    return "500";
  }

  function loadBucket(storageKey, gender, distKey) {
    const st = safeJsonParse(localStorage.getItem(storageKey), null);
    if (!st) return [];
    if (distKey === "mixed") return Array.isArray(st?.mixed?.mixed) ? st.mixed.mixed : [];
    return Array.isArray(st?.[gender]?.[distKey]) ? st[gender][distKey] : [];
  }

  function buildLandSet(rows) {
    const s = new Set();
    for (const r of rows || []) {
      for (const slot of ["gold", "silver", "bronze"]) {
        const land = String(r?.[slot]?.land ?? "").trim().toUpperCase();
        if (land && /^[A-Z]{3}$/.test(land)) s.add(land);
      }
    }
    return s;
  }

  function tokenKey(name, landSet) {
    let clean = cleanName(name);
    if (!clean) return "";
    let toks = clean.split(" ").filter(Boolean);

    // Fix for common user input mistakes: name ends with country code (e.g., "STODDARD CORINNE CAN")
    if (toks.length >= 2) {
      const last = toks[toks.length - 1];
      if (landSet && landSet.has(last)) toks = toks.slice(0, -1);
    }

    toks.sort();
    return toks.join(" ");
  }

  function buildMedalMap(rows) {
    const landSet = buildLandSet(rows);
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
    return { map, landSet };
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

  function ensureOSWKHeaders(headerRow) {
    const cells = Array.from(headerRow.children);
    const labels = cells.map(c => (c.textContent || "").trim().toUpperCase());
    if (labels.includes("OS") && labels.includes("WK")) return;

    const wtIndex = labels.indexOf("WT");
    if (wtIndex === -1) return;

    const tag = (cells[0]?.tagName || "TH").toLowerCase();
    const makeCell = (txt) => {
      const el = document.createElement(tag);
      el.textContent = txt;
      el.classList.add("h2h-col-" + txt.toLowerCase());
      return el;
    };

    const os = makeCell("OS");
    const wk = makeCell("WK");
    headerRow.insertBefore(os, headerRow.children[wtIndex + 1] || null);
    headerRow.insertBefore(wk, headerRow.children[wtIndex + 2] || null);
  }

  function ensureOSWKBody(table, headerRow) {
    const headerLabels = Array.from(headerRow.children).map(c => (c.textContent || "").trim().toUpperCase());
    const wtIndex = headerLabels.indexOf("WT");
    const osIndex = headerLabels.indexOf("OS");
    const wkIndex = headerLabels.indexOf("WK");
    if (wtIndex === -1 || osIndex === -1 || wkIndex === -1) return;

    const bodyRows = table.querySelectorAll("tbody tr").length
      ? Array.from(table.querySelectorAll("tbody tr"))
      : Array.from(table.querySelectorAll("tr")).slice(1);

    for (const tr of bodyRows) {
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

    const gender = getActiveGender();
    const distKey = getActiveDistanceKey();

    const worldRows = loadBucket(WORLD_KEY, gender, distKey);
    const olympicRows = loadBucket(OLYMPIC_KEY, gender, distKey);

    const wk = buildMedalMap(worldRows);
    const os = buildMedalMap(olympicRows);

    // row-name matching should use same landSet cleanup as champions
    const nameLandSet = new Set([...wk.landSet, ...os.landSet]);

    const bodyRows = table.querySelectorAll("tbody tr").length
      ? Array.from(table.querySelectorAll("tbody tr"))
      : Array.from(table.querySelectorAll("tr")).slice(1);

    for (const tr of bodyRows) {
      const tds = Array.from(tr.children);
      if (!tds.length) continue;

      const name = (tds[0]?.textContent || "").trim();
      const key = tokenKey(name, nameLandSet);

      const osList = key ? (os.map.get(key) || null) : null;
      const wkList = key ? (wk.map.get(key) || null) : null;

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

    // headerRow may have changed
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
/**
 * Head-to-Head OS/WK columns (v8) — Fix missing Men 1500 WK (flexible champions data shape)
 *
 * Root cause we address:
 * - The World/Olympic Champions "Bewerk" module may store rows in different shapes over time
 *   (nested objects or flat fields). Earlier scripts only supported one shape, causing empty WK/OS.
 *
 * Fix:
 * - Robust medal extractor that supports:
 *    A) row.gold.name / row.gold.land (nested)
 *    B) row.goldName / row.goldLand (flat)
 *    C) row["1"], row["1_land"] / row.first, row.firstLand (rank-based)
 *    D) arrays like [name, land]
 * - Still STRICT by distance AND gender (Men/Women), mixed ignores gender.
 *
 * Output:
 * - OS and WK inserted immediately after WT.
 * - Value format: "1 (25)" with multiple lines if multiple medals.
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
      .replace(/[’'"().,]/g, "")
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
    const candidates = [
      ".h2h-toggle button.is-active",
      ".h2h-toggle button.active",
      ".h2h-toggle button[aria-pressed='true']",
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

  function possibleKeysForDistance(distKey){
    if (distKey === "500") return ["500", "500m", "500M", "500 m", "500meter", "500 meter"];
    if (distKey === "1000") return ["1000", "1000m", "1000M", "1000 m", "1000meter", "1000 meter"];
    if (distKey === "1500") return ["1500", "1500m", "1500M", "1500 m", "1500meter", "1500 meter"];
    if (distKey === "relay") return ["relay", "Relay", "RELAY", "relay men", "relay women", "Relay Men", "Relay Women"];
    if (distKey === "mixed") return ["mixed", "Mixed", "mixed relay", "Mixed Relay", "MIXED RELAY", "mixedRelay"];
    return [distKey];
  }

  function getBucketByExactKeys(obj, keys){
    for (const k of keys){
      if (obj && Array.isArray(obj[k])) return obj[k];
    }
    return [];
  }

  function keyMatchesDistance(k, distKey) {
    const s = String(k ?? "").toLowerCase().replace(/\s+/g, " ");
    if (distKey === "500") return s.includes("500");
    if (distKey === "1000") return s.includes("1000");
    if (distKey === "1500") return s.includes("1500");
    if (distKey === "mixed") return s.includes("mixed");
    if (distKey === "relay") return s.includes("relay") && !s.includes("mixed");
    return false;
  }

  function scanBuckets(obj, distKey) {
    const scanned = [];
    if (!obj) return scanned;
    for (const k of Object.keys(obj)) {
      if (keyMatchesDistance(k, distKey) && Array.isArray(obj[k])) scanned.push(...obj[k]);
    }
    return scanned;
  }

  function getBucketsStrict(st, distKey, gender) {
    if (!st) return [];
    const keys = possibleKeysForDistance(distKey);

    if (distKey === "mixed") {
      const mixedObj = st.mixed || {};
      let rows = getBucketByExactKeys(mixedObj, ["mixed", ...keys]);
      if (rows.length) return rows;
      return scanBuckets(mixedObj, "mixed");
    }

    const gObj = (gender === "women") ? (st.women || {}) : (st.men || {});
    let rows = getBucketByExactKeys(gObj, keys);
    if (rows.length) return rows;
    return scanBuckets(gObj, distKey);
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

  // --- Flexible medal extraction ---
  function lowerKeyed(obj){
    const o = {};
    if (!obj || typeof obj !== "object") return o;
    for (const k of Object.keys(obj)) o[String(k).toLowerCase()] = obj[k];
    return o;
  }

  function extractNameLand(value){
    // Supports: {name, land} ; {naam, land} ; [name, land] ; "NAME" ; "NAME CAN"
    if (!value) return { name: "", land: "" };

    if (Array.isArray(value)) {
      return { name: String(value[0] ?? "").trim(), land: String(value[1] ?? "").trim() };
    }

    if (typeof value === "object") {
      const lk = lowerKeyed(value);
      const name = String(lk.name ?? lk.naam ?? lk.skater ?? lk.rider ?? "").trim();
      const land = String(lk.land ?? lk.country ?? lk.nation ?? "").trim();
      return { name, land };
    }

    return { name: String(value).trim(), land: "" };
  }

  function getMedal(row, medalSlot, rank){
    // medalSlot: 'gold'/'silver'/'bronze'
    const lk = lowerKeyed(row);

    // A) nested
    if (row && row[medalSlot]) return extractNameLand(row[medalSlot]);

    // B) flat variants: goldName/goldLand, silverName..., bronzeName...
    const base = medalSlot.toLowerCase();
    const nameFlat = lk[base + "name"] ?? lk[base + "_name"] ?? lk[base + "skater"] ?? lk[base + "rider"];
    const landFlat = lk[base + "land"] ?? lk[base + "_land"] ?? lk[base + "country"] ?? lk[base + "_country"];
    if (nameFlat || landFlat) return { name: String(nameFlat ?? "").trim(), land: String(landFlat ?? "").trim() };

    // C) rank-based keys: "1", "1_name", "1land", "first", etc.
    const r = String(rank);
    const nameRank =
      lk[r] ?? lk[r + "name"] ?? lk[r + "_name"] ?? lk["rank" + r] ?? lk["rank_" + r] ??
      (rank === 1 ? (lk.first ?? lk["1st"]) : rank === 2 ? (lk.second ?? lk["2nd"]) : (lk.third ?? lk["3rd"]));
    const landRank =
      lk[r + "land"] ?? lk[r + "_land"] ?? lk[r + "country"] ?? lk[r + "_country"] ??
      (rank === 1 ? (lk.firstland ?? lk.first_country) : rank === 2 ? (lk.secondland ?? lk.second_country) : (lk.thirdland ?? lk.third_country));
    if (nameRank || landRank) return extractNameLand([nameRank, landRank]);

    return { name: "", land: "" };
  }

  function buildLandSetFromChampions(rows) {
    const s = new Set();
    for (const r of rows || []) {
      for (const slot of [["gold",1],["silver",2],["bronze",3]]) {
        const med = getMedal(r, slot[0], slot[1]);
        const land = String(med.land ?? "").trim().toUpperCase();
        if (land && /^[A-Z]{3}$/.test(land)) s.add(land);
      }
    }
    return s;
  }

  function tokenKey(name, landSet) {
    let clean = cleanText(name);
    if (!clean) return "";
    let toks = clean.split(" ").filter(Boolean);

    // remove trailing landcode if user accidentally typed it into the name field
    if (toks.length >= 2 && landSet) {
      const last = toks[toks.length - 1];
      if (landSet.has(last)) toks = toks.slice(0, -1);
      while (toks.length >= 2 && landSet.has(toks[toks.length - 1])) toks.pop();
    }

    toks.sort();
    return toks.join(" ");
  }

  function buildMedalMap(rows, landSet) {
    const map = new Map();
    for (const r of rows || []) {
      const yy = yyFromYear(r?.year ?? r?.Year ?? r?.jaar ?? r?.JAAR);
      const yearNum = parseInt(String(r?.year ?? r?.Year ?? r?.jaar ?? "").replace(/\D/g, ""), 10);
      const medals = [
        { slot: "gold", rank: 1 },
        { slot: "silver", rank: 2 },
        { slot: "bronze", rank: 3 },
      ];
      for (const m of medals) {
        const med = getMedal(r, m.slot, m.rank);
        const key = tokenKey(med.name, landSet);
        if (!key) continue;
        const arr = map.get(key) || [];
        arr.push({ rank: m.rank, yy, yearNum: Number.isNaN(yearNum) ? -1 : yearNum });
        map.set(key, arr);
      }
    }
    for (const [k, list] of map.entries()) list.sort((a, b) => (b.yearNum - a.yearNum) || (a.rank - b.rank));
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
    const gender = getActiveGender();

    const worldRows = getBucketsStrict(loadState(WORLD_KEY), distKey, gender);
    const olympicRows = getBucketsStrict(loadState(OLYMPIC_KEY), distKey, gender);

    // land set for name cleanup + tolerate "NAME CAN" mistakes
    const landSet = new Set([
      ...buildLandSetFromChampions(worldRows),
      ...buildLandSetFromChampions(olympicRows),
      ...getLandCodesFromTable(table, headerRow),
    ]);

    const wkMap = buildMedalMap(worldRows, landSet);
    const osMap = buildMedalMap(olympicRows, landSet);

    const rows = table.querySelectorAll("tbody tr").length
      ? Array.from(table.querySelectorAll("tbody tr"))
      : Array.from(table.querySelectorAll("tr")).slice(1);

    for (const tr of rows) {
      const tds = Array.from(tr.children);
      if (!tds.length) continue;

      const key = tokenKey((tds[0]?.textContent || "").trim(), landSet);

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
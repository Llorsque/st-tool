/**
 * Head-to-Head OS/WK columns (robust).
 * - Inserts OS and WK columns immediately after WT.
 * - Fills OS and WK based on Champions data saved by the "Bewerk" popup pages.
 *
 * Storage keys (from champions-editor.js):
 *   - shorttrack_champions_world_v1
 *   - shorttrack_champions_olympic_v1
 *
 * Output format:
 *   1 (25)
 *   2 (22)
 * (multiple lines if multiple medals)
 */
(function () {
  const WORLD_KEY = "shorttrack_champions_world_v1";
  const OLYMPIC_KEY = "shorttrack_champions_olympic_v1";

  function safeJsonParse(raw, fallback) {
    try { return JSON.parse(raw); } catch { return fallback; }
  }

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

  function tokenKey(s) {
    const clean = cleanName(s);
    if (!clean) return "";
    const toks = clean.split(" ").filter(Boolean);
    toks.sort();
    return toks.join(" ");
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
    // Try toggles/buttons with active class
    const active =
      document.querySelector(".h2h-toggle button.is-active") ||
      document.querySelector("[data-gender].is-active") ||
      Array.from(document.querySelectorAll("button.is-active")).find(b => /men|women/i.test(b.textContent || ""));

    if (active) {
      const t = (active.textContent || "").toLowerCase();
      if (t.includes("women")) return "women";
      if (t.includes("men")) return "men";
    }

    const status = (document.querySelector(".h2h-status")?.textContent || "").toLowerCase();
    if (status.includes("women")) return "women";
    if (status.includes("men")) return "men";
    return "men";
  }

  function getActiveDistanceKey() {
    const active =
      document.querySelector(".h2h-tab.is-active") ||
      document.querySelector("[data-distance].is-active") ||
      Array.from(document.querySelectorAll("button.is-active")).find(b => /(500|1000|1500|relay|mixed)/i.test(b.textContent || ""));

    const label = ((active ? active.textContent : document.querySelector(".h2h-status")?.textContent) || "").toLowerCase();
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

  function buildMedalMap(rows) {
    const map = new Map(); // tokenKey -> [{rank, yy, yearNum}]
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
        const key = tokenKey(nm);
        if (!key) continue;
        const arr = map.get(key) || [];
        arr.push({ rank: m.rank, yy, yearNum: Number.isNaN(yearNum) ? -1 : yearNum });
        map.set(key, arr);
      }
    }

    for (const [k, list] of map.entries()) {
      list.sort((a, b) => {
        if (a.yearNum !== b.yearNum) return b.yearNum - a.yearNum;
        return a.rank - b.rank;
      });
    }

    return map;
  }

  function rowHasHeaders(rowEl, needed) {
    const cells = Array.from(rowEl.children || []);
    const labels = cells.map(c => (c.textContent || "").trim().toUpperCase());
    return needed.every(x => labels.includes(x));
  }

  function findH2HTable() {
    // Prefer a table with NAME + WT + TIME headers (as in your screenshot)
    const tables = Array.from(document.querySelectorAll("table"));
    for (const t of tables) {
      // Find a likely header row: either thead tr or first tr
      const headerRow =
        t.querySelector("thead tr") ||
        Array.from(t.querySelectorAll("tr")).find(tr => rowHasHeaders(tr, ["WT"])) ||
        t.querySelector("tr");
      if (!headerRow) continue;
      const labels = Array.from(headerRow.children).map(c => (c.textContent || "").trim().toUpperCase());
      if (labels.includes("WT") && labels.includes("TIME")) return { table: t, headerRow };
    }

    // Fallback: any element with role=table
    const roles = Array.from(document.querySelectorAll('[role="table"]'));
    for (const r of roles) {
      const headerRow = r.querySelector('[role="row"]') || r.firstElementChild;
      if (!headerRow) continue;
      const labels = Array.from(headerRow.children).map(c => (c.textContent || "").trim().toUpperCase());
      if (labels.includes("WT") && labels.includes("TIME")) return { table: r, headerRow };
    }

    return null;
  }

  function ensureOSWKHeaders(headerRow) {
    const cells = Array.from(headerRow.children);
    const labels = cells.map(c => (c.textContent || "").trim().toUpperCase());

    if (labels.includes("OS") && labels.includes("WK")) return;

    const wtIndex = labels.indexOf("WT");
    if (wtIndex === -1) return;

    const tag = cells[0]?.tagName?.toLowerCase() || "th";
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
      : Array.from(table.querySelectorAll("tr")).slice(1); // fallback if no tbody

    for (const tr of bodyRows) {
      const tds = Array.from(tr.children);
      if (!tds.length) continue;

      // If already has OS/WK in correct positions, skip
      const hasOS = !!tds[osIndex];
      const hasWK = !!tds[wkIndex];
      if (hasOS && hasWK) continue;

      const cellTag = tds[0]?.tagName?.toLowerCase() || "td";

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

    const wkMap = buildMedalMap(worldRows);
    const osMap = buildMedalMap(olympicRows);

    const bodyRows = table.querySelectorAll("tbody tr").length
      ? Array.from(table.querySelectorAll("tbody tr"))
      : Array.from(table.querySelectorAll("tr")).slice(1);

    for (const tr of bodyRows) {
      const tds = Array.from(tr.children);
      if (!tds.length) continue;

      const name = (tds[0]?.textContent || "").trim();
      const key = tokenKey(name);

      const os = (key && osMap.has(key)) ? osMap.get(key) : null;
      const wk = (key && wkMap.has(key)) ? wkMap.get(key) : null;

      const osLines = os ? os.map(x => x.yy ? `${x.rank} (${x.yy})` : `${x.rank}`) : [];
      const wkLines = wk ? wk.map(x => x.yy ? `${x.rank} (${x.yy})` : `${x.rank}`) : [];

      if (tds[osIndex]) tds[osIndex].innerHTML = osLines.length ? osLines.map(escapeHtml).join("<br>") : "-";
      if (tds[wkIndex]) tds[wkIndex].innerHTML = wkLines.length ? wkLines.map(escapeHtml).join("<br>") : "-";
    }
  }

  function runOnce() {
    const found = findH2HTable();
    if (!found) return false;
    const { table, headerRow } = found;
    ensureOSWKHeaders(headerRow);
    // headerRow changed after insertion: re-select it (safest)
    const hdr = (table.querySelector("thead tr") || headerRow);
    ensureOSWKBody(table, hdr);
    fillOSWK(table, hdr);
    return true;
  }

  let running = false;
  function schedule() {
    if (running) return;
    running = true;
    requestAnimationFrame(() => {
      running = false;
      runOnce();
    });
  }

  function boot() {
    // Run multiple times to catch late renders
    schedule();
    setTimeout(schedule, 200);
    setTimeout(schedule, 800);
    setTimeout(schedule, 2000);

    // Observe DOM changes globally so switching distance/gender refreshes columns
    const obs = new MutationObserver(() => schedule());
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });

    // Refresh when champions lists are saved in other tab/page
    window.addEventListener("storage", (e) => {
      if (e.key === WORLD_KEY || e.key === OLYMPIC_KEY) schedule();
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
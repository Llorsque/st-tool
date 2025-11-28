/**
 * Head-to-Head: voeg OS & WK kolommen toe (na WT) op basis van lokaal opgeslagen champions-data.
 *
 * Data bronnen (localStorage):
 *  - World Champions:   shorttrack_champions_world_v1
 *  - Olympic Champions: shorttrack_champions_olympic_v1
 *
 * Verwacht state-structuur (zoals champions-editor.js):
 *  {
 *    men:   { "500": [ {year, gold:{name,land}, silver:{...}, bronze:{...}}, ... ], ... },
 *    women: { ... },
 *    mixed: { "mixed": [ ... ] },
 *    meta: { updatedAt: "..." }
 *  }
 *
 * Integratie:
 *  - Zorg dat dit script geladen wordt op de Head-to-Head pagina.
 *  - Als je al een globale app.js hebt die op elke pagina laadt, kun je dit daar ook includen.
 */
(function () {
  const WORLD_KEY = "shorttrack_champions_world_v1";
  const OLYMPIC_KEY = "shorttrack_champions_olympic_v1";

  function safeJsonParse(raw, fallback) {
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function normName(s) {
    return String(s ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ")
      .replace(/[’'".]/g, "")
      .replace(/-/g, " ");
  }

  function yyFromYear(y) {
    const s = String(y ?? "").trim();
    if (!s) return "";
    const m = s.match(/\d{2,4}/);
    if (!m) return "";
    const n = m[0];
    return n.slice(-2); // "2025" -> "25", "05" -> "05"
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getActiveGender() {
    // Meest waarschijnlijk: toggle knoppen met "is-active"
    const btn = document.querySelector(".h2h-toggle button.is-active, .toggle button.is-active, [data-gender].is-active");
    if (btn) {
      const t = btn.textContent.trim().toLowerCase();
      if (t.includes("women")) return "women";
      if (t.includes("men")) return "men";
    }

    // Fallback: statusregel bevat "Men" / "Women"
    const status = (document.querySelector(".h2h-status")?.textContent || "").toLowerCase();
    if (status.includes("women")) return "women";
    if (status.includes("men")) return "men";
    return "men";
  }

  function getActiveDistanceKey() {
    // Afstand-knoppen met .is-active
    const b = document.querySelector(".h2h-tab.is-active, .tab.is-active, [data-distance].is-active");
    const label = (b ? b.textContent : (document.querySelector(".h2h-status")?.textContent || "")).toLowerCase();

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
    if (distKey === "mixed") return (st.mixed && st.mixed.mixed) ? st.mixed.mixed : [];
    const g = st[gender];
    if (!g) return [];
    return Array.isArray(g[distKey]) ? g[distKey] : [];
  }

  function getMedalLinesForName(rows, targetName) {
    const target = normName(targetName);
    if (!target) return [];

    const found = [];
    for (const r of rows || []) {
      const yearYY = yyFromYear(r?.year);
      const medals = [
        { slot: "gold", rank: 1 },
        { slot: "silver", rank: 2 },
        { slot: "bronze", rank: 3 },
      ];
      for (const m of medals) {
        const nm = normName(r?.[m.slot]?.name);
        if (!nm) continue;
        if (nm === target) {
          found.push({ yearYY, yearRaw: r?.year, rank: m.rank });
        }
      }
    }

    // sort: newest year first, then rank (1 before 2 before 3)
    found.sort((a, b) => {
      const ya = parseInt(String(a.yearRaw ?? "").replace(/\D/g, ""), 10);
      const yb = parseInt(String(b.yearRaw ?? "").replace(/\D/g, ""), 10);
      if (!Number.isNaN(ya) && !Number.isNaN(yb) && ya !== yb) return yb - ya;
      return a.rank - b.rank;
    });

    return found.map(x => x.yearYY ? `${x.rank} (${x.yearYY})` : `${x.rank}`);
  }

  function findHeadToHeadTable() {
    // Zoek een table met headers WT + TIME (robust)
    const tables = Array.from(document.querySelectorAll("table"));
    for (const t of tables) {
      const ths = Array.from(t.querySelectorAll("thead th")).map(th => th.textContent.trim().toUpperCase());
      if (ths.includes("WT") && ths.includes("TIME")) return t;
    }
    return null;
  }

  function ensureHeaders(table) {
    const headRow = table.querySelector("thead tr");
    if (!headRow) return;

    const ths = Array.from(headRow.children);
    const labels = ths.map(th => th.textContent.trim().toUpperCase());

    // Al aanwezig?
    if (labels.includes("OS") && labels.includes("WK")) return;

    const wtIndex = labels.indexOf("WT");
    if (wtIndex === -1) return;

    const thOS = document.createElement("th");
    thOS.textContent = "OS";
    const thWK = document.createElement("th");
    thWK.textContent = "WK";

    // Insert na WT (dus op wtIndex+1 & +2)
    headRow.insertBefore(thOS, ths[wtIndex + 1] || null);
    headRow.insertBefore(thWK, ths[wtIndex + 2] || null);
  }

  function ensureBodyCells(table) {
    const headRow = table.querySelector("thead tr");
    const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
    if (!headRow) return;

    const labels = Array.from(headRow.children).map(th => th.textContent.trim().toUpperCase());
    const wtIndex = labels.indexOf("WT");
    const osIndex = labels.indexOf("OS");
    const wkIndex = labels.indexOf("WK");

    if (wtIndex === -1 || osIndex === -1 || wkIndex === -1) return;

    for (const tr of bodyRows) {
      const tds = Array.from(tr.children);
      // Als er al cells zijn op de OS/WK index, skip insert
      if (tds[osIndex] && tds[wkIndex]) continue;

      // Voeg 2 td's toe na WT
      const tdOS = document.createElement("td");
      tdOS.className = "h2h-col-os";
      tdOS.textContent = "-";
      const tdWK = document.createElement("td");
      tdWK.className = "h2h-col-wk";
      tdWK.textContent = "-";

      tr.insertBefore(tdOS, tds[wtIndex + 1] || null);
      // after inserting OS, indices shift by +1 for rest of nodes beyond insertion point
      const tds2 = Array.from(tr.children);
      tr.insertBefore(tdWK, tds2[wtIndex + 2] || null);
    }
  }

  function fillOSWK(table) {
    const headRow = table.querySelector("thead tr");
    if (!headRow) return;

    const labels = Array.from(headRow.children).map(th => th.textContent.trim().toUpperCase());
    const osIndex = labels.indexOf("OS");
    const wkIndex = labels.indexOf("WK");

    if (osIndex === -1 || wkIndex === -1) return;

    const gender = getActiveGender();
    const distKey = getActiveDistanceKey();

    const worldRows = loadBucket(WORLD_KEY, gender, distKey);
    const olympicRows = loadBucket(OLYMPIC_KEY, gender, distKey);

    const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
    for (const tr of bodyRows) {
      const tds = Array.from(tr.children);
      if (!tds.length) continue;

      // Neem naam uit eerste kolom (werkt voor rijders én teams/landen)
      const name = (tds[0]?.textContent || "").trim();

      const osLines = getMedalLinesForName(olympicRows, name);
      const wkLines = getMedalLinesForName(worldRows, name);

      const osCell = tds[osIndex];
      const wkCell = tds[wkIndex];
      if (osCell) osCell.innerHTML = osLines.length ? osLines.map(escapeHtml).join("<br>") : "-";
      if (wkCell) wkCell.innerHTML = wkLines.length ? wkLines.map(escapeHtml).join("<br>") : "-";
    }
  }

  let raf = null;
  function scheduleRun() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = null;
      const table = findHeadToHeadTable();
      if (!table) return;
      ensureHeaders(table);
      ensureBodyCells(table);
      fillOSWK(table);
    });
  }

  function installObservers() {
    const table = findHeadToHeadTable();
    if (!table) return;

    // Als table verandert door nieuwe selectie -> rerun
    const obs = new MutationObserver(() => scheduleRun());
    obs.observe(table, { childList: true, subtree: true });

    // Status/tabs kunnen ook wijzigen zonder table rebuild
    const status = document.querySelector(".h2h-status") || document.body;
    const obs2 = new MutationObserver(() => scheduleRun());
    obs2.observe(status, { childList: true, subtree: true, characterData: true });

    // Als champions-data opgeslagen wordt in andere tab: storage event
    window.addEventListener("storage", (e) => {
      if (e.key === WORLD_KEY || e.key === OLYMPIC_KEY) scheduleRun();
    });
  }

  function boot() {
    // Run en probeer nog 1x na korte delay (voor SPA render)
    scheduleRun();
    setTimeout(scheduleRun, 300);
    setTimeout(scheduleRun, 1200);
    installObservers();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
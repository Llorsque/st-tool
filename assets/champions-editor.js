(function(){
  const STORAGE_PREFIX = "shorttrack_champions_";
  const VERSION = "v1";

  const DISTANCES = [
    { key: "500", label: "500m" },
    { key: "1000", label: "1000m" },
    { key: "1500", label: "1500m" },
    { key: "relay", label: "Relay" },
    { key: "mixed", label: "Mixed Relay", gender: "both" },
  ];

  function safeJsonParse(raw, fallback){ try { return JSON.parse(raw); } catch { return fallback; } }
  function nowIso(){ return new Date().toISOString(); }
  function normalize(s){ return String(s ?? "").trim(); }
  function storageKey(pageType){ return `${STORAGE_PREFIX}${pageType}_${VERSION}`; }

  function defaultState(){
    const init = { men: {}, women: {}, mixed: {}, meta: { updatedAt: null } };
    for (const d of DISTANCES){
      if (d.key === "mixed") init.mixed[d.key] = [];
      else { init.men[d.key] = []; init.women[d.key] = []; }
    }
    return init;
  }

  function loadState(pageType){
    const raw = localStorage.getItem(storageKey(pageType));
    const st = raw ? safeJsonParse(raw, null) : null;
    if (!st) return defaultState();

    const canon = canonicalizeState(st);

    const def = defaultState();
    def.men = { ...def.men, ...(canon.men || {}) };
    def.women = { ...def.women, ...(canon.women || {}) };
    def.mixed = { ...def.mixed, ...(canon.mixed || {}) };
    def.meta = { updatedAt: canon?.meta?.updatedAt || null };

    // Rewrite once to prevent future mismatches (e.g. Men 1500 not showing in H2H).
    try { localStorage.setItem(storageKey(pageType), JSON.stringify(canon)); } catch {}
    return def;
  }

  function saveState(pageType, state){
    const canon = canonicalizeState(state);
    canon.meta = canon.meta || {};
    canon.meta.updatedAt = nowIso();
    localStorage.setItem(storageKey(pageType), JSON.stringify(canon));
  }

  function el(tag, cls, text){
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function medalCell(kind, obj){
    const wrap = el("div", "ch-medal-badge");
    wrap.appendChild(el("span", "ch-dot " + kind));
    const name = normalize(obj?.name) || "-";
    const land = normalize(obj?.land) || "";
    wrap.appendChild(el("span", "ch-name", name));
    if (land) wrap.appendChild(el("span", "ch-land", land));
    return wrap;
  }

  function sortRows(rows){
    return [...rows].sort((a,b)=>{
      const ya = parseInt(a?.year,10);
      const yb = parseInt(b?.year,10);
      if (!Number.isNaN(ya) && !Number.isNaN(yb) && ya !== yb) return yb - ya;
      return String(a?.place||"").localeCompare(String(b?.place||""));
    });
  }

  function ensurePageScaffold(title){
    const main = document.querySelector("main") || document.body;
    let wrap = document.querySelector(".ch-wrap");
    if (!wrap){
      wrap = el("section", "ch-wrap");
      main.appendChild(wrap);
    } else {
      wrap.innerHTML = "";
    }

    const header = el("header", "ch-header");
    const left = el("div");
    left.appendChild(el("div", "breadcrumb", ""));
    left.appendChild(el("h1", "ch-title", title));
    left.appendChild(el("p", "ch-subtitle",
      "Klik op ‘Bewerk’ om winnaars toe te voegen en op te slaan. Je kunt per afstand onbeperkt jaren toevoegen."
    ));

    const actions = el("div", "ch-actions");
    const home = el("a", "ch-btn ch-btn-ghost", "← Hoofdmenu");
    home.href = "../index.html";
    home.classList.add("home-button");
    const edit = el("button", "ch-btn", "Bewerk");
    edit.type = "button";
    edit.id = "chEditBtn";
    actions.appendChild(home);
    actions.appendChild(edit);

    header.appendChild(left);
    header.appendChild(actions);
    wrap.appendChild(header);

    const panel = el("div", "ch-panel");
    panel.innerHTML = `
      <div class="ch-controls">
        <div class="ch-toggle" role="group" aria-label="Men or Women">
          <button type="button" class="ch-gender is-active" data-gender="men">Men</button>
          <button type="button" class="ch-gender" data-gender="women">Women</button>
        </div>
        <div class="ch-tabs" role="tablist" aria-label="Afstanden"></div>
        <div class="ch-note" id="chUpdatedAt"></div>
      </div>
    `;
    wrap.appendChild(panel);

    const tableWrap = el("div", "ch-table-wrap");
    tableWrap.innerHTML = `
      <table class="ch-table" aria-label="Champions table">
        <thead>
          <tr>
            <th class="ch-year">Jaar</th>
            <th class="ch-place">Plaats</th>
            <th class="ch-medal">Goud</th>
            <th class="ch-medal">Zilver</th>
            <th class="ch-medal">Brons</th>
          </tr>
        </thead>
        <tbody id="chTbody"></tbody>
      </table>
    `;
    wrap.appendChild(tableWrap);

    return wrap;
  }

  function buildModal(){
    if (document.getElementById("chModalBackdrop")) return;

    const backdrop = el("div", "ch-modal-backdrop");
    backdrop.id = "chModalBackdrop";
    backdrop.innerHTML = `
      <div class="ch-modal" role="dialog" aria-modal="true" aria-labelledby="chModalTitle">
        <div class="ch-modal-head">
          <div>
            <h2 class="ch-modal-title" id="chModalTitle">Bewerk winnaars</h2>
            <p class="ch-modal-sub">Kies een onderdeel, voeg rijen toe/aanpas en klik op Opslaan.</p>
          </div>
          <button class="ch-x" type="button" id="chModalClose">Sluiten</button>
        </div>
        <div class="ch-modal-body">
          <div class="ch-edit-tabs" id="chEditTabs"></div>
          <div class="ch-form-head">
            <div class="ch-small" id="chEditContext"></div>
            <button type="button" class="ch-btn ch-btn-ghost" id="chAddRow">+ Jaar toevoegen</button>
          </div>
          <div class="ch-grid head">
            <div>Jaar</div><div>Plaats</div><div>Goud (Naam · Land)</div><div>Zilver</div><div>Brons</div><div></div>
          </div>
          <div id="chRows"></div>
        </div>
        <div class="ch-modal-foot">
          <div class="ch-saved" id="chSavedState"></div>
          <div style="display:flex; gap:10px; align-items:center;">
            <button type="button" class="ch-btn ch-btn-ghost" id="chCancel">Annuleren</button>
            <button type="button" class="ch-btn" id="chSave">Opslaan</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", (e)=>{ if (e.target === backdrop) closeModal(); });
    document.addEventListener("keydown", (e)=>{
      if (e.key === "Escape" && backdrop.classList.contains("is-open")) closeModal();
    });
  }

  function openModal(){ document.getElementById("chModalBackdrop")?.classList.add("is-open"); }
  function closeModal(){ document.getElementById("chModalBackdrop")?.classList.remove("is-open"); }

  function cryptoId(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }

  function pack(obj){
    const name = normalize(obj?.name);
    const land = normalize(obj?.land);
    if (!name && !land) return "";
    if (name && land) return `${name}, ${land}`;
    return name || land;
  }
  function unpack(str){
    const v = normalize(str);
    if (!v) return { name: "", land: "" };
    const parts = v.split(",");
    if (parts.length === 1) return { name: v, land: "" };
    const land = normalize(parts.pop());
    const name = normalize(parts.join(",").trim());
    return { name, land };
  }

  // --- Data migration / canonicalization ------------------------------------
  // Over time there may be older localStorage shapes (or partially edited shapes).
  // We normalize everything into the canonical structure:
  // {
  //   men: { "500": [], "1000": [], "1500": [], "relay": [] },
  //   women: { ... },
  //   mixed: { mixed: [] },
  //   meta: { updatedAt: ISO-string|null }
  // }
  function normalizeDistanceKey(key){
    const s = normalize(key).toLowerCase();
    if (!s) return "";
    if (s.includes("mixed")) return "mixed";
    if (s.includes("relay")) return "relay";
    if (s.includes("1500")) return "1500";
    if (s.includes("1000")) return "1000";
    if (s.includes("500")) return "500";
    return s;
  }

  function pick(obj, keys){
    if (!obj || typeof obj !== "object") return undefined;
    const lower = {};
    for (const k of Object.keys(obj)) lower[String(k).toLowerCase()] = obj[k];
    for (const k of keys){
      const v = lower[String(k).toLowerCase()];
      if (v != null) return v;
    }
    return undefined;
  }

  function cleanKey(s){
    return normalize(s).toUpperCase().replace(/[’'"().,]/g, "").replace(/-/g, " ").replace(/\s+/g, " ").trim();
  }

  function canonicalizeMedal(val){
    // Accepts: {name, land} | string "Name, LAND" | [name, land] | {value,label,fullName,...}
    if (!val) return { name: "", land: "" };

    if (Array.isArray(val)){
      const name = normalize(val[0]);
      const land = normalize(val[1]).toUpperCase();
      return { name, land };
    }

    if (typeof val === "string"){
      const o = unpack(val);
      return { name: normalize(o.name), land: normalize(o.land).toUpperCase() };
    }

    if (typeof val === "object"){
      const name = normalize(pick(val, ["name","naam","skater","rider","value","label","text","fullname","full_name"]) || "");
      const land = normalize(pick(val, ["land","country","nation","code"]) || "").toUpperCase();
      if (!name && !land) return { name: "", land: "" };
      return { name, land };
    }

    return { name: normalize(String(val)), land: "" };
  }

  function canonicalizeRow(r){
    const row = (r && typeof r === "object") ? { ...r } : {};
    if (!row._id) row._id = typeof cryptoId === "function" ? cryptoId() : String(Date.now());

    // year/place can exist in multiple keys
    row.year = normalize(pick(row, ["year","jaar","season","date"]) || row.year || "");
    row.place = normalize(pick(row, ["place","location","venue","city","event"]) || row.place || "");

    // medal variants
    const gold = row.gold ?? pick(row, ["gold","1","first","1st","winner"]);
    const silver = row.silver ?? pick(row, ["silver","2","second","2nd"]);
    const bronze = row.bronze ?? pick(row, ["bronze","3","third","3rd"]);

    // flat variants
    const goldFlat = (pick(row, ["goldname","gold_name","goldskater","goldrider"]) || "") + (pick(row, ["goldland","gold_land","goldcountry"]) ? (", " + pick(row, ["goldland","gold_land","goldcountry"])) : "");
    const silverFlat = (pick(row, ["silvername","silver_name","silverskater","silverrider"]) || "") + (pick(row, ["silverland","silver_land","silvercountry"]) ? (", " + pick(row, ["silverland","silver_land","silvercountry"])) : "");
    const bronzeFlat = (pick(row, ["bronzename","bronze_name","bronzeskaters","bronzerider"]) || "") + (pick(row, ["bronzeland","bronze_land","bronzecountry"]) ? (", " + pick(row, ["bronzeland","bronze_land","bronzecountry"])) : "");

    row.gold = canonicalizeMedal(gold || (goldFlat.trim() ? goldFlat : null));
    row.silver = canonicalizeMedal(silver || (silverFlat.trim() ? silverFlat : null));
    row.bronze = canonicalizeMedal(bronze || (bronzeFlat.trim() ? bronzeFlat : null));

    // discard any leftover alternative fields to keep storage clean (optional, but avoids drift)
    return {
      _id: row._id,
      year: row.year,
      place: row.place,
      gold: row.gold,
      silver: row.silver,
      bronze: row.bronze,
    };
  }

  function canonicalizeState(st){
    const out = defaultState();
    if (!st || typeof st !== "object") return out;

    out.meta.updatedAt = st?.meta?.updatedAt || st?.updatedAt || null;

    function ensureArr(v){
      if (Array.isArray(v)) return v;
      if (v && typeof v === "object" && Array.isArray(v.rows)) return v.rows;
      if (v && typeof v === "object" && Array.isArray(v.data)) return v.data;
      return [];
    }

    function absorb(gender, distKey, rows){
      if (!distKey) return;
      const list = ensureArr(rows).map(canonicalizeRow);
      if (!list.length) return;
      if (distKey === "mixed") {
        out.mixed.mixed.push(...list);
      } else if (gender === "men" || gender === "women") {
        out[gender][distKey] = out[gender][distKey] || [];
        out[gender][distKey].push(...list);
      }
    }

    // canonical paths
    for (const g of ["men","women"]){
      const bucket = st[g];
      if (bucket && typeof bucket === "object"){
        for (const k of Object.keys(bucket)){
          const dk = normalizeDistanceKey(k);
          if (dk === "mixed") continue;
          absorb(g, dk, bucket[k]);
        }
      }
    }

    // mixed bucket
    const mix = st.mixed;
    if (mix && typeof mix === "object"){
      for (const k of Object.keys(mix)){
        const dk = normalizeDistanceKey(k) || "mixed";
        absorb("mixed", dk, mix[k]);
      }
    }

    // very old top-level distance keys (no gender): assume men by default (safe fallback)
    for (const k of Object.keys(st)){
      if (["men","women","mixed","meta","updatedAt"].includes(k)) continue;
      const dk = normalizeDistanceKey(k);
      if (["500","1000","1500","relay","mixed"].includes(dk)){
        absorb("men", dk, st[k]);
      }
    }

    // de-dupe (same year + same gold)
    function dedupe(list){
      const seen = new Set();
      const out = [];
      for (const r of list){
        const key = cleanKey(r.year) + "|" + cleanKey(r.gold?.name || "") + "|" + cleanKey(r.silver?.name || "") + "|" + cleanKey(r.bronze?.name || "");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(r);
      }
      return out;
    }
    for (const g of ["men","women"]){
      for (const d of ["500","1000","1500","relay"]){
        out[g][d] = dedupe(out[g][d] || []);
      }
    }
    out.mixed.mixed = dedupe(out.mixed.mixed || []);

    return out;
  }
  // -------------------------------------------------------------------------


  function input(placeholder, value, medal=false){
    const i = document.createElement("input");
    i.type = "text";
    i.placeholder = medal ? "Naam, LAND (bijv. Steven Dubois, CAN)" : placeholder;
    i.value = normalize(value || "");
    return i;
  }

  function main(){
    const pageType = document.body?.dataset?.championsPage || (location.pathname.includes("olympic") ? "olympic" : "world");
    const pageTitle = pageType === "olympic" ? "Olympic Champions" : "World Champions";

    ensurePageScaffold(pageTitle);
    buildModal();

    let state = loadState(pageType);

    const genderBtns = Array.from(document.querySelectorAll(".ch-gender"));
    const tabsEl = document.querySelector(".ch-tabs");
    const tbody = document.getElementById("chTbody");
    const updatedAtEl = document.getElementById("chUpdatedAt");
    const editBtn = document.getElementById("chEditBtn");

    const editTabsEl = document.getElementById("chEditTabs");
    const rowsEl = document.getElementById("chRows");
    const ctxEl = document.getElementById("chEditContext");
    const savedEl = document.getElementById("chSavedState");

    const btnClose = document.getElementById("chModalClose");
    const btnCancel = document.getElementById("chCancel");
    const btnSave = document.getElementById("chSave");
    const btnAdd = document.getElementById("chAddRow");

    let activeGender = "men";
    let activeDistance = "500";
    let editDistance = "500";
    let editDraft = null;

    function updateUpdatedAt(){
      const t = state?.meta?.updatedAt;
      if (!t) { updatedAtEl.textContent = "Nog niet opgeslagen"; return; }
      const d = new Date(t);
      updatedAtEl.textContent = "Laatst opgeslagen: " + d.toLocaleString();
    }

    function getDistanceLabel(key){
      return (DISTANCES.find(d=>d.key===key)?.label) || key;
    }

    function renderDistanceTabs(){
      tabsEl.innerHTML = "";
      for (const d of DISTANCES){
        const b = el("button", "ch-tab" + (d.key === activeDistance ? " is-active" : ""), d.label);
        b.type = "button";
        b.addEventListener("click", ()=>{
          activeDistance = d.key;
          renderDistanceTabs();
          renderTable();
        });
        tabsEl.appendChild(b);
      }
    }

    function renderTable(){
      tbody.innerHTML = "";

      const isMixed = activeDistance === "mixed";
      const bucket = isMixed ? (state.mixed?.mixed || []) : (state[activeGender]?.[activeDistance] || []);
      const rows = sortRows(bucket);

      if (!rows.length){
        const tr = el("tr");
        const td = el("td");
        td.colSpan = 5;
        td.style.color = "rgba(255,255,255,.72)";
        td.style.padding = "14px 12px";
        td.textContent = "Nog geen data. Klik op ‘Bewerk’ om winnaars toe te voegen.";
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }

      for (const r of rows){
        const tr = el("tr");
        tr.appendChild(el("td", "", normalize(r.year) || "-"));
        tr.appendChild(el("td", "", normalize(r.place) || "-"));

        const gold = el("td"); gold.appendChild(medalCell("gold", r.gold));
        const silver = el("td"); silver.appendChild(medalCell("silver", r.silver));
        const bronze = el("td"); bronze.appendChild(medalCell("bronze", r.bronze));

        tr.appendChild(gold); tr.appendChild(silver); tr.appendChild(bronze);
        tbody.appendChild(tr);
      }
    }

    function setGender(next){
      activeGender = next;
      genderBtns.forEach(b=>b.classList.toggle("is-active", b.dataset.gender === next));
      renderTable();
    }

    function getDraftBucket(){
      if (!editDraft) return [];
      if (editDistance === "mixed"){
        editDraft.mixed = editDraft.mixed || {};
        editDraft.mixed.mixed = editDraft.mixed.mixed || [];
        return editDraft.mixed.mixed;
      }
      editDraft[activeGender] = editDraft[activeGender] || {};
      editDraft[activeGender][editDistance] = editDraft[activeGender][editDistance] || [];
      return editDraft[activeGender][editDistance];
    }
    function setDraftBucket(rows){
      if (editDistance === "mixed"){
        editDraft.mixed = editDraft.mixed || {};
        editDraft.mixed.mixed = rows;
        return;
      }
      editDraft[activeGender] = editDraft[activeGender] || {};
      editDraft[activeGender][editDistance] = rows;
    }

    function renderEditTabs(){
      editTabsEl.innerHTML = "";
      for (const d of DISTANCES){
        const b = el("button", "ch-edit-tab" + (d.key === editDistance ? " is-active" : ""), d.label);
        b.type = "button";
        b.addEventListener("click", ()=>{
          editDistance = d.key;
          renderEditTabs();
          renderEditRows();
        });
        editTabsEl.appendChild(b);
      }
    }

    function renderEditRows(){
      const distLabel = getDistanceLabel(editDistance);
      const genderLabel = editDistance === "mixed" ? "Mixed (onafhankelijk)" : (activeGender === "men" ? "Men" : "Women");
      ctxEl.textContent = `Bewerken: ${genderLabel} · ${distLabel}`;

      const rows = sortRows(getDraftBucket());
      rows.forEach(r=>{ r._id = r._id || cryptoId(); });
      setDraftBucket(rows);

      rowsEl.innerHTML = "";
      if (!rows.length){
        const msg = el("div", "ch-small", "Nog geen jaren. Klik op ‘+ Jaar toevoegen’ om te starten.");
        msg.style.padding = "8px 2px";
        rowsEl.appendChild(msg);
        return;
      }

      for (const row of rows){
        const grid = el("div", "ch-grid");

        const y = input("Jaar", row.year);
        const p = input("Plaats", row.place);
        const g = input("Goud (Naam · Land)", pack(row.gold), true);
        const s = input("Zilver (Naam · Land)", pack(row.silver), true);
        const b = input("Brons (Naam · Land)", pack(row.bronze), true);

        y.addEventListener("input", ()=>{ row.year = y.value; });
        p.addEventListener("input", ()=>{ row.place = p.value; });
        g.addEventListener("input", ()=>{ row.gold = unpack(g.value); });
        s.addEventListener("input", ()=>{ row.silver = unpack(s.value); });
        b.addEventListener("input", ()=>{ row.bronze = unpack(b.value); });

        const del = el("button", "ch-del", "×");
        del.type = "button";
        del.title = "Verwijderen";
        del.addEventListener("click", ()=>{
          const next = getDraftBucket().filter(r=>r._id !== row._id);
          setDraftBucket(next);
          renderEditRows();
        });

        grid.appendChild(y); grid.appendChild(p);
        grid.appendChild(g); grid.appendChild(s); grid.appendChild(b);
        grid.appendChild(del);

        rowsEl.appendChild(grid);
      }
    }

    function openEditor(){
      editDistance = activeDistance;
      editDraft = JSON.parse(JSON.stringify(state));
      renderEditTabs();
      renderEditRows();
      savedEl.textContent = "";
      openModal();
    }

    function addRow(){
      const rows = getDraftBucket();
      rows.push({
        _id: cryptoId(),
        year: "",
        place: "",
        gold: { name: "", land: "" },
        silver: { name: "", land: "" },
        bronze: { name: "", land: "" },
      });
      setDraftBucket(rows);
      renderEditRows();
    }

    function commitSave(){
      if (!editDraft) return;
      state = editDraft;
      saveState(pageType, state);
      updateUpdatedAt();
      renderTable();
      savedEl.textContent = "Opgeslagen ✓";
      setTimeout(()=>closeModal(), 450);
    }

    function cancelEdit(){
      editDraft = null;
      closeModal();
    }

    // events
    genderBtns.forEach(btn=>btn.addEventListener("click", ()=> setGender(btn.dataset.gender)));
    editBtn.addEventListener("click", openEditor);
    btnAdd.addEventListener("click", addRow);
    btnSave.addEventListener("click", commitSave);
    btnCancel.addEventListener("click", cancelEdit);
    btnClose.addEventListener("click", cancelEdit);

    // init
    setGender(activeGender);
    renderDistanceTabs();
    updateUpdatedAt();
    renderTable();
  }

  document.addEventListener("DOMContentLoaded", main);
})();
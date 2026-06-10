/* Canned Responses — content/manager.js
 * In-page "Canned Responses" panel (add / edit / compose), opened from the
 * Gmail top-bar button. Shadow-DOM isolated. Quick plain-text editing with
 * variable chips; rich formatting lives in the full editor (options page).
 * The Alt+A picker remains the insert path. */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});
  const plain = (h) => (NS.sanitize ? NS.sanitize.toPlainText(h) : h);

  let host = null, shadow = null, open = false;
  let mode = "list", editingId = null, query = "";
  let draft = null; // {title, bodyText, shortcut} for a pre-filled new template

  function ensureHost() {
    if (host) return;
    host = document.createElement("div");
    // pointer-events:none -> the host never blocks the page or the picker window;
    // only the panel captures clicks (non-modal, so both windows coexist).
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;inset:0;display:none;pointer-events:none;";
    shadow = host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);
  }
  function closePanel() { open = false; if (host) host.style.display = "none"; if (shadow) shadow.innerHTML = ""; }

  // ---- Draggable panel + remembered position ----------------------------
  let panelPos = null; // {left, top} in px, once the user moves it
  function loadPos() {
    const s = NS.store.getSettings && NS.store.getSettings();
    if (s && s.panelPos) panelPos = s.panelPos;
  }
  function applyPos() {
    const p = shadow && shadow.querySelector(".panel");
    if (!p || !panelPos) return;
    const w = p.getBoundingClientRect().width || 480;
    const left = Math.max(0, Math.min(panelPos.left, g.innerWidth - w));
    const top = Math.max(0, Math.min(panelPos.top, g.innerHeight - 44));
    p.style.left = left + "px"; p.style.top = top + "px";
    p.style.right = "auto"; p.style.transform = "none";
  }
  function makeDraggable() {
    const p = shadow.querySelector(".panel");
    const handle = shadow.querySelector(".hd");
    if (!p || !handle) return;
    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;    // header buttons aren't drag handles
      e.preventDefault();
      const rect = p.getBoundingClientRect();
      const offX = e.clientX - rect.left, offY = e.clientY - rect.top, w = rect.width;
      p.style.transform = "none"; p.style.right = "auto";
      const onMove = (ev) => {
        const left = Math.max(0, Math.min(ev.clientX - offX, g.innerWidth - w));
        const top = Math.max(0, Math.min(ev.clientY - offY, g.innerHeight - 44));
        p.style.left = left + "px"; p.style.top = top + "px";
        panelPos = { left, top };
      };
      const onUp = () => {
        g.removeEventListener("mousemove", onMove, true);
        g.removeEventListener("mouseup", onUp, true);
        if (panelPos && NS.store) NS.store.updateSettings({ panelPos }).catch(() => {});
      };
      g.addEventListener("mousemove", onMove, true);
      g.addEventListener("mouseup", onUp, true);
    });
  }
  // Shared z-index so the most-recently opened/clicked window sits on top.
  function raise() { NS.__z = (NS.__z || 2147483000) + 1; if (host) host.style.zIndex = NS.__z; }
  function afterRender() {
    applyPos(); makeDraggable(); raise();
    const p = shadow.querySelector(".panel");
    if (p) p.addEventListener("mousedown", raise);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // "cr-dark" when the resolved theme is dark (honors the Light/Dark/System toggle).
  function themeCls() {
    try { return NS.theme.resolve(NS.store.getSettings().theme) === "dark" ? "cr-dark" : ""; }
    catch (e) { return ""; }
  }

  // ---- plain-text <-> stored-HTML body conversion -----------------------
  function bodyToText(html) {
    const tmp = String(html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n");
    const div = document.createElement("div");
    div.innerHTML = tmp;
    return (div.textContent || "").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "");
  }
  function textToBody(text) { return esc(text).replace(/\n/g, "<br>"); }

  function styles() {
    return `
      .panel{position:fixed;top:15%;left:50%;transform:translateX(-50%);width:min(480px,92vw);max-height:78vh;
        display:flex;flex-direction:column;background:#fff;border-radius:12px;box-shadow:0 14px 48px rgba(0,0,0,.3);
        font:14px/1.45 system-ui,-apple-system,sans-serif;color:#111;overflow:hidden;
        pointer-events:auto;border:1px solid #e6e8eb;}
      .hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #eef0f2;
        cursor:move;user-select:none;}
      .hd .ttl{font-weight:700;flex:1;}
      .hd .hdacts{display:flex;align-items:center;gap:6px;}
      .x{border:0;background:#f1f3f5;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:18px;
        line-height:1;display:flex;align-items:center;justify-content:center;color:#444;}
      .x:hover{background:#e5e8eb;}
      .q{margin:10px 14px 6px;padding:8px 10px;border:1px solid #d6dade;border-radius:8px;outline:none;font-size:14px;}
      .q:focus{border-color:#2563eb;}
      .list{list-style:none;margin:0;padding:6px 8px 10px;overflow:auto;}
      .list .empty{color:#999;padding:14px;}
      .row{display:flex;align-items:center;gap:6px;padding:8px 8px;border-radius:8px;cursor:pointer;}
      .row:hover{background:#f2f4f7;}
      .row .star{border:0;background:none;cursor:pointer;font-size:15px;color:#c4ccd4;padding:0;width:18px;}
      .row .star.on{color:#f5a623;}
      .rmain{flex:1;min-width:0;}
      .rt{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .rs{color:#777;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .ic{border:0;background:none;cursor:pointer;font-size:14px;color:#8a929b;width:26px;height:26px;border-radius:6px;}
      .ic:hover{background:#e5e8eb;color:#333;}
      .edit{display:flex;flex-direction:column;gap:10px;padding:12px 14px;overflow:auto;}
      .ti{font-size:16px;font-weight:600;border:0;border-bottom:1px solid #e3e6e9;padding:4px 0;outline:none;}
      .ti:focus{border-bottom-color:#2563eb;}
      .sc{font-size:13px;border:1px solid #d6dade;border-radius:7px;padding:7px 9px;outline:none;}
      .sc:focus{border-color:#2563eb;}
      .vars{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
      .vars .vlbl{color:#888;font-size:12px;}
      .chip{border:1px solid #d6dade;background:#f7f9fb;border-radius:999px;padding:3px 9px;font-size:12px;cursor:pointer;color:#2563eb;}
      .chip:hover{background:#eef3fb;}
      .bd{min-height:160px;resize:vertical;border:1px solid #e3e6e9;border-radius:8px;padding:10px 12px;
        font:14px/1.5 system-ui,sans-serif;outline:none;}
      .bd:focus{border-color:#2563eb;}
      .acts{display:flex;align-items:center;gap:10px;}
      .acts .grow{flex:1;}
      .lim{color:#c0392b;font-size:12px;margin-top:2px;}
      .lnk{color:#2563eb;font-size:13px;text-decoration:none;cursor:pointer;}
      .lnk:hover{text-decoration:underline;}
      .btn{border:0;border-radius:8px;padding:7px 13px;font-size:13px;cursor:pointer;}
      .btn.primary{background:#2563eb;color:#fff;}
      .btn.primary:hover{background:#1d4ed8;}
      .btn.danger{background:#fde8e8;color:#c0392b;}
      .btn.danger:hover{background:#fad4d4;}
      .cr-dark{background:#1f2430;color:#e6e8ee;border-color:#333b4d;}
      .cr-dark .hd{border-bottom-color:#2c3342;}
      .cr-dark .x{background:#2a3140;color:#cdd3df;} .cr-dark .x:hover{background:#333b4d;}
      .cr-dark .q{background:#232838;border-color:#3a4252;color:#e6e8ee;}
      .cr-dark .row:hover{background:#262c3a;}
      .cr-dark .rs{color:#9aa3b2;}
      .cr-dark .ic{color:#8b93a3;} .cr-dark .ic:hover{background:#2c3342;color:#e6e8ee;}
      .cr-dark .list .empty{color:#8b93a3;}
      .cr-dark .ti{color:#e6e8ee;border-bottom-color:#3a4252;}
      .cr-dark .sc,.cr-dark .bd{background:#232838;border-color:#3a4252;color:#e6e8ee;}
      .cr-dark .vars .vlbl{color:#9aa3b2;}
      .cr-dark .chip{background:#1e2c45;border-color:#34507e;color:#7eb0ff;} .cr-dark .chip:hover{background:#24365a;}
      .cr-dark .btn.danger{background:#3a1f22;color:#f3a3a3;} .cr-dark .btn.danger:hover{background:#4a262a;}
    `;
  }

  function templates() {
    let list = NS.store.getAll();
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((t) => (t.title + " " + plain(t.body)).toLowerCase().includes(q));
    return list;
  }

  // ---- List view --------------------------------------------------------
  function renderList() {
    ensureHost();
    host.style.display = "block";
    shadow.innerHTML = `
      <style>${styles()}</style>
      <div class="panel ${themeCls()}">
        <div class="hd">
          <span class="ttl">Canned Responses</span>
          <div class="hdacts">
            <button id="new" class="btn primary">+ New</button>
            <button id="close" class="x" title="Close">&times;</button>
          </div>
        </div>
        <input id="q" class="q" placeholder="Search templates…" value="${esc(query)}">
        <ul class="list"></ul>
      </div>`;
    shadow.getElementById("close").onclick = closePanel;
    shadow.getElementById("new").onclick = onNew;
    const q = shadow.getElementById("q");
    q.addEventListener("input", () => { query = q.value; updateRows(); });
    q.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });
    updateRows();
    afterRender();
  }

  function updateRows() {
    const items = templates();
    const ul = shadow.querySelector(".list");
    if (!items.length) {
      ul.innerHTML = `<li class="empty">${query ? "No matches." : "No templates yet — click + New."}</li>`;
      return;
    }
    ul.innerHTML = items.map((t) =>
      `<li class="row" data-id="${t.id}">
         <button class="star ${t.favorite ? "on" : ""}" data-act="fav" title="Favorite">${t.favorite ? "★" : "☆"}</button>
         <div class="rmain" data-act="edit"><div class="rt"></div><div class="rs"></div></div>
         <button class="ic" data-act="edit" title="Edit">&#9998;</button>
         <button class="ic" data-act="del" title="Delete">&#128465;</button>
       </li>`).join("");
    items.forEach((t) => {
      const li = ul.querySelector(`li[data-id="${t.id}"]`);
      li.querySelector(".rt").textContent = t.title || "Untitled";
      li.querySelector(".rs").textContent = plain(t.body).slice(0, 60) || "(empty)";
      li.addEventListener("click", (e) => {
        const act = (e.target.closest("[data-act]") || {}).dataset && e.target.closest("[data-act]").dataset.act;
        if (act === "fav") toggleFav(t.id);
        else if (act === "del") delTemplate(t.id);
        else editTemplate(t.id);
      });
    });
  }

  async function toggleFav(id) {
    const t = NS.store.get(id);
    await NS.store.update(id, { favorite: !(t && t.favorite) });
    updateRows();
  }
  async function delTemplate(id) {
    if (!confirm("Delete this template?")) return;
    await NS.store.softDelete(id);
    updateRows();
  }
  function onNew() { editingId = null; mode = "edit"; renderEdit(); } // draft until Save
  function editTemplate(id) { editingId = id; mode = "edit"; renderEdit(); }

  // ---- Edit view --------------------------------------------------------
  function renderEdit() {
    ensureHost();
    host.style.display = "block";
    const t = editingId ? NS.store.get(editingId) : { title: "", body: "" };
    if (editingId && !t) { mode = "list"; renderList(); return; }
    shadow.innerHTML = `
      <style>${styles()}</style>
      <div class="panel ${themeCls()}">
        <div class="hd">
          <button id="back" class="x" title="Back">&larr;</button>
          <span class="ttl">${editingId ? "Edit template" : "New template"}</span>
          <div class="hdacts"><button id="close" class="x" title="Close">&times;</button></div>
        </div>
        <div class="edit">
          <input id="title" class="ti" placeholder="Template title">
          <input id="shortcut" class="sc" placeholder="Shortcut for ;expand (optional, e.g. sig)">
          <div class="vars"><span class="vlbl">Insert:</span>
            <button class="chip" data-var="first_name">{first_name}</button>
            <button class="chip" data-var="last_name">{last_name}</button>
            <button class="chip" data-var="company">{company}</button>
          </div>
          <textarea id="body" class="bd" placeholder="Write your template… use {first_name} for variables"></textarea>
          <div id="lim" class="lim" hidden></div>
          <div class="acts">
            <button id="del" class="btn danger">${editingId ? "Delete" : "Discard"}</button>
            <span class="grow"></span>
            <a id="full" class="lnk">Full editor &#8599;</a>
            <button id="save" class="btn primary">Save</button>
          </div>
        </div>
      </div>`;
    shadow.getElementById("title").value = editingId ? (t.title || "") : (draft && draft.title || "");
    shadow.getElementById("shortcut").value = editingId ? (t.shortcut || "") : (draft && draft.shortcut || "");
    shadow.getElementById("body").value = editingId ? bodyToText(t.body || "") : (draft && draft.bodyText || "");
    shadow.getElementById("back").onclick = () => { mode = "list"; renderList(); };
    shadow.getElementById("close").onclick = closePanel;
    shadow.getElementById("del").onclick = () => delEdit();
    shadow.getElementById("save").onclick = () => saveEdit();
    shadow.getElementById("full").onclick = () => { if (NS.app) NS.app.openManager(); closePanel(); };
    shadow.querySelectorAll(".chip").forEach((c) =>
      c.addEventListener("click", () => insertVar(c.dataset.var)));
    afterRender();
    shadow.getElementById("title").focus();
  }

  function insertVar(name) {
    const ta = shadow.getElementById("body");
    const s = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
    const e = ta.selectionEnd != null ? ta.selectionEnd : s;
    const tok = "{" + name + "}";
    ta.value = ta.value.slice(0, s) + tok + ta.value.slice(e);
    ta.focus();
    const p = s + tok.length;
    ta.setSelectionRange(p, p);
  }

  async function saveEdit() {
    const title = shadow.getElementById("title").value.trim() || "Untitled";
    const shortcut = shadow.getElementById("shortcut").value.trim();
    const body = textToBody(shadow.getElementById("body").value);
    if (editingId) await NS.store.update(editingId, { title, body, shortcut });
    else {
      const rec = await NS.store.create({ title, body, shortcut });
      if (!rec) {                                // hit the free-plan cap
        const el = shadow.getElementById("lim");
        const lim = (NS.store.templateLimit && NS.store.templateLimit()) || 150;
        if (el) { el.textContent = "You've reached the " + lim + "-template limit on the free plan. Delete one to add more."; el.hidden = false; }
        return;
      }
      editingId = rec.id;
    }
    draft = null;
    mode = "list"; renderList();                 // back to the starting list view
  }
  async function delEdit() {
    if (editingId) {
      if (!confirm("Delete this template?")) return;
      await NS.store.softDelete(editingId);
    }
    draft = null; editingId = null; mode = "list"; renderList(); // "Discard" on a new draft just returns
  }

  function openManagerPanel() {
    if (open) return;
    open = true; mode = "list"; query = "";
    NS.store.init().then(() => { loadPos(); mode === "list" ? renderList() : renderEdit(); })
      .catch((e) => console.error("[CR] manager store init failed", e));
  }

  // Open straight into a brand-new template draft (used by the picker's "+ New").
  // `pos` (optional): open at this spot instead of the remembered one — used to
  // cascade off the picker. Not persisted, so the panel's own saved favorite stays.
  // `initial` (optional): {title, bodyText, shortcut} to pre-fill — used by
  // "Save selection as Canned Response".
  function openNew(pos, initial) {
    draft = initial || null;
    open = true; query = "";
    NS.store.init().then(() => { if (pos) panelPos = pos; else loadPos(); editingId = null; mode = "edit"; renderEdit(); })
      .catch((e) => console.error("[CR] manager openNew failed", e));
  }
  // Open straight into editing a specific template (used by the picker's edit icon).
  function openEdit(id, pos) {
    open = true; query = "";
    NS.store.init().then(() => { if (pos) panelPos = pos; else loadPos(); editingId = id; mode = "edit"; renderEdit(); })
      .catch((e) => console.error("[CR] manager openEdit failed", e));
  }

  NS.manager = { open: openManagerPanel, openNew, openEdit, close: closePanel, isOpen: () => open };
})(globalThis);

/* Canned Responses — ui/options/options.js
 * Three-pane template manager over the shared CR.store data layer:
 *   category rail (virtual + user categories)  ·  paginated cards  ·  rich editor.
 * Create / edit / favorite / categorize / reorder / trash & restore. */
(function () {
  "use strict";
  const { store, sanitize, model, theme, entitlements, analytics } = globalThis.CR;
  const canImages = () => !!(entitlements && entitlements.can("images"));

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // ---- UI state ---------------------------------------------------------
  let selectedId = null;
  let query = "";
  let view = { type: "all" };          // all | favorites | trash | category(id)
  let page = 0;
  let statusTimer = null;
  const PAGE_SIZE = 7;

  // Minimal inline icons for the category rail (no asset deps).
  const ICONS = {
    all: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 20.4l1.4-6.8L2.2 9l6.9-.7z"/></svg>',
    folder: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12"/></svg>'
  };

  async function boot() {
    await store.init();

    $("#search").addEventListener("input", (e) => { query = e.target.value; page = 0; renderList(); });
    $("#new").addEventListener("click", onNew);
    $("#hotkeyBtn").addEventListener("click", recordHotkey);
    $("#exportBtn").addEventListener("click", exportTemplates);
    $("#importBtn").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", onImportFile);
    $("#nudgeExport").addEventListener("click", exportTemplates);
    $("#nudgeDismiss").addEventListener("click", async () => { await store.updateSettings({ backupNudgeDismissedAt: Date.now() }); renderNudge(); });
    $("#nudgeWeekly").addEventListener("change", async (e) => { await store.updateSettings({ backupReminderWeekly: e.target.checked }); renderNudge(); });
    $("#manageShortcuts").addEventListener("click", (e) => { e.preventDefault(); openShortcutsPage(); });
    // Anonymous, opt-in analytics toggle (off by default).
    const aTog = $("#analyticsToggle");
    if (aTog) {
      aTog.checked = !!store.getSettings().analyticsEnabled;
      aTog.addEventListener("change", async (e) => {
        await store.updateSettings({ analyticsEnabled: e.target.checked });
        if (e.target.checked && analytics) analytics.capture("analytics_enabled");
      });
    }
    const pLink = $("#privacyLink");
    if (pLink) pLink.href = "https://gmail-templates-and-canned.netlify.app/privacy.html";
    $("#pagePrev").addEventListener("click", () => { if (page > 0) { page--; renderList(); } });
    $("#pageNext").addEventListener("click", () => { page++; renderList(); });
    $("#previewClose").addEventListener("click", closePreview);
    $("#previewModal").addEventListener("click", (e) => { if (e.target.id === "previewModal") closePreview(); });

    // External changes (seeding, other tabs) refresh everything without
    // clobbering the open editor's focus.
    store.subscribe(() => { renderSidebar(); renderList(); updateCount(); renderHotkey(); applyTheme(); renderNudge(); });

    applyTheme();
    $("#themeSel").value = store.getSettings().theme || "system";
    $("#themeSel").addEventListener("change", async (e) => { await store.updateSettings({ theme: e.target.value }); applyTheme(); });
    try {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if ((store.getSettings().theme || "system") === "system") applyTheme();
      });
    } catch (e) {}

    const settings = store.getSettings();
    // Opened from the "Copy email → Open editor" toast.
    const wasPaste = !!settings.pasteIntoNew;
    if (wasPaste) {
      await store.updateSettings({ pasteIntoNew: false });
      const rec = await store.create({ title: "Pasted email", body: "" });
      if (rec) selectedId = rec.id;
    }
    // Opened from the capture toast's "Edit".
    const focusId = settings.focusTemplateId;
    if (focusId && store.get(focusId)) { selectedId = focusId; store.updateSettings({ focusTemplateId: null }); }

    render();
    if (wasPaste && selectedId) { const b = $("#body"); if (b) b.focus(); }
    renderHotkey();
    if (analytics) analytics.capture("options_opened");   // dropped by the SW unless opted in
  }

  function applyTheme() { theme.applyToDocument((store.getSettings() && store.getSettings().theme) || "system"); }
  function render() { renderSidebar(); renderList(); renderEditor(); updateCount(); renderNudge(); }

  // ---- Hotkey preference ------------------------------------------------
  function renderHotkey() {
    const s = store.getSettings();
    const btn = $("#hotkeyBtn");
    if (btn && !btn.classList.contains("recording")) btn.textContent = (s && s.hotkey) || "Alt+A";
  }
  let recording = false;
  function recordHotkey() {
    if (recording) return;
    recording = true;
    const btn = $("#hotkeyBtn");
    btn.classList.add("recording");
    btn.textContent = "Press keys…";
    function cleanup() {
      recording = false;
      btn.classList.remove("recording");
      document.removeEventListener("keydown", onKey, true);
    }
    async function onKey(e) {
      if (["Control", "Alt", "Shift", "Meta", "OS"].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { cleanup(); renderHotkey(); return; }
      const mods = [];
      if (e.ctrlKey) mods.push("Ctrl");
      if (e.altKey) mods.push("Alt");
      if (e.shiftKey) mods.push("Shift");
      if (e.metaKey) mods.push("Cmd");
      let key = null, m;
      if ((m = /^Key([A-Z])$/.exec(e.code))) key = m[1];
      else if ((m = /^Digit([0-9])$/.exec(e.code))) key = m[1];
      if (!mods.length || !key) { btn.textContent = "Use Alt/Ctrl + a letter"; return; }
      const hotkey = mods.concat(key).join("+");
      await store.updateSettings({ hotkey });
      cleanup();
      renderHotkey();
    }
    document.addEventListener("keydown", onKey, true);
  }

  function openShortcutsPage() {
    try { chrome.tabs.create({ url: "chrome://extensions/shortcuts" }); }
    catch (e) { window.open("chrome://extensions/shortcuts"); }
  }

  // ---- Category rail ----------------------------------------------------
  function categoryCount(id) { return store.getAll().filter((t) => t.folderId === id).length; }

  function renderSidebar() {
    const nav = $("#nav");
    nav.innerHTML = "";
    const all = store.getAll();
    const favCount = all.filter((t) => t.favorite).length;

    const virtuals = [
      { key: "all", icon: ICONS.all, name: "All Templates", count: all.length, view: { type: "all" } },
      { key: "fav", icon: ICONS.star, name: "Favorites", count: favCount, view: { type: "favorites" }, cls: "fav" }
    ];
    virtuals.forEach((v) => nav.appendChild(navItem(v)));
    nav.appendChild(divider());

    for (const cat of store.getCategories()) {
      nav.appendChild(navItem({
        key: "cat:" + cat.id, icon: ICONS.folder, name: cat.name,
        count: categoryCount(cat.id), view: { type: "category", id: cat.id }, catId: cat.id
      }));
    }
    nav.appendChild(divider());
    nav.appendChild(navItem({
      key: "trash", icon: ICONS.trash, name: "Trash",
      count: store.getTrash().length, view: { type: "trash" }
    }));

    renderShortcutsPanel();
  }

  function divider() { const d = document.createElement("div"); d.className = "navdivider"; return d; }

  function navItem(v) {
    const active = sameView(view, v.view);
    const el = document.createElement("div");
    el.className = "navitem" + (active ? " active" : "") + (v.cls ? " " + v.cls : "");
    el.innerHTML =
      `<span class="nvicon">${v.icon}</span>
       <span class="nvname"></span>
       ${v.catId ? '<button class="nvedit" title="Rename / delete">⋯</button>' : ""}
       <span class="nvcount">${v.count}</span>`;
    el.querySelector(".nvname").textContent = v.name;
    el.addEventListener("click", (e) => {
      if (e.target.closest(".nvedit")) return;
      view = v.view; page = 0; renderSidebar(); renderList();
    });
    if (v.catId) {
      el.querySelector(".nvedit").addEventListener("click", (e) => {
        e.stopPropagation(); openCategoryMenu(e.currentTarget, v.catId, v.name);
      });
    }
    return el;
  }

  function renderShortcutsPanel() {
    const ul = $("#kblist");
    ul.innerHTML = "";
    const withSc = store.getAll().filter((t) => t.shortcut).slice(0, 4);
    if (!withSc.length) {
      ul.innerHTML = `<li class="kbempty">Add a shortcut to a template to expand it with <b>;name</b> + Tab.</li>`;
      return;
    }
    for (const t of withSc) {
      const li = document.createElement("li");
      li.className = "kbrow";
      li.innerHTML = `<span class="kbname"></span><span class="kbkey"></span>`;
      li.querySelector(".kbname").textContent = t.title || "Untitled";
      li.querySelector(".kbkey").textContent = ";" + t.shortcut;
      li.title = "Type ;" + t.shortcut + " then Tab to insert";
      li.addEventListener("click", () => { selectInAnyView(t.id); });
      ul.appendChild(li);
    }
  }

  // Jump to a template even if the current view would hide it.
  function selectInAnyView(id) {
    const t = store.get(id);
    if (!t) return;
    if (!templateInView(t, view) || query) { view = { type: "all" }; query = ""; $("#search").value = ""; page = 0; }
    selectedId = id;
    render();
  }

  // ---- Category rename / delete menu ------------------------------------
  function openCategoryMenu(anchor, catId, name) {
    const menu = buildMenu([
      { label: "✎ Rename", fn: () => renameCategoryFlow(catId, name) },
      { sep: true },
      { label: "🗑 Delete category", danger: true, fn: () => deleteCategoryFlow(catId, name) }
    ]);
    positionMenu(menu, anchor);
  }
  async function renameCategoryFlow(catId, current) {
    const name = prompt("Rename category:", current);
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    await store.renameCategory(catId, trimmed);
    render();
  }
  async function deleteCategoryFlow(catId, name) {
    const n = categoryCount(catId);
    const msg = n
      ? `Delete "${name}"? Its ${n} template(s) will move to "All Templates" (not deleted).`
      : `Delete "${name}"?`;
    if (!confirm(msg)) return;
    await store.deleteCategory(catId);
    if (sameView(view, { type: "category", id: catId })) view = { type: "all" };
    render();
  }

  // ---- View filtering ---------------------------------------------------
  function sameView(a, b) { return a.type === b.type && (a.type !== "category" || a.id === b.id); }
  function templateInView(t, v) {
    if (v.type === "favorites") return !!t.favorite;
    if (v.type === "category") return t.folderId === v.id;
    return true; // all
  }
  function viewLabel() {
    if (view.type === "favorites") return "Favorites";
    if (view.type === "trash") return "Trash";
    if (view.type === "category") {
      const c = store.getCategories().find((c) => c.id === view.id);
      return c ? c.name : "Category";
    }
    return "All Templates";
  }

  function visibleTemplates() {
    let list = view.type === "trash" ? store.getTrash() : store.getAll().filter((t) => templateInView(t, view));
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((t) => (t.title + " " + sanitize.toPlainText(t.body)).toLowerCase().includes(q));
    return list;
  }

  // ---- Card list + pagination -------------------------------------------
  function renderList() {
    const all = visibleTemplates();
    const pageCount = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    if (page >= pageCount) page = pageCount - 1;
    if (page < 0) page = 0;
    const start = page * PAGE_SIZE;
    const list = all.slice(start, start + PAGE_SIZE);

    // Trash header action
    const actions = $("#cardActions");
    if (view.type === "trash" && store.getTrash().length) {
      actions.hidden = false;
      actions.innerHTML = `<span class="ca-note">Items in Trash can be restored.</span><button id="emptyTrash" class="btn danger sm">Empty trash</button>`;
      $("#emptyTrash").addEventListener("click", async () => {
        if (!confirm("Permanently delete everything in Trash? This can't be undone.")) return;
        await store.emptyTrash(); render();
      });
    } else { actions.hidden = true; actions.innerHTML = ""; }

    const ul = $("#list");
    ul.innerHTML = "";
    if (!all.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = query ? "No matches." : emptyMessage();
      ul.appendChild(li);
      $("#pager").hidden = true;
      return;
    }
    const canReorder = view.type === "all" && !query;   // global order only well-defined here
    for (const t of list) ul.appendChild(view.type === "trash" ? trashCard(t) : templateCard(t, canReorder));

    // Pager
    const pager = $("#pager");
    if (all.length > PAGE_SIZE) {
      pager.hidden = false;
      $("#pagerLabel").textContent = `${start + 1}–${start + list.length} of ${all.length} templates`;
      $("#pagePrev").disabled = page === 0;
      $("#pageNext").disabled = page >= pageCount - 1;
    } else { pager.hidden = true; }
  }

  function emptyMessage() {
    if (view.type === "trash") return "Trash is empty.";
    if (view.type === "favorites") return "No favorites yet — star a template to pin it here.";
    if (view.type === "category") return "Nothing in this category yet.";
    return "No templates yet — click + New.";
  }

  function templateCard(t, canReorder) {
    const li = document.createElement("li");
    li.className = "card" + (t.id === selectedId ? " sel" : "");
    li.dataset.id = t.id;
    li.draggable = canReorder;
    li.innerHTML =
      `<div class="chead">
         <span class="ctitle"></span>
         <button class="cstar ${t.favorite ? "on" : ""}" title="Favorite">${t.favorite ? "★" : "☆"}</button>
         <button class="cmenu" title="More">⋯</button>
       </div>
       <div class="csnip"></div>
       ${t.shortcut ? `<span class="cchip"></span>` : ""}`;
    li.querySelector(".ctitle").textContent = t.title || "Untitled";
    li.querySelector(".csnip").textContent = sanitize.toPlainText(t.body).slice(0, 90) || "(empty)";
    if (t.shortcut) li.querySelector(".cchip").textContent = ";" + t.shortcut;

    li.addEventListener("click", (e) => {
      if (e.target.closest(".cstar") || e.target.closest(".cmenu")) return;
      selectedId = t.id; render();
    });
    li.querySelector(".cstar").addEventListener("click", async (e) => {
      e.stopPropagation();
      await store.update(t.id, { favorite: !t.favorite });
      renderSidebar(); renderList(); if (t.id === selectedId) renderEditor();
    });
    li.querySelector(".cmenu").addEventListener("click", (e) => { e.stopPropagation(); openCardMenu(e.currentTarget, t); });
    if (canReorder) bindDrag(li);
    return li;
  }

  function trashCard(t) {
    const li = document.createElement("li");
    li.className = "card";
    li.innerHTML =
      `<div class="chead"><span class="ctitle"></span></div>
       <div class="csnip"></div>
       <div class="cbtns">
         <button class="btn subtle sm" data-act="restore">Restore</button>
         <button class="btn danger sm" data-act="purge">Delete forever</button>
       </div>`;
    li.querySelector(".ctitle").textContent = t.title || "Untitled";
    li.querySelector(".csnip").textContent = sanitize.toPlainText(t.body).slice(0, 90) || "(empty)";
    li.querySelector('[data-act="restore"]').addEventListener("click", async () => {
      const rec = await store.restore(t.id);
      if (!rec) { alert("Couldn't restore — you're at the " + store.templateLimit() + "-template limit. Delete one first."); return; }
      render();
    });
    li.querySelector('[data-act="purge"]').addEventListener("click", async () => {
      if (!confirm("Permanently delete this template? This can't be undone.")) return;
      await store.remove(t.id); render();
    });
    return li;
  }

  // ---- Card context menu (duplicate / move / delete) --------------------
  function openCardMenu(anchor, t) {
    const cats = store.getCategories();
    const items = [
      { label: t.favorite ? "☆ Unfavorite" : "★ Favorite", fn: async () => { await store.update(t.id, { favorite: !t.favorite }); render(); } },
      { label: "⧉ Duplicate", fn: () => duplicate(t) },
      { sep: true },
      { heading: "Move to" },
      { label: (t.folderId == null ? "• " : "") + "Uncategorized", fn: async () => { await store.update(t.id, { folderId: null }); render(); } }
    ];
    for (const c of cats) items.push({ label: (t.folderId === c.id ? "• " : "") + c.name, fn: async () => { await store.update(t.id, { folderId: c.id }); render(); } });
    items.push({ label: "+ New category…", fn: () => moveToNewCategory(t) });
    items.push({ sep: true });
    items.push({ label: "🗑 Delete", danger: true, fn: async () => { await store.softDelete(t.id); if (selectedId === t.id) selectedId = null; render(); } });
    positionMenu(buildMenu(items), anchor);
  }
  async function duplicate(t) {
    const rec = await store.create({ title: (t.title || "Untitled") + " copy", body: t.body, shortcut: "", folderId: t.folderId, favorite: false });
    if (!rec) { alert("You've reached the " + store.templateLimit() + "-template limit on the free plan."); return; }
    selectedId = rec.id; render();
  }
  async function moveToNewCategory(t) {
    const name = prompt("New category name:");
    if (name == null || !name.trim()) return;
    const cat = await store.createCategory(name.trim());
    await store.update(t.id, { folderId: cat.id });
    render();
  }

  // ---- Lightweight popup menu primitives --------------------------------
  let openMenuEl = null;
  function buildMenu(items) {
    closeMenu();
    const menu = document.createElement("div");
    menu.className = "ctxmenu";
    for (const it of items) {
      if (it.sep) { const s = document.createElement("div"); s.className = "csep"; menu.appendChild(s); continue; }
      if (it.heading) { const h = document.createElement("div"); h.className = "clabel"; h.textContent = it.heading; menu.appendChild(h); continue; }
      const row = document.createElement("div");
      row.className = "ci" + (it.danger ? " danger" : "");
      row.textContent = it.label;
      row.addEventListener("click", () => { closeMenu(); it.fn(); });
      menu.appendChild(row);
    }
    document.body.appendChild(menu);
    openMenuEl = menu;
    setTimeout(() => document.addEventListener("mousedown", onDocDown, true), 0);
    return menu;
  }
  function onDocDown(e) { if (openMenuEl && !openMenuEl.contains(e.target)) closeMenu(); }
  function closeMenu() {
    if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; document.removeEventListener("mousedown", onDocDown, true); }
  }
  function positionMenu(menu, anchor) {
    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let left = r.right - mw;            // right-align to the trigger
    let top = r.bottom + 4;
    if (left < 8) left = 8;
    if (top + mh > window.innerHeight - 8) top = r.top - mh - 4;
    menu.style.left = left + "px";
    menu.style.top = Math.max(8, top) + "px";
  }

  // ---- Drag reorder (All view only) -------------------------------------
  let dragId = null;
  function bindDrag(li) {
    li.addEventListener("dragstart", () => { dragId = li.dataset.id; li.classList.add("dragging"); });
    li.addEventListener("dragend", () => { li.classList.remove("dragging"); dragId = null; });
    li.addEventListener("dragover", (e) => e.preventDefault());
    li.addEventListener("drop", async (e) => {
      e.preventDefault();
      const targetId = li.dataset.id;
      if (!dragId || dragId === targetId) return;
      const ids = store.getAll().map((t) => t.id);
      const from = ids.indexOf(dragId), to = ids.indexOf(targetId);
      if (from < 0 || to < 0) return;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      await store.reorder(ids);
      renderList();
    });
  }

  // ---- Editor pane ------------------------------------------------------
  function renderEditor() {
    const pane = $("#editorpane");
    const t = selectedId ? store.get(selectedId) : null;
    if (!t) {
      pane.innerHTML =
        `<div class="placeholder"><div class="phicon">📝</div><h2>No template selected</h2>
         <p>Pick a template, or click <b>+ New</b> to create one. Organize with categories on the left.</p></div>`;
      return;
    }
    const cats = store.getCategories();
    const catOptions = ['<option value="">Uncategorized</option>']
      .concat(cats.map((c) => `<option value="${c.id}"${t.folderId === c.id ? " selected" : ""}></option>`))
      .concat('<option value="__new__">+ New category…</option>').join("");

    pane.innerHTML = `
      <div class="editor">
        <div class="fieldrow">
          <div class="field grow">
            <label class="flabel" for="title">Template name</label>
            <input id="title" class="finput" placeholder="e.g. Meeting reschedule">
          </div>
          <div class="field grow">
            <label class="flabel" for="shortcut">Shortcut <span class="opt">(optional)</span></label>
            <input id="shortcut" class="finput" placeholder="reschedule">
          </div>
        </div>
        <div class="catrow">
          <div class="field">
            <label class="flabel" for="catSel">Category</label>
            <select id="catSel" class="finput tsel">${catOptions}</select>
          </div>
          <button id="fav" class="fav-toggle ${t.favorite ? "on" : ""}" title="Favorite">${t.favorite ? "★" : "☆"}</button>
        </div>
        <div class="field">
          <label class="flabel">Template content</label>
          <div class="toolbar">
            <select id="fontName" class="tsel" title="Font">
              <option value="">Font</option>
              <option value="Arial, sans-serif">Sans Serif</option>
              <option value="Georgia, serif">Serif</option>
              <option value="'Courier New', monospace">Monospace</option>
              <option value="'Times New Roman', serif">Times</option>
              <option value="Verdana, sans-serif">Verdana</option>
              <option value="'Trebuchet MS', sans-serif">Trebuchet</option>
            </select>
            <select id="fontSize" class="tsel" title="Size">
              <option value="">Size</option>
              <option value="2">Small</option>
              <option value="3">Normal</option>
              <option value="4">Large</option>
              <option value="6">Huge</option>
            </select>
            <span class="tdiv"></span>
            <button data-cmd="bold" title="Bold"><b>B</b></button>
            <button data-cmd="italic" title="Italic"><i>I</i></button>
            <button data-cmd="underline" title="Underline"><u>U</u></button>
            <button data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
            <label class="colorbtn" title="Text colour"><b>A</b><input type="color" id="foreColor" value="#202124"></label>
            <label class="colorbtn" title="Highlight"><span class="hlmark">H</span><input type="color" id="hiliteColor" value="#fff34d"></label>
            <span class="tdiv"></span>
            <button data-cmd="insertUnorderedList" title="Bullet list">&bull;</button>
            <button data-cmd="insertOrderedList" title="Numbered list">1.</button>
            <button data-cmd="justifyLeft" title="Align left">&#9776;</button>
            <button data-cmd="justifyCenter" title="Centre">&#8801;</button>
            <button data-cmd="createLink" title="Insert link">&#128279;</button>
            <button data-cmd="removeFormat" title="Clear formatting">&#10006;</button>
            <span class="spacer"></span>
            <select id="varsel" class="varsel" title="Insert a variable">
              <option value="">{ } Variables</option>
              <option value="first_name">{first_name}</option>
              <option value="last_name">{last_name}</option>
              <option value="company">{company}</option>
              <option value="my_name">{my_name}</option>
            </select>
          </div>
          <div id="body" class="body" contenteditable="true"></div>
        </div>
        <div class="actions">
          <button id="preview" class="btn subtle">👁 Preview</button>
          <button id="del" class="btn danger">Delete</button>
          <div class="grow"></div>
          <span id="status" class="status"></span>
          <button id="cancel" class="btn subtle">Cancel</button>
          <button id="save" class="btn primary">Save changes</button>
        </div>
      </div>`;

    $("#title").value = t.title || "";
    $("#shortcut").value = t.shortcut || "";
    $("#body").innerHTML = t.body || "";
    // fill category option labels safely (avoid HTML injection of names)
    $$("#catSel option").forEach((o) => { const c = cats.find((c) => c.id === o.value); if (c) o.textContent = c.name; });
    bindEditor(t.id);
  }

  function bindEditor(id) {
    const body = $("#body");
    try { document.execCommand("styleWithCSS", false, true); } catch (_) {}

    let savedRange = null;
    body.addEventListener("blur", () => {
      const s = window.getSelection();
      if (s && s.rangeCount && body.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange();
    });
    function withSelection(fn) {
      body.focus();
      if (savedRange) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
      fn();
    }

    $$(".toolbar button[data-cmd]").forEach((b) => {
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", (e) => {
        e.preventDefault();
        body.focus();
        const cmd = b.dataset.cmd;
        if (cmd === "createLink") {
          const url = prompt("Link URL:", "https://");
          if (url) document.execCommand("createLink", false, url);
        } else { document.execCommand(cmd, false, null); }
      });
    });

    $("#fontName").addEventListener("change", (e) => { const v = e.target.value; e.target.selectedIndex = 0; if (v) withSelection(() => document.execCommand("fontName", false, v)); });
    $("#fontSize").addEventListener("change", (e) => { const v = e.target.value; e.target.selectedIndex = 0; if (v) withSelection(() => document.execCommand("fontSize", false, v)); });
    $("#foreColor").addEventListener("input", (e) => withSelection(() => document.execCommand("foreColor", false, e.target.value)));
    $("#hiliteColor").addEventListener("input", (e) => withSelection(() => { if (!document.execCommand("hiliteColor", false, e.target.value)) document.execCommand("backColor", false, e.target.value); }));

    $("#varsel").addEventListener("change", (e) => { const v = e.target.value; e.target.value = ""; if (!v) return; body.focus(); document.execCommand("insertText", false, "{" + v + "}"); });

    $("#catSel").addEventListener("change", async (e) => {
      const v = e.target.value;
      if (v === "__new__") {
        const name = prompt("New category name:");
        if (name == null || !name.trim()) { renderEditor(); return; }
        const cat = await store.createCategory(name.trim());
        await store.update(id, { folderId: cat.id });
        render();
        return;
      }
      await store.update(id, { folderId: v || null });
      renderSidebar(); renderList();
    });

    $("#fav").addEventListener("click", async () => {
      const cur = store.get(id);
      await store.update(id, { favorite: !(cur && cur.favorite) });
      render();
    });

    $("#preview").addEventListener("click", () => openPreview(id));

    $("#del").addEventListener("click", async () => {
      if (!confirm("Move this template to Trash?")) return;
      await store.softDelete(id);
      selectedId = null;
      render();
    });

    $("#cancel").addEventListener("click", () => { renderEditor(); setStatus("Reverted"); });
    $("#save").addEventListener("click", () => save(id, false));

    // Autosave on blur so edits are never lost between sessions.
    [$("#title"), $("#shortcut"), body].forEach((el) => el.addEventListener("blur", () => save(id, true)));
  }

  async function save(id, silent) {
    if (!store.get(id)) return;
    const title = $("#title").value.trim() || "Untitled";
    const shortcut = $("#shortcut").value.trim().replace(/^[;\/]/, "");   // tolerate a typed ; or / prefix
    const raw = $("#body").innerHTML;
    const allowImg = canImages();
    const body = sanitize.sanitize(raw, { images: allowImg });
    await store.update(id, { title, shortcut, body });
    if (!allowImg && sanitize.detectMedia(raw)) {
      $("#body").innerHTML = body;
      proNote("Saved (text & formatting). Images are a Pro feature — upgrade to keep them.");
    } else {
      setStatus(silent ? "Saved" : "Saved ✓");
    }
    renderSidebar(); renderList();   // refresh title/snippet/shortcut chip; keep editor focus
  }

  // ---- Preview modal ----------------------------------------------------
  function highlightVars(html) {
    return html.replace(/\{([a-z0-9_]+)\}/gi, '<span class="vchip">{$1}</span>');
  }
  function openPreview(id) {
    const t = store.get(id);
    if (!t) return;
    $("#previewTitle").textContent = t.title || "Untitled";
    $("#previewBody").innerHTML = highlightVars(sanitize.sanitize(t.body || "", { images: canImages() })) || "<i>(empty)</i>";
    $("#previewModal").hidden = false;
  }
  function closePreview() { $("#previewModal").hidden = true; }

  function setStatus(msg) {
    const el = $("#status"); if (!el) return;
    el.classList.remove("upsell");
    el.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { if ($("#status")) $("#status").textContent = ""; }, 1600);
  }
  function proNote(msg) {
    const el = $("#status"); if (!el) return;
    el.classList.add("upsell");
    el.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { if ($("#status")) { $("#status").textContent = ""; $("#status").classList.remove("upsell"); } }, 6000);
  }

  function updateCount() {
    const n = store.getAll().length;
    const limit = store.templateLimit();
    const head = isFinite(limit) ? (n + " / " + limit) : String(n);
    $("#count").textContent = head + (n === 1 ? " template" : " templates");
  }

  // ---- Backup nudge -----------------------------------------------------
  const WEEK_MS = 7 * 24 * 3600 * 1000;
  function shouldNudge() {
    const s = store.getSettings();
    const now = Date.now();
    if (now - (s.backupNudgeDismissedAt || 0) < WEEK_MS) return false;
    if (s.backupReminderWeekly) return store.count() > 0 && (now - (s.lastBackupAt || 0)) > WEEK_MS;
    return store.count() >= 12 && !(s.lastBackupAt);
  }
  function renderNudge() {
    const el = $("#backupNudge");
    if (!el) return;
    const show = shouldNudge();
    el.hidden = !show;
    if (show) {
      $("#nudgeCount").textContent = store.count();
      $("#nudgeWeekly").checked = !!store.getSettings().backupReminderWeekly;
    }
  }

  async function onNew() {
    const folderId = view.type === "category" ? view.id : null;   // create into the active category
    const rec = await store.create({ title: "Untitled", body: "", folderId, favorite: view.type === "favorites" });
    if (!rec) { alert("You've reached the " + store.templateLimit() + "-template limit on the free plan. Delete one to add more."); return; }
    selectedId = rec.id;
    query = ""; $("#search").value = ""; page = 0;
    if (view.type === "trash") view = { type: "all" };
    render();
    const titleEl = $("#title");
    if (titleEl) { titleEl.focus(); titleEl.select(); }
  }

  // ---- Export / Import (category preserved by name) ---------------------
  function exportTemplates() {
    const cats = store.getCategories();
    const catName = (id) => { const c = cats.find((c) => c.id === id); return c ? c.name : null; };
    const data = {
      app: "canned-responses",
      version: model.SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      templates: store.getAll().map((t) => ({
        title: t.title, body: t.body, shortcut: t.shortcut, tags: t.tags,
        favorite: t.favorite, category: catName(t.folderId)
      }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "canned-responses.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    store.updateSettings({ lastBackupAt: Date.now() });
    renderNudge();
  }

  function onImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        const list = Array.isArray(parsed) ? parsed : (parsed && parsed.templates);
        if (!Array.isArray(list)) throw new Error("no templates array");

        // Resolve category names -> ids, creating any that don't exist yet.
        const byName = new Map(store.getCategories().map((c) => [c.name.toLowerCase(), c.id]));
        for (const t of list) {
          const name = t && typeof t.category === "string" ? t.category.trim() : "";
          if (name && !byName.has(name.toLowerCase())) {
            const cat = await store.createCategory(name);
            byName.set(name.toLowerCase(), cat.id);
          }
        }

        const base = Date.now();
        const recs = list
          .filter((t) => t && (t.title || t.body))
          .map((t, i) => model.createTemplate({
            title: String(t.title || "Untitled"),
            body: sanitize.sanitize(String(t.body || ""), { images: canImages() }),
            shortcut: String(t.shortcut || ""),
            tags: Array.isArray(t.tags) ? t.tags : [],
            favorite: !!t.favorite,
            folderId: (t.category && byName.get(String(t.category).toLowerCase())) || null,
            sortIndex: base + i
          }, base + i));
        if (!recs.length) throw new Error("nothing to import");
        const added = await store.bulkInsert(recs);
        render();
        if (added.length < recs.length) {
          alert("Imported " + added.length + " of " + recs.length + " — the rest hit the " + store.templateLimit() + "-template free-plan limit.");
        } else {
          alert("Imported " + added.length + " template(s).");
        }
      } catch (err) {
        console.error("[CR] import failed", err);
        alert("Import failed — that doesn't look like a valid Canned Responses JSON file.");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();

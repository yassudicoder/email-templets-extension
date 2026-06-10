/* Canned Responses — ui/popup/popup.js
 * Secondary surface: a quick list (favorites first, inherited from store.getAll)
 * with click-to-copy, plus a launcher for the manager. The in-page Alt+A picker
 * is the primary insertion path; copy avoids the popup-focus-loss problem. */
(function () {
  "use strict";
  const { store, sanitize } = globalThis.CR;
  const $ = (s) => document.querySelector(s);
  let query = "";
  let statusTimer = null;

  function visible() {
    let list = store.getAll();           // already favorites-first
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((t) =>
      (t.title + " " + sanitize.toPlainText(t.body)).toLowerCase().includes(q));
    return list;
  }

  function render() {
    const ul = $("#list");
    ul.innerHTML = "";
    const items = visible();
    if (!items.length) {
      ul.innerHTML = `<li class="pempty">${query ? "No matches." : "No templates yet."}</li>`;
      return;
    }
    for (const t of items) {
      const li = document.createElement("li");
      li.className = "prow";
      li.innerHTML = `<span class="pstar">${t.favorite ? "★" : ""}</span><span class="ptitle"></span>`;
      li.querySelector(".ptitle").textContent = t.title || "Untitled";
      li.title = sanitize.toPlainText(t.body);
      li.addEventListener("click", () => copyTemplate(t));
      ul.appendChild(li);
    }
  }

  async function copyTemplate(t) {
    const text = sanitize.toPlainText(t.body);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied — paste with Ctrl+V");
    } catch (e) {
      console.error("[CR] popup copy failed", e);
      setStatus("Copy failed");
    }
  }

  function setStatus(msg) {
    const el = $("#status");
    el.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { el.textContent = ""; }, 1800);
  }

  $("#manage").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  $("#export").addEventListener("click", () => {
    const model = globalThis.CR.model;
    const data = {
      app: "canned-responses", version: model.SCHEMA_VERSION, exportedAt: new Date().toISOString(),
      templates: store.getAll().map((t) => ({ title: t.title, body: t.body, shortcut: t.shortcut, tags: t.tags, favorite: t.favorite }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "canned-responses.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    store.updateSettings({ lastBackupAt: Date.now() });   // backed up -> stops the nudge
    setStatus("Backup downloaded");
  });

  store.init().then(() => {
    const s = store.getSettings();
    globalThis.CR.theme.applyToDocument((s && s.theme) || "system");
    if (s && s.hotkey && $("#hk")) $("#hk").textContent = s.hotkey;
    $("#search").addEventListener("input", (e) => { query = e.target.value; render(); });
    render();
  }).catch((e) => console.error("[CR] popup store init failed", e));
})();

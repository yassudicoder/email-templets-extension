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
      ul.innerHTML = `<li class="pempty">${query ? CR.i18n.t("empty_no_matches") : CR.i18n.t("popup_empty_no_templates")}</li>`;
      return;
    }
    for (const t of items) {
      const li = document.createElement("li");
      li.className = "prow";
      li.innerHTML = `<span class="pstar">${t.favorite ? "★" : ""}</span><span class="ptitle"></span>`;
      li.querySelector(".ptitle").textContent = t.title || CR.i18n.t("template_untitled");
      li.title = sanitize.toPlainText(t.body);
      li.addEventListener("click", () => copyTemplate(t));
      ul.appendChild(li);
    }
  }

  async function copyTemplate(t) {
    const text = sanitize.toPlainText(t.body);
    try {
      await navigator.clipboard.writeText(text);
      setStatus(CR.i18n.t("popup_status_copied"));
    } catch (e) {
      console.error("[CR] popup copy failed", e);
      setStatus(CR.i18n.t("popup_status_copy_failed"));
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
    setStatus(CR.i18n.t("popup_status_backup_downloaded"));
  });

  store.init().then(() => {
    CR.i18n.localize(document);
    const s = store.getSettings();
    globalThis.CR.theme.applyToDocument((s && s.theme) || "system");
    // Localize the hint while preserving the runtime hotkey in #hk: split the
    // message on its baked-in "Alt+A" and rebuild around the existing <b id="hk">.
    const hint = $(".pophint"), hk = $("#hk");
    if (hint && hk) {
      const parts = CR.i18n.t("popup_hint").split("Alt+A");
      hint.textContent = "";
      hint.appendChild(document.createTextNode(parts[0] != null ? parts[0] : ""));
      hint.appendChild(hk);
      hint.appendChild(document.createTextNode(parts.slice(1).join("Alt+A")));
    }
    if (s && s.hotkey && $("#hk")) $("#hk").textContent = s.hotkey;
    $("#search").addEventListener("input", (e) => { query = e.target.value; render(); });
    render();
  }).catch((e) => console.error("[CR] popup store init failed", e));
})();

/* Canned Responses — content/content.js
 * Orchestrator: hotkey -> capture caret -> picker (from store) -> insert.
 * The content script does the real work; the service worker only routes the
 * Ctrl/Cmd+J command here. Runs in every frame (all_frames) so iframe-hosted
 * editors are covered — only the focused frame acts. */
(function (g) {
  "use strict";
  if (g.__CR_CONTENT__) return;          // idempotent per frame
  g.__CR_CONTENT__ = true;

  const NS = g.CR;
  const { store, inserter, picker, surfaces } = NS;

  // True only while this content script's extension context is still valid.
  // After an extension reload/update, orphaned scripts in open tabs must NOT
  // call chrome.* (it throws "Extension context invalidated").
  function alive() { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } }

  // Hydrate this frame's in-memory cache; storage.onChanged keeps it fresh.
  store.init()
    .then(() => {
      const s = store.getSettings();
      if (s && s.hotkey) hotkeySpec = parseHotkey(s.hotkey);
      if (CR.i18n) CR.i18n.setLocale((s && s.locale) || "auto");   // in-page UI language
    })
    .catch((e) => console.error("[CR] store init failed", e));

  // Keep the page-level hotkey + in-page UI language in sync with the settings.
  store.subscribe((db) => {
    if (db && db.settings && db.settings.hotkey) hotkeySpec = parseHotkey(db.settings.hotkey);
    if (CR.i18n && db && db.settings) CR.i18n.setLocale(db.settings.locale || "auto");
  });

  // ---- Hotkey parsing (default Alt+A; not browser-reserved, so page keydown
  // can claim it directly — no dependence on chrome.commands binding). --------
  function parseHotkey(str) {
    const spec = { alt: false, ctrl: false, meta: false, shift: false, code: null };
    for (const raw of String(str || "Alt+A").split("+")) {
      const p = raw.trim().toLowerCase();
      if (p === "alt" || p === "option") spec.alt = true;
      else if (p === "ctrl" || p === "control") spec.ctrl = true;
      else if (p === "cmd" || p === "command" || p === "meta") spec.meta = true;
      else if (p === "shift") spec.shift = true;
      else if (/^[a-z]$/.test(p)) spec.code = "Key" + p.toUpperCase();
      else if (/^[0-9]$/.test(p)) spec.code = "Digit" + p;
    }
    return spec;
  }
  function matchHotkey(e, s) {
    return !!s.code && e.code === s.code &&
      e.altKey === s.alt && e.ctrlKey === s.ctrl && e.metaKey === s.meta && e.shiftKey === s.shift;
  }
  let hotkeySpec = parseHotkey("Alt+A");

  // Route 1 (primary): page keydown — synchronous caret capture, works in the
  // focused frame, and reliably claims Alt+A.
  window.addEventListener("keydown", (e) => {
    if (!matchHotkey(e, hotkeySpec)) return;
    e.preventDefault();
    e.stopPropagation();
    trigger();
  }, true);

  function currentSurface() {
    for (const key of Object.keys(surfaces || {})) {
      if (surfaces[key].matches()) return surfaces[key];
    }
    return null;
  }
  // Surface label for analytics ("gmail" | "linkedin" | "other") — no content.
  function surfaceName() {
    for (const key of Object.keys(surfaces || {})) {
      if (surfaces[key].matches && surfaces[key].matches()) return key;
    }
    return "other";
  }
  function track(event, props) { if (NS.analytics) NS.analytics.capture(event, props); }

  async function openPicker(ctx) {
    if (picker.isOpen()) return;
    await store.init();
    const templates = store.getAll();
    const surface = currentSurface();
    const preferPlainText = !!(surface && surface.preferPlainText());
    track("picker_opened", { surface: surfaceName() });

    picker.open(templates, {
      onInsert: (html) => {
        if (ctx) {
          const ok = inserter.insert(ctx, html, { preferPlainText });
          if (ok) { cue(CR.i18n.t("toast_inserted")); track("template_inserted", { surface: surfaceName(), mode: "insert" }); }
          else console.warn("[CR] insertion returned false");
        } else if (navigator.clipboard) {
          // Opened from the toolbar button with no focused field -> copy instead.
          const text = NS.sanitize ? NS.sanitize.toPlainText(html) : html;
          navigator.clipboard.writeText(text).then(() => { cue(CR.i18n.t("toast_copied")); track("template_inserted", { surface: surfaceName(), mode: "copy" }); }).catch((e) => console.warn("[CR] copy failed", e));
        }
      }
    });
  }

  // Quiet "it worked" cue — the trust signal for an action fired all day long.
  let cueEl, cueTimer;
  function cue(msg) {
    if (!cueEl) {
      cueEl = document.createElement("div");
      cueEl.style.cssText = "all:initial;position:fixed;left:50%;bottom:22px;transform:translateX(-50%);"
        + "z-index:2147483647;font:12px system-ui,-apple-system,sans-serif;color:#fff;background:rgba(22,163,74,.96);"
        + "padding:6px 12px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.25);pointer-events:none;"
        + "opacity:0;transition:opacity .12s;";
      document.documentElement.appendChild(cueEl);
    }
    cueEl.textContent = msg;
    cueEl.style.opacity = "1";
    clearTimeout(cueTimer);
    cueTimer = setTimeout(() => { if (cueEl) cueEl.style.opacity = "0"; }, 1100);
  }

  // Alt+A / command: always opens the picker. If an editable is focused -> insert
  // mode; otherwise (browsing the inbox) it opens in browse/copy mode.
  function trigger() {
    if (!alive()) return;   // orphaned after an extension reload — ignore until tab refresh
    openPicker(inserter.captureContext());
  }

  // Exposed for the in-Gmail button (surfaces/gmail.js) and the picker.
  NS.app = {
    open: trigger,                                             // picker (insert/copy)
    openPanel: () => { if (NS.manager) NS.manager.open(); },   // in-page manage panel
    newTemplate: (pos) => { if (NS.manager) NS.manager.openNew(pos); },   // new template
    editTemplate: (id, pos) => { if (NS.manager) NS.manager.openEdit(id, pos); }, // edit a template
    openManager: () => { if (alive()) try { chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }, () => void chrome.runtime.lastError); } catch (e) {} }
  };
  NS.ui = { cue };   // shared "it worked" cue (used by the expander too)

  // Route 2 (secondary): the SW relays the chrome.commands hotkey (the official,
  // rebindable path shown in chrome://extensions/shortcuts). Only the focused
  // frame acts. trigger()'s isOpen guard prevents double-firing with Route 1.
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === "OPEN_PICKER" && document.hasFocus()) trigger();
    // Right-click "Save selection" -> rich capture (content/capture.js). Delivered
    // to every frame; only the one holding the live selection actually saves.
    if (msg.type === "SAVE_SELECTION" && NS.capture) NS.capture.save();
  });
})(globalThis);

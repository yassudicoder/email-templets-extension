/* Canned Responses — content/surfaces/gmail.js
 * Thin Gmail adapter: (1) surface policy (rich text OK), and (2) our injected
 * affordances — the in-compose button (primary), the demoted top-bar button, a
 * floating fallback, and the message "Copy" pill.
 *
 * Every node we render is FULLY EVENT-ISOLATED (see isolate()) so a click can
 * never reach Gmail's delegated (jsaction-style) handlers — that container
 * routing is what used to open Google tools from our button. All of this is
 * NON-LOAD-BEARING: if Gmail reshuffles its DOM, Alt+A and the insertion engine
 * keep working; only these buttons are affected, and only this file needs a fix. */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});
  NS.surfaces = NS.surfaces || {};
  NS.surfaces.gmail = {
    name: "gmail",
    matches: () => location.hostname === "mail.google.com",
    preferPlainText: () => false,
    threadContext: () => threadContext()
  };

  // The open conversation, for "Write with AI" — read ONLY when the user asks for an
  // AI draft (never in the background). Expanded messages are div.adn, each with a
  // sender (span.gD[email]) and a body (div.a3s). innerText skips Gmail's hidden
  // quoted history, so each body is just that message. Returns null if no thread.
  function threadContext() {
    const msgs = [];
    for (const m of Array.from(document.querySelectorAll("div.adn"))) {
      const body = m.querySelector("div.a3s");
      if (!body || body.closest("[contenteditable='true']")) continue;
      const text = (body.innerText || "").trim();
      if (!text) continue;
      const s = m.querySelector("span.gD");
      const name = s ? (s.getAttribute("name") || s.textContent || "").trim() : "";
      const email = s ? (s.getAttribute("email") || "").trim() : "";
      msgs.push({ from: email ? (name ? name + " <" + email + ">" : email) : name, text: text.slice(0, 4000) });
    }
    if (!msgs.length) return null;
    const h = document.querySelector("h2.hP");
    return { subject: h ? h.textContent.trim() : "", messages: msgs.slice(-6) };
  }

  // Only the top frame, only Gmail. (Content scripts also run in Gmail's utility
  // iframes; we don't want a button in those.)
  if (g.top !== g || location.hostname !== "mail.google.com") return;

  const BTN_ID = "cr-gmail-btn";
  const FLOAT_ID = "cr-gmail-fab";
  const ICON =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
    ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  // Distinct, Material-weight "template" glyph (a card with text lines) for the
  // in-compose button — reads as "insert a saved template" and doesn't clash with
  // Gmail's own speech-bubble comment icon that already sits in that toolbar row.
  const ICON_TEMPLATE =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
    ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="4" y="3" width="16" height="18" rx="2.5"/><line x1="8" y1="8" x2="16" y2="8"/>' +
    '<line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/></svg>';

  // ---- Event isolation ---------------------------------------------------
  // The one rule that kills the "opens Google tools" bug: nothing we render may
  // let an event reach Gmail's delegated handlers. We listen in the CAPTURE phase
  // on our own node for every pointer/mouse/keyboard event and stop it dead, so it
  // never bubbles up to the jsaction handler on a Gmail ancestor. mousedown also
  // keeps its preventDefault so the compose caret is never stolen. Left-click /
  // Enter / Space call onActivate.
  function isolate(el, onActivate) {
    const types = ["pointerdown", "mousedown", "mouseup", "click", "auxclick", "keydown"];
    types.forEach((type) => {
      el.addEventListener(type, (e) => {
        e.stopImmediatePropagation();                 // never reach Gmail's delegated handlers
        if (type === "mousedown") { e.preventDefault(); return; }   // keep the compose caret
        if (type === "click") {
          if (e.button === 0) { e.preventDefault(); onActivate(e); }
        } else if (type === "keydown") {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(e); }
        }
      }, true);                                       // CAPTURE phase
    });
  }

  // ---- Locale-proof matching of Gmail's OWN UI text ----------------------
  // Gmail's "Reply"/"Forward" labels and the header aria-labels are localized,
  // so English-only anchors silently failed for 6 of our 7 locales. We match
  // against the UNION of the localized word lists bundled in CR.LOCALES (the
  // active document language is always a subset of that union), so detection
  // works regardless of the Gmail display language.
  const _wordCache = {};
  function localeVals(key) {
    if (_wordCache[key]) return _wordCache[key];
    const out = [], seen = new Set();
    const L = g.CR && g.CR.LOCALES;
    if (L) for (const lang of Object.keys(L)) {
      const e = L[lang] && L[lang][key];
      const v = e && e.message && String(e.message).trim();
      if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
    }
    // Only cache once the locales bundle is actually loaded.
    if (out.length) _wordCache[key] = out;
    return out;
  }
  function localeSet(key) { return new Set(localeVals(key).map((s) => s.toLowerCase())); }
  function attrEsc(s) { return String(s).replace(/["\\]/g, "\\$&"); }

  // ---- Top-bar (header) button — DEMOTED secondary entry point -----------
  function makeButton() {
    const btn = document.createElement("div");
    btn.id = BTN_ID;
    btn.setAttribute("role", "button");
    btn.setAttribute("tabindex", "0");
    btn.setAttribute("aria-label", CR.i18n.t("surface_btn_aria_label"));
    btn.title = CR.i18n.t("gmail_btn_title");
    btn.innerHTML = ICON;
    btn.style.cssText = [
      "width:40px", "height:40px", "margin:0 2px", "border-radius:50%",
      "display:inline-flex", "align-items:center", "justify-content:center",
      "cursor:pointer", "color:#5f6368", "user-select:none", "flex:0 0 auto",
      "transition:background .15s"
    ].join(";");
    btn.addEventListener("mouseenter", () => { btn.style.background = "rgba(60,64,67,.08)"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });
    isolate(btn, openManagePanel);   // header icon -> manage panel
    return btn;
  }

  function openManagePanel() {
    const app = g.CR && g.CR.app;
    if (app) (app.openPanel || app.open)();
  }

  // Aria-label anchors for the header cluster, unioned across locales.
  function ariaWords() {
    return [].concat(
      localeVals("gmail_aria_support"), localeVals("gmail_aria_help"),
      localeVals("gmail_aria_settings"), localeVals("gmail_aria_google_apps")
    );
  }
  // Anchor to the Support/Help/Settings/Apps icons by aria-label (stable far
  // longer than Gmail's obfuscated class names), case-insensitively and in any
  // of the languages we ship.
  function findAnchor() {
    for (const w of ariaWords()) {
      const el = document.querySelector('[aria-label*="' + attrEsc(w) + '" i]');
      if (el) return el;
    }
    return null;
  }

  // From an anchor icon, walk up to the container that holds the whole top-right
  // icon cluster (the smallest ancestor carrying >=2 of the known header icons).
  // We insert our button as a sibling BEFORE that cluster — never inside the
  // Google-apps wrapper, which is what routed our clicks into Google tools.
  function headerCluster(anchor) {
    const marks = ariaWords().map((w) => '[aria-label*="' + attrEsc(w) + '" i]');
    let node = anchor;
    for (let i = 0; i < 8 && node.parentElement; i++) {
      node = node.parentElement;
      let count = 0;
      for (const m of marks) { if (node.querySelector(m)) count++; if (count >= 2) break; }
      if (count >= 2) return node;
    }
    return anchor.parentElement;
  }

  // Last-resort floating button — used ONLY if the inline anchor can't be found
  // (a Gmail layout/locale we don't match). It doesn't depend on Gmail's DOM, so
  // it can't disappear. Auto-removed once the inline spot is found again.
  function injectFloating() {
    if (document.getElementById(FLOAT_ID)) return;
    const fab = document.createElement("div");
    fab.id = FLOAT_ID;
    fab.setAttribute("role", "button");
    fab.setAttribute("tabindex", "0");
    fab.setAttribute("aria-label", CR.i18n.t("surface_btn_aria_label"));
    fab.title = CR.i18n.t("gmail_btn_title");
    fab.innerHTML = ICON;
    fab.style.cssText = "position:fixed;bottom:22px;right:22px;width:48px;height:48px;border-radius:50%;"
      + "background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;"
      + "box-shadow:0 4px 16px rgba(0,0,0,.32);z-index:2147483646;";
    isolate(fab, openManagePanel);
    document.documentElement.appendChild(fab);
  }

  let anchorMisses = 0;
  function tryInject() {
    if (document.getElementById(BTN_ID)) { anchorMisses = 0; return; }   // already present
    const anchor = findAnchor();
    if (!anchor) { if (++anchorMisses >= 8) injectFloating(); return; }  // give up on inline -> fallback
    anchorMisses = 0;
    const fab = document.getElementById(FLOAT_ID);
    if (fab) fab.remove();                                                // found the real spot -> drop fallback
    const cluster = headerCluster(anchor);
    const parent = cluster && cluster.parentElement;
    if (!parent) return;
    parent.insertBefore(makeButton(), cluster);                          // sibling BEFORE the cluster
  }

  function removeHeaderButton() {
    const b = document.getElementById(BTN_ID); if (b) b.remove();
    const f = document.getElementById(FLOAT_ID); if (f) f.remove();
    anchorMisses = 0;
  }

  // Header button is opt-out (settings.showHeaderButton, default true). Read
  // defensively: getSettings() throws before store.init() — assume ON until then.
  function headerEnabled() {
    try { const s = NS.store.getSettings(); return s ? s.showHeaderButton !== false : true; }
    catch (e) { return true; }
  }

  // ---- In-compose button — the PRIMARY, locale-independent entry point ----
  // Detected purely by the editor's ARIA contract (contenteditable textbox),
  // which is identical in every language and covers popup, full-screen, and
  // inline-reply composes. We render our own absolutely-positioned overlay pinned
  // to the compose card (never interleaved into Gmail's toolbar cells), so it can
  // never trip the container-routing bug.
  const composeBtns = new WeakMap();   // editor element -> our button

  function positionedAncestor(el) {
    let n = el.parentElement;
    for (let i = 0; i < 15 && n && n !== document.body; i++) {
      const pos = getComputedStyle(n).position;
      if (pos && pos !== "static") return n;
      n = n.parentElement;
    }
    return null;   // no positioned card found -> skip (Alt+A still works)
  }

  function makeComposeButton(editor, mode) {
    const btn = document.createElement("div");
    btn.setAttribute("data-cr-compose", "1");
    btn.setAttribute("role", "button");
    btn.setAttribute("tabindex", "0");
    btn.setAttribute("aria-label", CR.i18n.t("surface_btn_aria_label"));
    btn.title = CR.i18n.t("gmail_btn_title");
    btn.innerHTML = ICON_TEMPLATE;
    if (mode === "overlay") {
      // Fallback: a floating pill pinned to the compose card, used only when the
      // bottom toolbar can't be located.
      btn._crOverlay = true;
      btn.style.cssText = [
        "position:absolute", "right:14px", "bottom:52px", "width:32px", "height:32px",
        "border-radius:50%", "display:flex", "align-items:center", "justify-content:center",
        "background:#2563eb", "color:#fff", "cursor:pointer", "user-select:none",
        "box-shadow:0 2px 8px rgba(0,0,0,.28)", "z-index:2147483000"
      ].join(";");
      btn.addEventListener("mouseenter", () => { btn.style.background = "#1d4fd7"; });
      btn.addEventListener("mouseleave", () => { btn.style.background = "#2563eb"; });
    } else {
      // Primary: a native-looking icon sitting inline in Gmail's compose bottom
      // toolbar. Size/colour/hover are matched to a real neighbour icon at
      // placement time (see integrateWithBar) so it tracks Gmail's own light/dark
      // theme exactly rather than hard-coding a grey.
      btn.style.cssText = [
        "width:40px", "height:40px", "margin:0 2px", "border-radius:50%",
        "display:inline-flex", "align-items:center", "justify-content:center",
        "cursor:pointer", "color:#5f6368", "user-select:none", "flex:0 0 auto",
        "vertical-align:middle", "transition:background .15s", "box-sizing:border-box"
      ].join(";");
      btn.addEventListener("mouseenter", () => { btn.style.background = btn._crHover || "rgba(60,64,67,.08)"; });
      btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });
    }
    isolate(btn, () => activateCompose(editor));
    return btn;
  }

  // Make the toolbar button visually identical to Gmail's own icons: copy a real
  // neighbour icon's computed colour and box size, and pick a hover tint that
  // suits the current (light/dark) theme. Runs after the button is in the DOM.
  function relLuminance(rgb) {
    const m = String(rgb).match(/\d+(\.\d+)?/g);
    if (!m || m.length < 3) return 0;
    return (0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2]) / 255;
  }
  function integrateWithBar(btn, bar) {
    const sib = Array.from(bar.children).find((c) =>
      c !== btn && c.getAttribute && c.getAttribute("role") === "button" &&
      (c.textContent || "").trim() === "");
    if (!sib) return;
    const cs = getComputedStyle(sib);
    if (cs.color) btn.style.color = cs.color;
    const w = sib.offsetWidth, h = sib.offsetHeight;
    if (w >= 24 && w <= 56) btn.style.width = w + "px";
    if (h >= 24 && h <= 56) btn.style.height = h + "px";
    btn._crHover = relLuminance(cs.color) > 0.5 ? "rgba(255,255,255,.12)" : "rgba(60,64,67,.09)";
  }

  // Open the picker targeting THIS compose. Ensure the caret is inside the editor
  // so the insertion engine writes to the right one even with several composes open.
  function activateCompose(editor) {
    try {
      const sel = window.getSelection();
      const inside = sel && sel.rangeCount &&
        editor.contains(sel.getRangeAt(0).commonAncestorContainer);
      editor.focus();
      if (!inside) {
        const r = document.createRange();
        r.selectNodeContents(editor);
        r.collapse(false);                 // caret at end
        sel.removeAllRanges();
        sel.addRange(r);
      }
    } catch (e) { /* best effort — app.open still captures the active editable */ }
    const app = g.CR && g.CR.app;
    if (app && app.open) app.open();
  }

  function placeComposeBtn(btn, editor) {
    const card = btn.parentElement;
    if (!card) return;
    const cardR = card.getBoundingClientRect();
    const edR = editor.getBoundingClientRect();
    // Distance from the card's bottom to the editor's bottom == the Send-row
    // chrome; sit just above it. Fall back to a fixed offset if degenerate.
    let bottom = Math.round(cardR.bottom - edR.bottom) + 8;
    if (!isFinite(bottom) || bottom < 8 || bottom > 220) bottom = 52;
    btn.style.bottom = bottom + "px";
  }

  function isVisible(el) {
    if (!el.isConnected) return false;
    if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return false;
    return el.getBoundingClientRect().height >= 24;
  }

  // Find the compose's bottom action bar — the container that directly holds the
  // insert icons (attach / link / emoji …). Locale-independent: those are
  // role="button" nodes with an aria-label and NO visible text (Send and the
  // B/I/U buttons carry text, so they're excluded). When both the formatting row
  // and the send row qualify, take the LOWEST one on screen — that's the send bar.
  function composeIconBar(scope) {
    const icons = Array.from(scope.querySelectorAll('[role="button"]')).filter((b) =>
      b.getAttribute("aria-label") && (b.textContent || "").trim() === "");
    if (icons.length < 3) return null;
    const counts = new Map();
    for (const b of icons) { const p = b.parentElement; if (p) counts.set(p, (counts.get(p) || 0) + 1); }
    let best = null, bestBottom = -Infinity;
    for (const [p, n] of counts) {
      if (n < 3) continue;
      const bottom = p.getBoundingClientRect().bottom;
      if (bottom > bestBottom) { bestBottom = bottom; best = p; }
    }
    return best;
  }

  // The compose container that holds both the editor and its bottom toolbar.
  function composeScope(editor) {
    return editor.closest('[role="dialog"]') || positionedAncestor(editor);
  }

  function syncComposeButtons() {
    document.querySelectorAll('div[contenteditable="true"][role="textbox"]').forEach((editor) => {
      if (!isVisible(editor)) return;
      let btn = composeBtns.get(editor);
      // Keep the overlay fallback positioned; the inline toolbar button flows on its own.
      if (btn && btn.isConnected) { if (btn._crOverlay) placeComposeBtn(btn, editor); return; }
      const scope = composeScope(editor);
      if (!scope) return;
      const bar = composeIconBar(scope);
      if (bar) {                                     // primary: inline in the bottom toolbar
        btn = makeComposeButton(editor, "bar");
        bar.appendChild(btn);
        integrateWithBar(btn, bar);                  // match Gmail's icon colour/size/theme
      } else {                                       // fallback: floating overlay on the card
        btn = makeComposeButton(editor, "overlay");
        scope.appendChild(btn);
        placeComposeBtn(btn, editor);
      }
      composeBtns.set(editor, btn);
    });
  }

  // ---- "Copy" button in the message Reply / Forward action row -----------
  // Copies the FULL message (formatting, colours, text AND images) to the
  // clipboard. Anchored to the inline Reply/Forward buttons + the .a3s body;
  // non-load-bearing (if Gmail changes markup, only this button is affected).
  // Emails style text via CSS classes / <style> blocks, which DON'T survive the
  // clipboard. So we inline the computed font/colour/etc. onto each element — the
  // copy then pastes identically and stays editable in that exact font & colour.
  const STYLE_PROPS = ["font-family", "font-size", "font-weight", "font-style", "color",
    "background-color", "text-align", "line-height", "letter-spacing", "text-transform"];

  function inlineTree(src, clone) {
    if (src.nodeType === 1) {
      let css = clone.getAttribute("style") || "";
      const cs = getComputedStyle(src);
      for (const p of STYLE_PROPS) {
        const v = cs.getPropertyValue(p);
        if (!v) continue;
        if (p === "background-color" && (v === "rgba(0, 0, 0, 0)" || v === "transparent")) continue;
        css += p + ":" + v + ";";
      }
      if (css) clone.setAttribute("style", css);
    }
    const sc = src.childNodes, cc = clone.childNodes;
    for (let i = 0; i < sc.length && i < cc.length; i++) inlineTree(sc[i], cc[i]);
  }

  function doCopy(body) {
    const clone = body.cloneNode(true);              // images come along via the clone
    try { inlineTree(body, clone); } catch (e) { /* best-effort styling */ }
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-99999px;top:0;";
    holder.appendChild(clone);
    document.body.appendChild(holder);
    const range = document.createRange();
    range.selectNodeContents(clone);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    sel.removeAllRanges();
    holder.remove();
    if (ok) toast(CR.i18n.t("toast_email_copied_success"), CR.i18n.t("toast_action_open_editor"), openEditorForPaste);
    else toast(CR.i18n.t("toast_copy_failed"));
  }

  // Open the full editor on a fresh template, ready to paste the copied email.
  async function openEditorForPaste() {
    try { if (g.CR && g.CR.store) await g.CR.store.updateSettings({ pasteIntoNew: true }); } catch (e) {}
    if (g.CR && g.CR.app) g.CR.app.openManager();
  }

  // Walk up from the Reply/Forward row to the message container, find its body.
  function emailBodyFor(el) {
    let node = el;
    for (let i = 0; i < 20 && node; i++) {
      if (node.querySelector) { const b = node.querySelector("div.a3s"); if (b) return b; }
      node = node.parentElement;
    }
    return document.querySelector("div.a3s");
  }

  // Our own pill (own styling + full isolation) so it can't trigger Gmail's
  // delegated handlers.
  function makeCopyPill(body) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("data-cr-copy", "1");
    b.setAttribute("aria-label", CR.i18n.t("gmail_copy_btn_aria_label"));
    b.title = CR.i18n.t("gmail_copy_btn_title");
    b.textContent = CR.i18n.t("gmail_copy_btn_label");
    b.style.cssText = "margin:0 0 0 8px;padding:7px 16px;border:1px solid #dadce0;border-radius:18px;"
      + "background:#fff;color:#3c4043;font:500 14px system-ui,-apple-system,sans-serif;cursor:pointer;"
      + "vertical-align:middle;line-height:1.4;";
    b.addEventListener("mouseenter", () => { b.style.background = "#f6f9fe"; });
    b.addEventListener("mouseleave", () => { b.style.background = "#fff"; });
    isolate(b, () => doCopy(body));
    return b;
  }

  function nearbyHasReply(el, replySet) {
    let n = el.parentElement, d = 0;
    while (n && d < 3) {
      const r = Array.from(n.querySelectorAll('.ams,[role="button"],[role="link"],button'))
        .find((c) => replySet.has((c.textContent || "").trim().toLowerCase()));
      if (r) return true;
      n = n.parentElement; d++;
    }
    return false;
  }

  function injectReplyButtons() {
    // Cheap early-out: no open email -> nothing to do (avoids scanning the whole
    // DOM on every mutation while just browsing the inbox).
    if (!document.querySelector("div.a3s")) return;
    const fwdSet = localeSet("gmail_word_forward");
    const replySet = localeSet("gmail_word_reply");
    if (!fwdSet.size) return;   // locales not loaded yet
    // The inline pills are text "Reply"/"Forward" (no aria-label) — anchor on text
    // in any of the languages we ship.
    document.querySelectorAll('.ams,[role="button"],[role="link"],button').forEach((fwd) => {
      if (!fwdSet.has((fwd.textContent || "").trim().toLowerCase())) return;       // the inline pill
      const next = fwd.nextElementSibling;
      if (next && next.getAttribute && next.getAttribute("data-cr-copy")) return;  // already added
      if (!nearbyHasReply(fwd, replySet)) return;                                   // it's the action row
      const body = emailBodyFor(fwd);
      if (!body) return;
      fwd.parentNode.insertBefore(makeCopyPill(body), fwd.nextSibling);
    });
  }

  let toastEl, toastTimer;
  function toast(msg, actionLabel, actionFn) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.style.cssText = "all:initial;position:fixed;left:50%;bottom:26px;transform:translateX(-50%);"
        + "z-index:2147483647;font:13px system-ui,sans-serif;color:#fff;background:#16a34a;padding:10px 14px;"
        + "border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.3);display:flex;align-items:center;gap:12px;";
      document.documentElement.appendChild(toastEl);
    }
    toastEl.textContent = "";
    const span = document.createElement("span");
    span.textContent = msg;
    toastEl.appendChild(span);
    if (actionLabel && actionFn) {
      const a = document.createElement("a");
      a.textContent = actionLabel;
      a.style.cssText = "color:#fff;text-decoration:underline;cursor:pointer;font-weight:600;white-space:nowrap;";
      a.addEventListener("click", actionFn);
      toastEl.appendChild(a);
    }
    toastEl.style.display = "flex";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.style.display = "none"; }, actionLabel ? 6000 : 2600);
  }

  // Gmail loads async and re-renders on SPA nav, so keep the buttons present —
  // debounced so we don't run on Gmail's very chatty DOM mutations.
  let scheduled = false;
  function ensure() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      try {
        if (headerEnabled()) tryInject(); else removeHeaderButton();
        syncComposeButtons();
        injectReplyButtons();
      } catch (e) { /* contained */ }
    }, 250);
  }

  function start() {
    ensure();
    new MutationObserver(ensure).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(ensure, 2000);   // safety net: re-inject if a Gmail re-render removed our button
    // React live to settings (e.g. toggling the header button off in options).
    try { if (NS.store && NS.store.subscribe) NS.store.subscribe(ensure); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})(globalThis);

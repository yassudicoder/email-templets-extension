/* Canned Responses — content/surfaces/gmail.js
 * Thin Gmail adapter: (1) surface policy (rich text OK), and (2) the OPTIONAL
 * inline top-bar button.
 *
 * The button is the one Gmail-DOM-dependent piece in the whole product. It is
 * ISOLATED here and NON-LOAD-BEARING on purpose: if Gmail changes its markup and
 * injection fails, Alt+A and the insertion engine keep working — only this
 * button is affected, and only this file needs a fix. */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});
  NS.surfaces = NS.surfaces || {};
  NS.surfaces.gmail = {
    name: "gmail",
    matches: () => location.hostname === "mail.google.com",
    preferPlainText: () => false
  };

  // Only the top frame, only Gmail. (Content scripts also run in Gmail's utility
  // iframes; we don't want a button in those.)
  if (g.top !== g || location.hostname !== "mail.google.com") return;

  const BTN_ID = "cr-gmail-btn";
  const ICON =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
    ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  function makeButton() {
    const btn = document.createElement("div");
    btn.id = BTN_ID;
    btn.setAttribute("role", "button");
    btn.setAttribute("tabindex", "0");
    btn.setAttribute("aria-label", "Canned Responses (Alt+A)");
    btn.title = "Canned Responses — insert a template (Alt+A)";
    btn.innerHTML = ICON;
    btn.style.cssText = [
      "width:40px", "height:40px", "margin:0 2px", "border-radius:50%",
      "display:inline-flex", "align-items:center", "justify-content:center",
      "cursor:pointer", "color:#5f6368", "user-select:none", "flex:0 0 auto",
      "transition:background .15s"
    ].join(";");
    btn.addEventListener("mouseenter", () => { btn.style.background = "rgba(60,64,67,.08)"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });
    // Keep the compose focused so the engine can capture the live caret.
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    const open = (e) => {
      e.preventDefault();
      const app = g.CR && g.CR.app;        // late-bound: content.js defines this
      if (app) (app.openPanel || app.open)();   // icon -> manage panel
    };
    btn.addEventListener("click", open);
    btn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") open(e); });
    return btn;
  }

  // Anchor to the Support/Help/Settings icons by aria-label (stable far longer
  // than Gmail's obfuscated class names).
  function findAnchor() {
    return document.querySelector('[aria-label="Support"]')
        || document.querySelector('[aria-label="Help"]')
        || document.querySelector('[aria-label="Settings"]')
        || document.querySelector('[aria-label*="Google apps" i]');
  }

  // Last-resort floating button — used ONLY if the inline anchor can't be found
  // (a Gmail layout/locale we don't match). It doesn't depend on Gmail's DOM, so
  // it can't disappear. Auto-removed once the inline spot is found again.
  const FLOAT_ID = "cr-gmail-fab";
  function injectFloating() {
    if (document.getElementById(FLOAT_ID)) return;
    const fab = document.createElement("div");
    fab.id = FLOAT_ID;
    fab.setAttribute("role", "button");
    fab.setAttribute("aria-label", "Canned Responses (Alt+A)");
    fab.title = "Canned Responses — insert a template (Alt+A)";
    fab.innerHTML = ICON;
    fab.style.cssText = "position:fixed;bottom:22px;right:22px;width:48px;height:48px;border-radius:50%;"
      + "background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;"
      + "box-shadow:0 4px 16px rgba(0,0,0,.32);z-index:2147483646;";
    fab.addEventListener("mousedown", (e) => e.preventDefault());
    fab.addEventListener("click", (e) => { e.preventDefault(); const app = g.CR && g.CR.app; if (app) (app.openPanel || app.open)(); });
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
    const wrapper = anchor.closest("div") || anchor;
    const parent = wrapper.parentElement;
    if (!parent) return;
    parent.insertBefore(makeButton(), wrapper);
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
    if (ok) toast("Copied email — paste with Ctrl+V (font, colours & images kept)", "Open editor →", openEditorForPaste);
    else toast("Copy failed — try selecting manually");
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

  // Our own pill (own styling) so it can't trigger Gmail's delegated handlers.
  function makeCopyPill() {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("data-cr-copy", "1");
    b.setAttribute("aria-label", "Copy email");
    b.title = "Copy this email with formatting & images";
    b.textContent = "Copy";
    b.style.cssText = "margin:0 0 0 8px;padding:7px 16px;border:1px solid #dadce0;border-radius:18px;"
      + "background:#fff;color:#3c4043;font:500 14px system-ui,-apple-system,sans-serif;cursor:pointer;"
      + "vertical-align:middle;line-height:1.4;";
    b.addEventListener("mouseenter", () => { b.style.background = "#f6f9fe"; });
    b.addEventListener("mouseleave", () => { b.style.background = "#fff"; });
    b.addEventListener("mousedown", (e) => e.preventDefault());
    return b;
  }

  function nearbyHasReply(el) {
    let n = el.parentElement, d = 0;
    while (n && d < 3) {
      const r = Array.from(n.querySelectorAll('.ams,[role="button"],[role="link"],button'))
        .find((c) => (c.textContent || "").trim().toLowerCase() === "reply");
      if (r) return true;
      n = n.parentElement; d++;
    }
    return false;
  }

  function injectReplyButtons() {
    // Cheap early-out: no open email -> nothing to do (avoids scanning the whole
    // DOM on every mutation while just browsing the inbox).
    if (!document.querySelector("div.a3s")) return;
    // The inline pills are text "Reply"/"Forward" (no aria-label) — anchor on text.
    document.querySelectorAll('.ams,[role="button"],[role="link"],button').forEach((fwd) => {
      if ((fwd.textContent || "").trim().toLowerCase() !== "forward") return;     // the inline pill
      const next = fwd.nextElementSibling;
      if (next && next.getAttribute && next.getAttribute("data-cr-copy")) return; // already added
      if (!nearbyHasReply(fwd)) return;                                           // it's the action row
      const body = emailBodyFor(fwd);
      if (!body) return;
      const btn = makeCopyPill();
      btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); doCopy(body); });
      fwd.parentNode.insertBefore(btn, fwd.nextSibling);
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
      try { tryInject(); injectReplyButtons(); } catch (e) { /* contained */ }
    }, 250);
  }

  function start() {
    ensure();
    new MutationObserver(ensure).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(ensure, 2000);   // safety net: re-inject if a Gmail re-render removed our button
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})(globalThis);

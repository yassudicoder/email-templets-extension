/* =============================================================================
 * INSERTION SPIKE — THROWAWAY PROOF-OF-CONCEPT
 * Single goal: prove reliable rich-text caret insertion in Gmail + LinkedIn.
 * No storage, no options page, no entitlements. Three hardcoded templates.
 * Runs in ALL frames (all_frames:true) so iframe-hosted editors are covered:
 * the focused frame is the one that owns the live selection and handles the event.
 * ========================================================================== */

(() => {
  "use strict";

  // Guard against being injected twice into the same frame.
  if (window.__INSERTION_SPIKE__) return;
  window.__INSERTION_SPIKE__ = true;

  // ----- The three hardcoded templates ------------------------------------
  const TEMPLATES = [
    {
      title: "Plain — quick acknowledgement",
      html: "Thanks so much for reaching out — I'll review this and get back to you shortly."
    },
    {
      title: "Rich — bold + link",
      html: 'Good news: your request is approved. <b>Next step</b> is here — ' +
            '<a href="https://example.com/next">complete the form</a>. Thanks!'
    },
    {
      title: "Variable — {first_name}",
      html: "Hi {first_name}, thanks for connecting! I'd love to find 15 minutes to chat."
    }
  ];

  // ----- Captured caret state (the #1 thing naive tools lose) --------------
  // Saved at trigger time, BEFORE the overlay takes focus.
  let saved = null; // { el, range, isCE, doc }
  let overlayOpen = false;

  // ----- Resolve the true focused editable, descending through shadow DOM --
  function deepActiveElement(doc) {
    let el = doc.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
      el = el.shadowRoot.activeElement;
    }
    return el;
  }

  function isTextInput(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      const t = (el.type || "text").toLowerCase();
      return ["text", "search", "url", "email", "tel", "password", ""].includes(t);
    }
    return false;
  }

  function isContentEditable(el) {
    return !!el && el.isContentEditable === true;
  }

  // Capture focus + a CLONED range so we can restore the exact caret later.
  function captureContext() {
    const el = deepActiveElement(document);
    if (isContentEditable(el)) {
      const root = (el.getRootNode && el.getRootNode()) || document;
      const sel = (root.getSelection ? root.getSelection() : null) || window.getSelection();
      let range = null;
      if (sel && sel.rangeCount > 0) {
        range = sel.getRangeAt(0).cloneRange();
      } else {
        // No live selection — place caret at end of the editable.
        range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
      }
      return { el, range, isCE: true };
    }
    if (isTextInput(el)) {
      return {
        el,
        isCE: false,
        selStart: el.selectionStart,
        selEnd: el.selectionEnd
      };
    }
    return null; // nothing editable focused -> no-op
  }

  // ----- HTML helpers ------------------------------------------------------
  function buildFragment(html, doc) {
    // Spike-only: our 3 templates are trusted hardcoded strings. Production
    // would run this through a strict DOMPurify allowlist.
    const tpl = doc.createElement("template");
    tpl.innerHTML = html;
    return tpl.content;
  }

  function htmlToPlainText(html, doc) {
    const div = doc.createElement("div");
    div.innerHTML = html;
    return div.textContent || "";
  }

  // ----- Insertion: contenteditable (Selection/Range, NOT execCommand) -----
  function insertIntoContentEditable(ctx, html) {
    const { el, range } = ctx;
    const doc = el.ownerDocument;
    const win = doc.defaultView || window;

    el.focus();
    const root = (el.getRootNode && el.getRootNode()) || doc;
    const sel = (root.getSelection ? root.getSelection() : null) || win.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    // Let the host editor know an insertion is about to happen (best-effort;
    // synthetic events are untrusted so they don't perform the edit themselves).
    el.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true, cancelable: true, inputType: "insertFromPaste"
    }));

    range.deleteContents();
    const frag = buildFragment(html, doc);
    const lastNode = frag.lastChild;
    range.insertNode(frag);

    // Collapse caret immediately AFTER the inserted content.
    if (lastNode) {
      const after = doc.createRange();
      after.setStartAfter(lastNode);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
    }

    // CRITICAL: fire input so Gmail/LinkedIn's own model picks up the DOM change,
    // otherwise the text can look present but get dropped on Send.
    el.dispatchEvent(new InputEvent("input", {
      bubbles: true, cancelable: false, inputType: "insertFromPaste"
    }));
  }

  // ----- Insertion: input/textarea (native setter to defeat React) ---------
  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
  }

  function insertIntoTextInput(ctx, html) {
    const { el } = ctx;
    const text = htmlToPlainText(html, el.ownerDocument); // inputs are plain text
    const start = ctx.selStart != null ? ctx.selStart : el.value.length;
    const end = ctx.selEnd != null ? ctx.selEnd : start;
    const val = el.value;

    el.focus();
    setNativeValue(el, val.slice(0, start) + text + val.slice(end));
    const caret = start + text.length;
    try { el.setSelectionRange(caret, caret); } catch (_) {}

    // Native input event so React/Angular/etc. register the change.
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function doInsert(ctx, html) {
    try {
      if (ctx.isCE) insertIntoContentEditable(ctx, html);
      else insertIntoTextInput(ctx, html);
      flashConfirmation(ctx.el);
    } catch (err) {
      console.error("[spike] insertion failed:", err);
      toast("Insertion FAILED — see console", true);
    }
  }

  // ----- Overlay (Shadow-DOM isolated command palette) ---------------------
  let host = null;
  let shadow = null;

  function ensureHost() {
    if (host) return;
    host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;inset:0;display:none;";
    shadow = host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);
  }

  function closeOverlay() {
    overlayOpen = false;
    if (host) host.style.display = "none";
    if (shadow) shadow.innerHTML = "";
  }

  function openPicker() {
    if (overlayOpen) return;            // guard: double-trigger (keydown + command)
    const ctx = captureContext();
    if (!ctx) {
      toast("No editable field focused — click into a compose/message box first.");
      return;
    }
    saved = ctx;
    overlayOpen = true;
    renderList(0);
  }

  function baseStyles() {
    return `
      .backdrop{position:fixed;inset:0;background:rgba(0,0,0,.18);}
      .panel{position:fixed;top:18%;left:50%;transform:translateX(-50%);
        width:min(520px,92vw);background:#fff;border-radius:12px;
        box-shadow:0 12px 40px rgba(0,0,0,.28);font:14px/1.4 system-ui,sans-serif;
        color:#111;overflow:hidden;}
      .hd{padding:10px 14px;font-weight:600;background:#f6f7f9;border-bottom:1px solid #eee;
        display:flex;justify-content:space-between;align-items:center;}
      .hd small{font-weight:400;color:#888;}
      ul{list-style:none;margin:0;padding:6px;}
      li{padding:10px 12px;border-radius:8px;cursor:pointer;}
      li .t{font-weight:600;}
      li .p{color:#666;font-size:12px;margin-top:3px;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      li.sel{background:#2563eb;color:#fff;}
      li.sel .p{color:#dbe6ff;}
      .ft{padding:8px 14px;color:#888;font-size:12px;border-top:1px solid #eee;}
      .varbox{padding:16px;}
      .varbox label{display:block;font-weight:600;margin-bottom:6px;}
      .varbox input{width:100%;box-sizing:border-box;padding:9px 11px;font-size:14px;
        border:1px solid #cbd5e1;border-radius:8px;}
      .varbox .hint{color:#888;font-size:12px;margin-top:8px;}
    `;
  }

  function renderList(selectedIndex) {
    ensureHost();
    host.style.display = "block";
    let i = selectedIndex;

    function paint() {
      shadow.innerHTML = `
        <style>${baseStyles()}</style>
        <div class="backdrop"></div>
        <div class="panel" tabindex="-1">
          <div class="hd"><span>Insert template</span><small>↑↓ &nbsp; Enter &nbsp; Esc</small></div>
          <ul>
            ${TEMPLATES.map((t, idx) => `
              <li data-i="${idx}" class="${idx === i ? "sel" : ""}">
                <div class="t">${escapeHtml(t.title)}</div>
                <div class="p">${escapeHtml(htmlToPlainText(t.html, document))}</div>
              </li>`).join("")}
          </ul>
          <div class="ft">Caret was captured before this opened — selecting restores it.</div>
        </div>`;
      const panel = shadow.querySelector(".panel");
      panel.focus();
      shadow.querySelectorAll("li").forEach((li) => {
        li.addEventListener("mouseenter", () => { i = +li.dataset.i; paint(); });
        li.addEventListener("click", () => choose(i));
      });
      shadow.querySelector(".backdrop").addEventListener("click", closeOverlay);
      panel.addEventListener("keydown", onKey);
    }

    function onKey(e) {
      if (e.key === "ArrowDown") { e.preventDefault(); i = (i + 1) % TEMPLATES.length; paint(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); i = (i - 1 + TEMPLATES.length) % TEMPLATES.length; paint(); }
      else if (e.key === "Enter") { e.preventDefault(); choose(i); }
      else if (e.key === "Escape") { e.preventDefault(); closeOverlay(); }
    }

    paint();
  }

  function choose(index) {
    const tpl = TEMPLATES[index];
    if (tpl.html.includes("{first_name}")) {
      renderVariablePrompt(tpl);
    } else {
      const ctx = saved;
      closeOverlay();
      doInsert(ctx, tpl.html);
    }
  }

  function renderVariablePrompt(tpl) {
    shadow.innerHTML = `
      <style>${baseStyles()}</style>
      <div class="backdrop"></div>
      <div class="panel">
        <div class="hd"><span>Fill variable</span><small>Enter to insert · Esc to cancel</small></div>
        <div class="varbox">
          <label for="v">first_name</label>
          <input id="v" type="text" placeholder="e.g. Alex" autocomplete="off" />
          <div class="hint">Leaves the rest of the template intact and inserts at your caret.</div>
        </div>
      </div>`;
    const input = shadow.getElementById("v");
    input.focus();
    shadow.querySelector(".backdrop").addEventListener("click", closeOverlay);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const value = input.value.trim() || "there";
        const filled = tpl.html.replaceAll("{first_name}", escapeHtml(value));
        const ctx = saved;
        closeOverlay();
        doInsert(ctx, filled);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeOverlay();
      }
    });
  }

  // ----- tiny UI helpers ---------------------------------------------------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function flashConfirmation(el) {
    toast("✓ Inserted");
  }

  let toastEl = null, toastTimer = null;
  function toast(msg, isError) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.style.cssText =
        "all:initial;position:fixed;bottom:24px;left:50%;transform:translateX(-50%);" +
        "z-index:2147483647;padding:9px 16px;border-radius:999px;font:13px system-ui,sans-serif;" +
        "color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.3);pointer-events:none;";
      document.documentElement.appendChild(toastEl);
    }
    toastEl.style.background = isError ? "#dc2626" : "#16a34a";
    toastEl.textContent = msg;
    toastEl.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (toastEl) toastEl.style.display = "none"; }, 1400);
  }

  // ----- Triggers ----------------------------------------------------------
  // Route 1: direct keydown (synchronous caret capture; overrides Chrome's Ctrl+J).
  window.addEventListener("keydown", (e) => {
    const hotkey = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey &&
                   (e.key === "j" || e.key === "J");
    if (!hotkey) return;
    e.preventDefault();
    e.stopPropagation();
    openPicker();
  }, true);

  // Route 2: chrome.commands relayed from the service worker. Only the focused
  // frame acts (document.hasFocus() is true in exactly one frame).
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "OPEN_PICKER" && document.hasFocus()) openPicker();
  });

  console.log("[spike] insertion spike loaded in frame:", location.href);
})();

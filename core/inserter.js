/* Canned Responses — core/inserter.js
 * The insertion engine (the moat), promoted from the Phase 0 spike.
 * UI-agnostic: it operates ONLY on the focused editable via the Selection/Range
 * API — never on Gmail's or LinkedIn's DOM structure. That is the entire
 * Gmail-update insurance policy.
 *
 * Hard-won rules (see the spike findings):
 *   - contenteditable: build a DocumentFragment, insert via Range, then dispatch
 *     input with inputType:"insertText". NEVER "insertFromPaste" — that trips
 *     Gmail's link-normalizer and rewrites anchor text.
 *   - input/textarea: splice via the NATIVE value setter so React-controlled
 *     fields register the change, then dispatch input + change. */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});

  function deepActiveElement(doc) {
    let el = doc.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  function isTextInput(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") {
      const t = (el.type || "text").toLowerCase();
      return ["text", "search", "url", "email", "tel", "password", ""].includes(t);
    }
    return false;
  }
  function isContentEditable(el) { return !!el && el.isContentEditable === true; }

  // Capture focus + a CLONED Range BEFORE any UI steals focus. The #1 thing
  // naive tools get wrong — opening the picker collapses the live selection.
  function captureContext() {
    const el = deepActiveElement(document);
    if (isContentEditable(el)) {
      const root = (el.getRootNode && el.getRootNode()) || document;
      const sel = (root.getSelection ? root.getSelection() : null) || window.getSelection();
      let range;
      if (sel && sel.rangeCount > 0) range = sel.getRangeAt(0).cloneRange();
      else { range = document.createRange(); range.selectNodeContents(el); range.collapse(false); }
      return { kind: "ce", el, range };
    }
    if (isTextInput(el)) {
      return { kind: "input", el, selStart: el.selectionStart, selEnd: el.selectionEnd };
    }
    return null; // nothing editable focused
  }

  function fragmentFromHtml(html, doc) {
    const tpl = doc.createElement("template");
    tpl.innerHTML = html;
    return tpl.content;
  }

  function insertIntoCE(ctx, html) {
    const { el, range } = ctx;
    const doc = el.ownerDocument;
    const win = doc.defaultView || window;
    el.focus();
    const root = (el.getRootNode && el.getRootNode()) || doc;
    const sel = (root.getSelection ? root.getSelection() : null) || win.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    range.deleteContents();
    const frag = fragmentFromHtml(html, doc);
    const lastNode = frag.lastChild;
    range.insertNode(frag);

    if (lastNode) {
      const after = doc.createRange();
      after.setStartAfter(lastNode);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
    }
    // Benign signal so the host editor's MutationObserver-backed model syncs.
    // MUST be "insertText", not "insertFromPaste".
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  }

  function nativeSetValue(el, value) {
    const proto = el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
  }

  function insertIntoInput(ctx, text) {
    const { el } = ctx;
    const start = ctx.selStart != null ? ctx.selStart : el.value.length;
    const end = ctx.selEnd != null ? ctx.selEnd : start;
    el.focus();
    nativeSetValue(el, el.value.slice(0, start) + text + el.value.slice(end));
    const caret = start + text.length;
    try { el.setSelectionRange(caret, caret); } catch (_) {}
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function escapeText(t) {
    return String(t)
      .replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))
      .replace(/\n/g, "<br>");
  }

  // Insert `html` (already variable-filled) at the captured caret.
  // opts.preferPlainText degrades rich -> plain (e.g. LinkedIn messaging).
  function insert(ctx, html, opts) {
    opts = opts || {};
    if (!ctx) return false;
    const s = NS.sanitize;
    try {
      if (ctx.kind === "ce" && !opts.preferPlainText) {
        const allowImg = !!(NS.entitlements && NS.entitlements.can("images"));   // Pro keeps images/tables
        insertIntoCE(ctx, s ? s.sanitize(html, { images: allowImg }) : html);
      } else if (ctx.kind === "ce") {
        insertIntoCE(ctx, escapeText(s ? s.toPlainText(html) : html));
      } else {
        insertIntoInput(ctx, s ? s.toPlainText(html) : html);
      }
      return true;
    } catch (e) {
      console.error("[CR] insertion failed", e);
      return false;
    }
  }

  // TODO(hardening, Week 4): for Gmail, create hyperlinks via
  // execCommand("insertHTML") so Gmail adopts the anchor as first-class and the
  // link-editor autofill can't rewrite its display text (spike finding #2).

  NS.inserter = { captureContext, insert, isContentEditable, isTextInput };
})(globalThis);

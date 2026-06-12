/* Canned Responses — content/expander.js
 * Abbreviation-expand: type a prefix + a template's shortcut, then press Tab, and
 * it expands in place. e.g. ";resched" + Tab -> the Meeting-reschedule template.
 * Reuses the insertion engine; variable templates use the picker's inline fill
 * box (NOT a native prompt). Only preventDefaults Tab when an expansion fires. */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});
  if (NS.__expander) return;
  NS.__expander = true;

  const SHORTCUT_RE = /;([a-z0-9_]+)$/i;       // prefix + shortcut at end of text

  function deepActive() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  function findByShortcut(sc) {
    try {
      const needle = sc.toLowerCase();
      return NS.store.getAll().find((t) => t.shortcut && t.shortcut.toLowerCase() === needle) || null;
    } catch (e) { return null; } // store not ready
  }

  function preferPlain() {
    const s = NS.surfaces || {};
    for (const k of Object.keys(s)) {
      if (s[k].matches && s[k].matches()) return !!(s[k].preferPlainText && s[k].preferPlainText());
    }
    return false;
  }

  // Insert the template at the captured spot. Variable templates route through the
  // picker's inline fill box; token-free ones insert immediately.
  function expandWith(ctx, tpl) {
    const onInsert = (html) => {
      const ok = NS.inserter.insert(ctx, html, { preferPlainText: preferPlain() });
      if (ok && NS.ui && NS.ui.cue) NS.ui.cue(CR.i18n.t("toast_inserted"));
    };
    if (NS.picker && NS.picker.fill) NS.picker.fill(tpl, onInsert);
    else onInsert(tpl.body);
  }

  function tryExpand(el) {
    if (!NS.inserter || !NS.store) return false;

    if (NS.inserter.isTextInput(el)) {
      const pos = el.selectionStart;
      if (pos == null) return false;
      const m = el.value.slice(0, pos).match(SHORTCUT_RE);
      if (!m) return false;
      const tpl = findByShortcut(m[1]);
      if (!tpl) return false;
      expandWith({ kind: "input", el, selStart: pos - m[0].length, selEnd: pos }, tpl);
      return true;
    }

    if (NS.inserter.isContentEditable(el)) {
      const root = (el.getRootNode && el.getRootNode()) || document;
      const sel = (root.getSelection ? root.getSelection() : null) || window.getSelection();
      if (!sel || !sel.rangeCount) return false;
      const r = sel.getRangeAt(0);
      if (!r.collapsed) return false;

      const pre = document.createRange();
      pre.selectNodeContents(el);
      try { pre.setEnd(r.startContainer, r.startOffset); } catch (e) { return false; }
      const m = pre.toString().match(SHORTCUT_RE);
      if (!m) return false;
      const tpl = findByShortcut(m[1]);
      if (!tpl) return false;

      const node = r.startContainer, offset = r.startOffset;
      if (node.nodeType !== Node.TEXT_NODE || offset < m[0].length) return false; // match spans nodes (rare)
      const range = document.createRange();
      range.setStart(node, offset - m[0].length);
      range.setEnd(node, offset);
      expandWith({ kind: "ce", el, range }, tpl);
      return true;
    }
    return false;
  }

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    const el = deepActive();
    if (!el) return;
    try {
      if (tryExpand(el)) { e.preventDefault(); e.stopPropagation(); }
    } catch (err) { console.error("[CR] expand error", err); }
  }, true);
})(globalThis);

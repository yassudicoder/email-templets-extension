/* Canned Responses — core/sanitize.js
 * HTML allowlist sanitizer + plain-text extraction. DOM-based (content-script /
 * page contexts only). Two modes:
 *   - FREE (default): text + rich formatting (bold/italic/color/links/lists/
 *     headings). Images, layout tables, and background images are stripped.
 *   - PRO  (opts.images === true): also keeps <img>, tables, and background
 *     images — the v1.1 paid "HTML-email templates" tier.
 * The plan/entitlements decide the mode; this module just enforces it. */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});
  const EMPTY = new Set();

  // ---- Free (text + formatting) ----
  const BASE_TAGS = new Set([
    "B", "STRONG", "I", "EM", "U", "A", "BR", "P", "DIV", "SPAN", "UL", "OL", "LI",
    "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "HR"
  ]);
  const BASE_ATTRS = { A: new Set(["href", "target"]) };
  const BASE_STYLE = new Set([
    "color", "background-color", "font-family", "font-size", "font-weight", "font-style",
    "text-decoration", "text-decoration-line", "text-align", "line-height", "letter-spacing", "text-transform",
    "width", "max-width", "height", "border", "border-radius", "vertical-align",
    "padding", "padding-top", "padding-bottom", "padding-left", "padding-right",
    "margin", "margin-top", "margin-bottom", "margin-left", "margin-right"
  ]);

  // ---- Pro adds: images, layout tables, background images ----
  const RICH_TAGS = new Set([...BASE_TAGS,
    "IMG", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "CAPTION", "COLGROUP", "COL"]);
  const RICH_ATTRS = {
    A: new Set(["href", "target"]),
    IMG: new Set(["src", "alt", "width", "height"]),
    TABLE: new Set(["width", "height", "align", "bgcolor", "background", "cellpadding", "cellspacing", "border"]),
    TR: new Set(["align", "valign", "bgcolor", "background"]),
    TD: new Set(["colspan", "rowspan", "width", "height", "align", "valign", "bgcolor", "background"]),
    TH: new Set(["colspan", "rowspan", "width", "height", "align", "valign", "bgcolor", "background"]),
    COL: new Set(["span", "width"])
  };
  const RICH_STYLE = new Set([...BASE_STYLE, "background", "background-image"]);

  // Dangerous/active tags are removed ENTIRELY (with their contents) in BOTH modes.
  const DROP_TAGS = new Set([
    "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "BASE",
    "NOSCRIPT", "TITLE", "FORM", "INPUT", "BUTTON", "SELECT", "TEXTAREA",
    "SVG", "MATH", "VIDEO", "AUDIO", "SOURCE", "TEMPLATE"
  ]);
  const URL_OK = /^(https?:|mailto:|tel:)/i;        // for href
  const IMG_SRC_OK = /^(https:|data:image\/)/i;     // images by https or inline data URI only
  const STYLE_BAD = /expression|javascript:|vbscript:|@import|[<>]/i;
  const STYLE_URL = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;

  function styleUrlsSafe(val) {
    let m; STYLE_URL.lastIndex = 0;
    while ((m = STYLE_URL.exec(val))) if (!IMG_SRC_OK.test(m[1].trim())) return false;
    return true;
  }
  function safeStyle(value, styleOk) {
    const out = [];
    for (const decl of String(value).split(";")) {
      const i = decl.indexOf(":");
      if (i < 0) continue;
      const prop = decl.slice(0, i).trim().toLowerCase();
      const val = decl.slice(i + 1).trim();
      if (!styleOk.has(prop) || !val || STYLE_BAD.test(val)) continue;
      if (/url\(/i.test(val) && !styleUrlsSafe(val)) continue;   // safe background image URL only
      out.push(prop + ":" + val);
    }
    return out.join(";");
  }

  function clean(node, ctx) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName;
        if (DROP_TAGS.has(tag)) { node.removeChild(child); continue; }
        if (!ctx.tags.has(tag)) {
          // Unwrap unknown/disallowed wrapper (incl. img/table in FREE mode) —
          // keep the sanitized children/text, drop the tag.
          clean(child, ctx);
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
          continue;
        }
        const allowed = ctx.attrs[tag] || EMPTY;
        for (const attr of Array.from(child.attributes)) {
          const name = attr.name.toLowerCase();
          if (name === "style") {
            const safe = safeStyle(attr.value, ctx.styleOk);
            if (safe) child.setAttribute("style", safe); else child.removeAttribute("style");
            continue;
          }
          if (!allowed.has(name)) { child.removeAttribute(attr.name); continue; }
          if (name === "href" && !URL_OK.test(attr.value.trim())) child.removeAttribute(attr.name);
          if ((name === "src" || name === "background") && !IMG_SRC_OK.test(attr.value.trim())) child.removeAttribute(attr.name);
        }
        if (tag === "A") child.setAttribute("rel", "noopener noreferrer");
        clean(child, ctx);
      } else if (child.nodeType === Node.COMMENT_NODE) {
        node.removeChild(child);
      }
    }
  }

  function sanitize(html, opts) {
    const rich = !!(opts && opts.images);
    const ctx = rich
      ? { tags: RICH_TAGS, attrs: RICH_ATTRS, styleOk: RICH_STYLE }
      : { tags: BASE_TAGS, attrs: BASE_ATTRS, styleOk: BASE_STYLE };
    const doc = new DOMParser().parseFromString("<body>" + String(html) + "</body>", "text/html");
    clean(doc.body, ctx);
    return doc.body.innerHTML;
  }

  // True if the HTML contains images / tables / background images — i.e. content
  // that FREE mode would strip (used to show the "Images are Pro" upsell).
  function detectMedia(html) {
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    if (doc.querySelector("img, picture, video, svg, table")) return true;
    const els = doc.querySelectorAll("*");
    for (const el of els) {
      if (el.getAttribute("background")) return true;
      const st = el.getAttribute("style");
      if (st && /url\(|background-image/i.test(st)) return true;
    }
    return false;
  }

  function toPlainText(html) {
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    return doc.body.textContent || "";
  }

  NS.sanitize = { sanitize, toPlainText, detectMedia };
})(globalThis);

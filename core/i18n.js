/* Canned Responses — core/i18n.js
 * Tiny chrome.i18n wrapper shared by extension pages AND content scripts.
 * No DOM assumptions beyond localize(); safe in the service worker too.
 *   CR.i18n.t(key, subs)      -> getMessage(key, subs)  (subs: value | array)
 *   CR.i18n.plural(base, n, subs) -> picks base_one / base_other by n
 *   CR.i18n.localize(root)    -> fills data-i18n* attributes on a DOM subtree
 * Everything is local (reads _locales/) — no network, no new permissions. */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});
  const has = !!(g.chrome && chrome.i18n && chrome.i18n.getMessage);

  function t(key, subs) {
    if (!has) return key; // dev fallback (e.g. opened as a plain file): show the key
    const arr = subs == null ? undefined : (Array.isArray(subs) ? subs.map(String) : [String(subs)]);
    return chrome.i18n.getMessage(key, arr) || key;
  }
  // chrome.i18n has no ICU plurals; we provide <base>_one / <base>_other forms
  // (sufficient for the shipped locales) and select by the English-style rule.
  function plural(base, n, subs) {
    return t(base + (Number(n) === 1 ? "_one" : "_other"), subs);
  }

  // Attribute map: data-i18n-<x> sets the corresponding attribute from a message.
  const ATTR = {
    "data-i18n-ph": "placeholder",
    "data-i18n-title": "title",
    "data-i18n-aria": "aria-label",
    "data-i18n-value": "value"
  };
  function localize(root) {
    root = root || document;
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      const m = t(el.getAttribute("data-i18n")); if (m) el.textContent = m;
    });
    // innerHTML variant for the rare message that carries a trusted inline tag
    root.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const m = t(el.getAttribute("data-i18n-html")); if (m) el.innerHTML = m;
    });
    for (const da in ATTR) {
      root.querySelectorAll("[" + da + "]").forEach((el) => {
        const m = t(el.getAttribute(da)); if (m) el.setAttribute(ATTR[da], m);
      });
    }
    const tt = root.querySelector && root.querySelector("title[data-i18n]");
    if (tt && g.document) document.title = t(tt.getAttribute("data-i18n"));
  }

  NS.i18n = { t, plural, localize, available: has };
})(globalThis);

/* Canned Responses — core/theme.js
 * Resolves the theme preference ("system" | "light" | "dark") to an effective
 * "light"/"dark". Shared by the extension pages and the in-page shadow UIs.
 * CSS keys off [data-theme="dark"] (pages) or the .cr-dark class (shadow panels);
 * JS always sets the effective value, so "system" is resolved here, not in CSS. */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});

  function resolve(setting) {
    if (setting === "dark" || setting === "light") return setting;
    try {
      return g.matchMedia && g.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch (e) { return "light"; }
  }

  // Apply to an extension page (sets <html data-theme>). Returns the effective theme.
  function applyToDocument(setting) {
    const eff = resolve(setting);
    if (g.document && g.document.documentElement)
      g.document.documentElement.setAttribute("data-theme", eff);
    return eff;
  }

  NS.theme = { resolve, applyToDocument };
})(globalThis);

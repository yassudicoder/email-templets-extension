/* Canned Responses — core/i18n.js
 * Runtime-switchable i18n. chrome.i18n can't be overridden per-extension, so the
 * in-app Language picker resolves messages from the bundled CR.LOCALES instead
 * (see core/locales.js — regenerate it after editing _locales). The active locale
 * follows settings.locale ("auto" = browser UI language); options.js switches it
 * live. Falls back to en, then to the key. Everything is local — no network.
 *
 * NOTE: the manifest name/description (__MSG__) and the first-install category
 * seeding still use chrome.i18n (browser locale) — those are static / install-time
 * and cannot be switched at runtime; the in-app UI below is what the picker changes. */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});
  const LOC = NS.LOCALES || {};
  const AVAILABLE = Object.keys(LOC);

  // Map a BCP-47 UI language ("es-419", "pt-BR", "ja") to a bundled locale code.
  function detect() {
    let ui = "en";
    try { ui = (g.chrome && chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || "en"; } catch (e) {}
    ui = ui.replace("-", "_");
    if (LOC[ui]) return ui;                                  // pt_BR
    const short = ui.split("_")[0];
    if (LOC[short]) return short;                            // es-419 -> es
    const hit = AVAILABLE.find((l) => l.split("_")[0] === short);
    return hit || "en";
  }
  function resolve(lang) {
    if (!lang || lang === "auto") return detect();
    lang = lang.replace("-", "_");
    if (LOC[lang]) return lang;
    const short = lang.split("_")[0];
    return LOC[short] ? short : "en";
  }

  let cur = AVAILABLE.length ? detect() : "en";
  function setLocale(lang) { cur = resolve(lang); return cur; }
  function getLocale() { return cur; }

  function format(entry, subs) {
    let msg = entry.message;
    const ph = entry.placeholders;
    if (ph) msg = msg.replace(/\$(\w+)\$/g, (m, name) => {
      const p = ph[name] || ph[name.toLowerCase()];
      return p && p.content != null ? p.content : m;
    });
    if (subs != null) {
      const arr = Array.isArray(subs) ? subs : [subs];
      msg = msg.replace(/\$(\d)/g, (m, d) => { const v = arr[(+d) - 1]; return v == null ? "" : String(v); });
    }
    return msg;
  }
  function t(key, subs) {
    const entry = (LOC[cur] && LOC[cur][key]) || (LOC.en && LOC.en[key]);
    return entry ? format(entry, subs) : key;
  }
  function plural(base, n, subs) {
    return t(base + (Number(n) === 1 ? "_one" : "_other"), subs);
  }

  const ATTR = {
    "data-i18n-ph": "placeholder", "data-i18n-title": "title",
    "data-i18n-aria": "aria-label", "data-i18n-value": "value"
  };
  function localize(root) {
    root = root || document;
    root.querySelectorAll("[data-i18n]").forEach((el) => { const m = t(el.getAttribute("data-i18n")); if (m) el.textContent = m; });
    root.querySelectorAll("[data-i18n-html]").forEach((el) => { const m = t(el.getAttribute("data-i18n-html")); if (m) el.innerHTML = m; });
    for (const da in ATTR) root.querySelectorAll("[" + da + "]").forEach((el) => { const m = t(el.getAttribute(da)); if (m) el.setAttribute(ATTR[da], m); });
    const tt = root.querySelector && root.querySelector("title[data-i18n]");
    if (tt && g.document) document.title = t(tt.getAttribute("data-i18n"));
  }

  // For the picker: language code + autonym (each shown in its own language).
  const NAMES = { en: "English", es: "Español", pt_BR: "Português (Brasil)", de: "Deutsch", fr: "Français", hi: "हिन्दी", ja: "日本語" };
  function languages() { return AVAILABLE.map((code) => ({ code, name: NAMES[code] || code })); }

  NS.i18n = { t, plural, localize, setLocale, getLocale, detect, languages, available: AVAILABLE.length > 0 };
})(globalThis);

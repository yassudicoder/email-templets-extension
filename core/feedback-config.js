/* Canned Responses — core/feedback-config.js
 * SINGLE config location for the in-app feedback feature + uninstall survey.
 * Loaded both in the options page (<script>) and the service worker
 * (importScripts) via the globalThis.CR namespace. No DOM, no network here.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ CHROME WEB STORE "DATA SAFETY" DISCLOSURE — UPDATE BEFORE PUBLISHING ⚠️
 * Default behavior (no WEB3FORMS_ACCESS_KEY set): clicking "Send" opens a
 * pre-filled email DRAFT in the user's own mail (Gmail) — the user sends it
 * themselves, so the extension transmits nothing on its own.
 * If you DO set a WEB3FORMS_ACCESS_KEY, "Send" instead POSTs the message (and
 * optional reply-to email) to Web3Forms. In that case update the Web Store
 * Data safety form to disclose "User-provided content" (the message) and the
 * optional "Email", collected (not shared/sold), for support, user-initiated.
 * Either way nothing is sent in the background — only on an explicit submit.
 * ─────────────────────────────────────────────────────────────────────────
 */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});

  NS.feedbackConfig = {
    // TODO: WEB3FORMS_ACCESS_KEY — create a free access key at https://web3forms.com
    // (it just maps a key -> your inbox; no backend needed) and paste it here.
    // Until this is set, the form falls back to the "email me directly" mailto link.
    WEB3FORMS_ACCESS_KEY: "",

    // TODO: UNINSTALL_SURVEY_URL — point this at a ONE-question "What made you
    // uninstall?" form/page (e.g. a page on the site or a single-question form).
    // Chrome opens it in a new tab when the user removes the extension.
    UNINSTALL_SURVEY_URL: "https://gmail-templates-and-canned.netlify.app/uninstall",

    // Where the form posts (Web3Forms responds with CORS headers, so a plain
    // fetch from the extension-origin options page works with no host permission).
    WEB3FORMS_ENDPOINT: "https://api.web3forms.com/submit",

    // Fallback / direct contact address (also shown as a mailto next to the form).
    CONTACT_EMAIL: "boxai5115@gmail.com"
  };
})(globalThis);

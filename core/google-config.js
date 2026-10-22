/* Canned Responses — core/google-config.js
 * SINGLE config location for "Connect Gmail" (scheduled send + auto-reply drafts).
 * Loaded by the service worker (importScripts) and the dashboard page via the
 * globalThis.CR namespace. No DOM, no network here.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ONE-TIME SETUP (developer) — until GOOGLE_OAUTH_CLIENT_ID is set, the dashboard
 * shows "Gmail connection isn't set up" and everything else keeps working.
 *   1. console.cloud.google.com → create/select a project → APIs & Services →
 *      Library → enable the "Gmail API".
 *   2. OAuth consent screen → External → app name, support email, privacy policy
 *      URL https://email-templets-extension.vercel.app/privacy. Add the scopes
 *      gmail.send, gmail.readonly and email. While the app is in "Testing" you can
 *      add up to 100 test users (Gmail addresses) and no verification is needed.
 *   3. Credentials → Create credentials → OAuth client ID → "Web application" →
 *      Authorized redirect URIs: https://<EXTENSION_ID>.chromiumapp.org/
 *      (Dashboard → Settings shows the exact URI of the installed build). Add one
 *      URI per extension ID — the unpacked dev build and the Web Store build differ.
 *   4. Paste the client ID below.
 *
 * ⚠️ BEFORE A PUBLIC LAUNCH: submit the consent screen for Google verification.
 *    gmail.send is a SENSITIVE scope (verification only). gmail.readonly is
 *    RESTRICTED (verification + an annual third-party security assessment) and is
 *    requested ONLY when a user turns on auto-reply drafts. Also update the Web
 *    Store "Privacy practices" tab (email content, authentication info).
 * ─────────────────────────────────────────────────────────────────────────
 */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});

  NS.googleConfig = {
    // TODO: GOOGLE_OAUTH_CLIENT_ID — the "Web application" OAuth client ID from step 3,
    // e.g. "1234567890-abc123.apps.googleusercontent.com". Public by design (not a secret).
    GOOGLE_OAUTH_CLIENT_ID: ""
  };
})(globalThis);

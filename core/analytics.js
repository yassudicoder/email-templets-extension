/* Canned Responses — core/analytics.js
 * Optional, OPT-IN, anonymous product analytics. Privacy guarantees:
 *   - Sends NOTHING unless settings.analyticsEnabled === true (off by default).
 *   - distinct_id is a random id (settings.analyticsId) — never a name/email/account.
 *   - Only event names + safe, content-free props. NEVER template titles/bodies,
 *     and NEVER any email/message content.
 *   - No SDK / no remote script (MV3-safe): one fetch() to PostHog's capture API.
 *
 * Contexts: in pages/content scripts capture() forwards to the service worker;
 * the SW is the single chokepoint that checks consent and performs the request. */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});

  const KEY = "phc_zDzP8jVXv3J9a5tNeUe3Pj4cbHLXnYEASJoCN232TLqG"; // public project key
  const HOST = "https://us.i.posthog.com";                        // EU: https://eu.i.posthog.com
  const isServiceWorker = (typeof window === "undefined");        // SW has no window

  // Runs in the service worker only: gate on consent, then fire-and-forget.
  async function deliver(event, props) {
    try {
      if (!NS.store) return;
      await NS.store.init();
      const s = NS.store.getSettings();
      if (!s || !s.analyticsEnabled) return;          // <-- consent gate
      let id = s.analyticsId;
      if (!id) { id = NS.model.uuid(); await NS.store.updateSettings({ analyticsId: id }); }
      const body = JSON.stringify({
        api_key: KEY,
        event: event,
        distinct_id: id,
        properties: Object.assign({ $lib: "cr-extension" }, props || {})
      });
      // text/plain => "simple" CORS request (no preflight); PostHog parses the JSON body.
      fetch(HOST + "/capture/", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: body,
        keepalive: true
      }).catch(() => {});
    } catch (e) { /* analytics must never break the app */ }
  }

  // Public entry point — safe to call from any context.
  function capture(event, props) {
    if (isServiceWorker) { deliver(event, props); return; }
    try {
      chrome.runtime.sendMessage({ type: "CR_ANALYTICS", event: event, props: props || {} },
        () => void chrome.runtime.lastError);
    } catch (e) { /* orphaned context — ignore */ }
  }

  NS.analytics = { capture, deliver };
})(globalThis);

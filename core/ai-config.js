/* Canned Responses — core/ai-config.js
 * SINGLE config location for the free "Built-in AI" (no API key needed by users).
 * Loaded by the service worker (importScripts) and the dashboard page.
 *
 * The built-in AI calls OUR relay (website/api/ai.js, deployed with the website on
 * Vercel), which holds the provider key as a server secret — the key is never in the
 * extension. Setup steps (env vars, limits, spend cap) are in website/api/ai.js.
 * Users can always switch to their own API key instead (no daily limit).
 */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});

  NS.aiConfig = {
    // The relay endpoint. Set to "" to turn the built-in AI off (users must add a key).
    BUILTIN_AI_URL: "https://email-templets-extension.vercel.app/api/ai",
    // Free requests per user per day, as shown in the UI. The server enforces its own
    // AI_DAILY_LIMIT — keep the two equal.
    BUILTIN_DAILY_LIMIT: 30
  };
})(globalThis);

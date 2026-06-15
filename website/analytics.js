/* Canned Responses — website analytics (PostHog), privacy-friendly + perf-trimmed.
 * Runs ONLY on the marketing website — never in the extension.
 *
 * Performance / privacy choices:
 *   - Loads AFTER the window 'load' event, on idle — never blocks first render.
 *   - Honors opt-out signals (Do Not Track / Global Privacy Control): if the
 *     visitor signals opt-out, PostHog is never loaded or initialized.
 *   - Cookieless (localStorage persistence); no session replay.
 *   - Disables unused bundles: surveys (~32 KiB) and dead-click autocapture (~6 KiB),
 *     so only the core array.js loads.
 *
 * SETUP: paste your "phc_" Project API Key into POSTHOG_KEY. Until then analytics stays off. */
(function () {
  "use strict";

  var POSTHOG_KEY = "phc_zDzP8jVXv3J9a5tNeUe3Pj4cbHLXnYEASJoCN232TLqG";
  var POSTHOG_HOST = "https://us.i.posthog.com"; // EU region: https://eu.i.posthog.com

  if (!POSTHOG_KEY || POSTHOG_KEY.indexOf("REPLACE") !== -1) return;

  // Respect opt-out signals — don't load anything if the user has opted out.
  var optedOut =
    navigator.doNotTrack === "1" ||
    window.doNotTrack === "1" ||
    navigator.msDoNotTrack === "1" ||
    navigator.globalPrivacyControl === true;
  if (optedOut) return;

  // Conversion-click delegation is attached immediately and queued; it only
  // fires once PostHog has actually initialized (after load).
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest("[data-cws]") : null;
    if (el && window.posthog && typeof window.posthog.capture === "function") {
      window.posthog.capture("add_to_chrome_click", {
        label: (el.textContent || "").trim().slice(0, 40),
        page: location.pathname
      });
    }
  });

  function start() {
    // --- Official PostHog loader (fetches core array.js from the CDN) ---
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

    window.posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      persistence: "localStorage",        // cookieless
      disable_session_recording: true,    // no session replay
      disable_surveys: true,              // don't load the surveys bundle (~32 KiB)
      capture_dead_clicks: false,         // skip dead-click autocapture (~6 KiB)
      capture_heatmaps: false,
      autocapture: true,                  // basic clicks
      capture_pageview: true              // page views
    });
  }

  // Defer until the browser is idle after load — zero impact on first render.
  function defer() {
    if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 3000 });
    else setTimeout(start, 1);
  }
  if (document.readyState === "complete") defer();
  else window.addEventListener("load", defer);
})();

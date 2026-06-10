/* Canned Responses — website analytics (PostHog), privacy-friendly defaults.
 * This runs ONLY on the marketing website — never in the extension.
 *
 * SETUP (one-time):
 *   1. Create a free project at https://posthog.com
 *   2. Project Settings → "Project API Key" → copy it (starts with "phc_")
 *   3. Paste it into POSTHOG_KEY below, then redeploy the site.
 *   Until a real key is set, analytics stays OFF (nothing loads).
 *
 * Defaults chosen for a privacy-first brand:
 *   - persistence: "localStorage"  → no cookies (lighter consent requirements)
 *   - disable_session_recording    → no screen/session replay
 *   - we capture pageviews + clicks, plus an "add_to_chrome_click" conversion event.
 *   To switch to full tracking later, change persistence to "localStorage+cookie". */
(function () {
  "use strict";

  var POSTHOG_KEY = "phc_zDzP8jVXv3J9a5tNeUe3Pj4cbHLXnYEASJoCN232TLqG";
  var POSTHOG_HOST = "https://us.i.posthog.com"; // EU region: https://eu.i.posthog.com

  if (!POSTHOG_KEY || POSTHOG_KEY.indexOf("REPLACE") !== -1) {
    console.info("[analytics] PostHog key not set — analytics disabled. Add your key in analytics.js.");
    return;
  }

  // --- Official PostHog loader (fetches posthog-js from the CDN) ---
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    persistence: "localStorage",      // cookieless
    disable_session_recording: true,  // no session replay
    autocapture: true,                // clicks / form interactions
    capture_pageview: true            // page views
  });

  // Conversion event: any "Add to Chrome" button (marked with data-cws).
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest("[data-cws]") : null;
    if (el && window.posthog && typeof posthog.capture === "function") {
      posthog.capture("add_to_chrome_click", {
        label: (el.textContent || "").trim().slice(0, 40),
        page: location.pathname
      });
    }
  });
})();

/* Canned Responses — core/entitlements.js
 * THE single source of truth for plan + feature flags + limits. v1 is always
 * "free", but every gate routes through here (can(), getLimit()), so enabling a
 * paid tier later is a config flip — never a scattered-`if (plan==='free')` refactor.
 * Pure data; no DOM. Reads the active plan from settings (default "free"). */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});

  const PLANS = {
    free: {
      limits:   { templates: 150 },
      features: { unlimited_templates: false, advanced_variables: false, sync: false, team: false, images: false }
    },
    pro: {
      limits:   { templates: Infinity },
      features: { unlimited_templates: true, advanced_variables: true, sync: true, team: false, images: true }
    },
    team: {
      limits:   { templates: Infinity },
      features: { unlimited_templates: true, advanced_variables: true, sync: true, team: true, images: true }
    }
  };

  // BETA: every feature is unlocked for everyone while we gather feedback. When
  // premium launches, flip this to false and grandfather early users (installs
  // carry settings.earlyAccess === true) so we NEVER claw back a free feature.
  const BETA_ALL_FREE = true;

  // v1: plan always resolves to "free". v1.1 swaps this for a real license check —
  // and nothing else in the codebase changes.
  function plan() {
    try {
      const s = NS.store && NS.store.getSettings && NS.store.getSettings();
      return (s && s.plan && PLANS[s.plan]) ? s.plan : "free";
    } catch (e) { return "free"; }
  }
  function conf() { return PLANS[plan()] || PLANS.free; }

  // True for an early-access (beta-era) install — used to grandfather later.
  function earlyAccess() {
    try {
      const s = NS.store && NS.store.getSettings && NS.store.getSettings();
      return !!(s && s.earlyAccess);
    } catch (e) { return false; }
  }

  function can(feature) {
    if (BETA_ALL_FREE || earlyAccess()) return true;
    return !!conf().features[feature];
  }
  function getLimit(name) {
    if (BETA_ALL_FREE || earlyAccess()) return Infinity;
    const v = conf().limits[name];
    return v == null ? Infinity : v;
  }

  NS.entitlements = { plan, can, getLimit, PLANS };
})(globalThis);

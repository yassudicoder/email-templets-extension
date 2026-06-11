/* Canned Responses — core/model.js
 * Template schema, record factory, onboarding seeds, and the migration runner.
 * Pure data, zero DOM — safe in both content scripts and the service worker.
 * Every record carries production/sync metadata (UUID, timestamps, soft-delete)
 * from day one so v1.1 sync is a transport layer, not a rewrite. */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});

  const SCHEMA_VERSION = 2;

  function uuid() {
    if (g.crypto && g.crypto.randomUUID) return g.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = g.crypto.getRandomValues(new Uint8Array(1))[0] % 16;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // `now` is passed in so callers control timestamps (testable / deterministic).
  function createTemplate(fields, now) {
    const ts = now || Date.now();
    return {
      id: uuid(),                                    // stable UUID, never an index
      title: fields.title || "Untitled",
      shortcut: fields.shortcut || "",               // abbreviation for expand (future)
      body: fields.body || "",                       // sanitized rich HTML
      folderId: fields.folderId || null,
      tags: Array.isArray(fields.tags) ? fields.tags : [],
      favorite: !!fields.favorite,
      sortIndex: typeof fields.sortIndex === "number" ? fields.sortIndex : ts,
      createdAt: ts,
      updatedAt: ts,                                 // for future conflict resolution
      deletedAt: null                                // soft-delete (sync-safe)
    };
  }

  function createCategory(fields, now) {
    const ts = now || Date.now();
    return {
      id: uuid(),
      name: fields.name || "Untitled",
      sortIndex: typeof fields.sortIndex === "number" ? fields.sortIndex : ts,
      createdAt: ts
    };
  }

  // Seed categories — give the first run real structure to organize into.
  // CATEGORY_SEED maps each default category to its i18n message key. The English
  // names here are the fallback AND what the v1->v2 migration seeds (unchanged);
  // localized names are applied ONLY on first install (see store.emptyDb).
  const CATEGORY_SEED = [
    { key: "category_follow_ups", name: "Follow Ups" },
    { key: "category_outreach",   name: "Outreach" },
    { key: "category_onboarding", name: "Onboarding" },
    { key: "category_responses",  name: "Responses" },
    { key: "category_closing",    name: "Closing" },
    { key: "category_other",      name: "Other" }
  ];
  // `names` is an optional localized override (its length must match CATEGORY_SEED).
  // Omitting it yields the English defaults — keeping migration behaviour identical.
  function sampleCategories(now, names) {
    const base = now || Date.now();
    const list = (Array.isArray(names) && names.length === CATEGORY_SEED.length)
      ? names : CATEGORY_SEED.map((c) => c.name);
    return list.map((name, i) => createCategory({ name, sortIndex: base + i }, base + i));
  }

  function defaultSettings() {
    return {
      hotkey: "Alt+A", schemaVersion: SCHEMA_VERSION, plan: "free", theme: "system",
      lastBackupAt: 0, backupReminderWeekly: false, backupNudgeDismissedAt: 0,
      // Anonymous, opt-in product analytics — OFF until the user enables it.
      // analyticsId is a random id (no identity) generated only once enabled.
      analyticsEnabled: false, analyticsId: "",
      // Beta-era installs are flagged early-access so they can be grandfathered
      // when premium launches (set this default to false at that point).
      earlyAccess: true
    };
  }

  // Pre-loaded samples — the first run must never be an empty state.
  function sampleTemplates(now) {
    const base = now || Date.now();
    const seed = (title, body, shortcut, i) =>
      createTemplate({ title, body, shortcut, sortIndex: base + i }, base + i);
    return [
      seed("Meeting reschedule",
        "Hi {first_name}, something's come up and I need to move our meeting. Could we find another time that works for you? Apologies for the short notice.",
        "resched", 0),
      seed("Thanks for applying",
        "Hi {first_name}, thanks so much for applying. We've received your application and will be in touch about next steps soon.",
        "applied", 1),
      seed("Quick follow-up",
        "Hi {first_name}, just following up on my note below — happy to answer any questions. Looking forward to hearing from you.",
        "followup", 2)
    ];
  }

  // ---- Migration runner -------------------------------------------------
  // MIGRATIONS[n] upgrades the db blob from version n-1 to n. Add entries as the
  // schema evolves; never destroy existing user data. This is what makes the
  // model "production" rather than tech debt.
  const MIGRATIONS = {
    // v2: introduce named categories. Existing templates keep folderId === null
    // (they show under "All Templates" until the user files them) — never lost.
    2: (db) => { if (!Array.isArray(db.categories)) db.categories = sampleCategories(Date.now()); }
  };

  function migrate(db) {
    let version = (db && db.schemaVersion) || 0;
    while (version < SCHEMA_VERSION) {
      const step = MIGRATIONS[version + 1];
      if (step) step(db);
      version += 1;
      db.schemaVersion = version;
    }
    return db;
  }

  NS.model = {
    SCHEMA_VERSION, CATEGORY_SEED, uuid, createTemplate, createCategory, defaultSettings,
    sampleTemplates, sampleCategories, migrate
  };
})(globalThis);

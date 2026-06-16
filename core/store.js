/* Canned Responses — core/store.js
 * Storage abstraction over chrome.storage.local. One DB blob, an in-memory
 * cache for instant reads, CRUD writes, and live cross-context sync via
 * storage.onChanged. No DOM — runs in content scripts and the service worker.
 *
 * Reads are synchronous against the cache (search/scroll never touch disk);
 * writes persist AND update the cache. Call init() once per context first. */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});
  const model = NS.model;

  const DB_KEY = "cr.db";
  let cache = null;                  // { schemaVersion, templates: {id: rec}, settings }
  const listeners = new Set();

  // ---- Optional cross-device sync (off unless settings.syncEnabled; see core/sync.js).
  // Reconcile = pull the user's shared snapshot, additively merge it (newest-wins),
  // save anything new locally, and publish anything the remote lacks. Additive +
  // single-flight + echo-guarded, so it never loses local data and never ping-pongs.
  let syncStamp = 0;            // stamp of the snapshot we last pushed (ignore our own echo)
  let applyingRemote = false;   // true while persisting a merge locally (suppresses re-trigger)
  let reconciling = false;      // single-flight guard
  let reconcileTimer = null;
  function syncOn() {
    return !!(cache && cache.settings && cache.settings.syncEnabled && NS.crsync && NS.crsync.has());
  }
  function notify() {
    for (const cb of listeners) {
      try { cb(cache); } catch (e) { console.error("[CR] store listener error", e); }
    }
  }
  function scheduleReconcile(db) {
    if (applyingRemote || !db || !db.settings || !db.settings.syncEnabled) return;
    if (!NS.crsync || !NS.crsync.has()) return;
    clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(function () { reconcile(); }, 1200);
  }
  async function reconcile() {
    if (reconciling || !syncOn()) return;
    reconciling = true;
    try {
      const remote = await NS.crsync.pull();
      const local = { templates: cache.templates, categories: cache.categories };
      const merged = remote ? NS.crsync.merge(local, remote) : local;
      if (NS.crsync.addsBeyond(merged, local)) {          // remote brought something new -> save it
        cache.templates = merged.templates;
        cache.categories = merged.categories;
        applyingRemote = true;
        await writeRaw(cache);
        applyingRemote = false;
        notify();
      }
      if (!remote || NS.crsync.addsBeyond(merged, remote)) {   // we hold something remote lacks -> publish
        const stamp = Date.now();
        const r = await NS.crsync.push({ templates: merged.templates, categories: merged.categories }, stamp);
        if (r && r.ok) syncStamp = r.stamp;
      }
    } catch (e) { applyingRemote = false; }
    finally { reconciling = false; }
  }

  // First-install only: localize the seeded category names to the browser locale.
  // After this they are user data and are never re-translated; the v1->v2 migration
  // (model.MIGRATIONS[2]) keeps the English defaults, so existing users are untouched.
  function localizedCategoryNames() {
    if (g.chrome && chrome.i18n && chrome.i18n.getMessage) {
      return model.CATEGORY_SEED.map((c) => chrome.i18n.getMessage(c.key) || c.name);
    }
    return model.CATEGORY_SEED.map((c) => c.name);
  }
  function emptyDb() {
    return {
      schemaVersion: model.SCHEMA_VERSION,
      templates: {},
      categories: model.sampleCategories(Date.now(), localizedCategoryNames()),
      settings: model.defaultSettings()
    };
  }

  // try/catch guards against "Extension context invalidated" thrown by orphaned
  // content scripts after an extension reload (until the tab is refreshed).
  function readRaw() {
    return new Promise((resolve) => {
      try { chrome.storage.local.get(DB_KEY, (res) => resolve(res && res[DB_KEY])); }
      catch (e) { resolve(null); }
    });
  }
  function writeRaw(db) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set({ [DB_KEY]: db }, () => { scheduleReconcile(db); resolve(); }); }
      catch (e) { resolve(); }
    });
  }

  async function init() {
    if (cache) return cache;
    let db = await readRaw();
    if (!db) { db = emptyDb(); await writeRaw(db); }
    else { db = model.migrate(db); }
    cache = db;
    await reconcile();          // fold in / publish to the user's other devices (no-op unless sync is on)
    return cache;
  }

  function ensure() {
    if (!cache) throw new Error("CR.store not initialized — await CR.store.init() first");
    return cache;
  }

  // ---- Reads (against cache) --------------------------------------------
  function getAll() {
    return Object.values(ensure().templates)
      .filter((t) => !t.deletedAt)
      // Favorites pinned to top; stable by sortIndex within each group.
      .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || a.sortIndex - b.sortIndex);
  }
  function get(id) {
    const t = ensure().templates[id];
    return t && !t.deletedAt ? t : null;
  }
  // Soft-deleted templates, most-recently-trashed first (the Trash view).
  function getTrash() {
    return Object.values(ensure().templates)
      .filter((t) => t.deletedAt)
      .sort((a, b) => b.deletedAt - a.deletedAt);
  }
  function getSettings() { return ensure().settings; }

  // ---- Categories -------------------------------------------------------
  function getCategories() {
    const db = ensure();
    if (!Array.isArray(db.categories)) db.categories = [];
    return db.categories.slice().sort((a, b) => a.sortIndex - b.sortIndex);
  }

  // ---- Writes (persist + cache) -----------------------------------------
  function activeCount(db) {
    return Object.values(db.templates).filter((t) => !t.deletedAt).length;
  }
  function templateLimit() {
    return (NS.entitlements && NS.entitlements.getLimit("templates")) || Infinity;
  }
  function atLimit() { return activeCount(ensure()) >= templateLimit(); }

  // THE single cap chokepoint. Returns null when the limit blocks ADDING (the
  // 150-template free cap); existing templates always remain editable.
  async function create(fields) {
    const db = ensure();
    if (activeCount(db) >= templateLimit()) return null;
    const rec = model.createTemplate(fields, Date.now());
    db.templates[rec.id] = rec;
    await writeRaw(db);
    return rec;
  }
  // Inserts up to the remaining capacity; returns the records actually added.
  async function bulkInsert(records) {
    const db = ensure();
    const limit = templateLimit();
    let count = activeCount(db);
    const inserted = [];
    for (const rec of records) {
      if (count >= limit) break;
      db.templates[rec.id] = rec;
      inserted.push(rec);
      count++;
    }
    await writeRaw(db);
    return inserted;
  }
  async function update(id, patch) {
    const db = ensure();
    const rec = db.templates[id];
    if (!rec) return null;
    Object.assign(rec, patch, { updatedAt: Date.now() });
    await writeRaw(db);
    return rec;
  }
  async function softDelete(id) { return update(id, { deletedAt: Date.now() }); }
  async function restore(id) { return update(id, { deletedAt: null }); }
  // Permanent delete — only ever called from the Trash view (irreversible).
  async function remove(id) {
    const db = ensure();
    if (!db.templates[id]) return;
    delete db.templates[id];
    await writeRaw(db);
  }
  async function emptyTrash() {
    const db = ensure();
    for (const t of Object.values(db.templates)) if (t.deletedAt) delete db.templates[t.id];
    await writeRaw(db);
  }

  // Category writes. deleteCategory un-files its templates (folderId -> null) so
  // they survive under "All Templates" — deleting a folder never deletes content.
  async function createCategory(name) {
    const db = ensure();
    if (!Array.isArray(db.categories)) db.categories = [];
    const cat = model.createCategory({ name, sortIndex: Date.now() }, Date.now());
    db.categories.push(cat);
    await writeRaw(db);
    return cat;
  }
  async function renameCategory(id, name) {
    const db = ensure();
    const cat = (db.categories || []).find((c) => c.id === id);
    if (!cat) return null;
    cat.name = name;
    await writeRaw(db);
    return cat;
  }
  async function deleteCategory(id) {
    const db = ensure();
    db.categories = (db.categories || []).filter((c) => c.id !== id);
    for (const t of Object.values(db.templates)) if (t.folderId === id) t.folderId = null;
    await writeRaw(db);
  }
  // Persist a new ordering. orderedIds = template ids in the desired order.
  async function reorder(orderedIds) {
    const db = ensure();
    const now = Date.now();
    orderedIds.forEach((id, i) => {
      const rec = db.templates[id];
      if (rec) { rec.sortIndex = i; rec.updatedAt = now; }
    });
    await writeRaw(db);
  }
  async function updateSettings(patch) {
    const db = ensure();
    Object.assign(db.settings, patch);
    await writeRaw(db);
    return db.settings;
  }

  // ---- Live sync across frames / contexts -------------------------------
  function subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); }

  if (g.chrome && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local") {
        if (!changes[DB_KEY]) return;
        cache = changes[DB_KEY].newValue || cache;
        notify();
        return;
      }
      // Another of this user's devices changed the shared snapshot — pull + merge it.
      if (areaName === "sync" && NS.crsync && changes[NS.crsync.META] && syncOn()) {
        const meta = changes[NS.crsync.META].newValue;
        if (meta && meta.stamp === syncStamp) return;     // our own echo — ignore
        reconcile();
      }
    });
  }

  NS.store = {
    init, getAll, get, getTrash, getSettings, getCategories,
    create, bulkInsert, update, softDelete, restore, remove, emptyTrash,
    createCategory, renameCategory, deleteCategory,
    reorder, updateSettings, subscribe,
    atLimit, templateLimit, count: () => activeCount(ensure()),
    _DB_KEY: DB_KEY
  };
})(globalThis);

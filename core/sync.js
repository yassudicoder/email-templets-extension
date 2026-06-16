/* Canned Responses — core/sync.js
 * Optional cross-device sync with NO account: it rides on chrome.storage.sync,
 * which Chrome already mirrors across the user's signed-in Chrome installs.
 *
 * These are PURE helpers (no cache, no listeners) — store.js owns the cache and
 * decides when to push/pull. Design choices that keep it safe:
 *   - Only templates + categories roam; device-specific settings stay local.
 *   - The snapshot is chunked to fit chrome.storage.sync's ~8 KB/item, ~100 KB
 *     total quota. Libraries that don't fit (e.g. lots of inline images) simply
 *     don't sync — push() returns false, never throws, never corrupts anything.
 *   - merge() is newest-wins by updatedAt and ADDITIVE: it never drops a record
 *     present on either side. Deletions ride along as soft-delete (deletedAt)
 *     records, so the worst-case failure is a deleted item reappearing — never
 *     lost data. */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});

  const PREFIX = "cr.sync.";      // chunk keys: cr.sync.0 … cr.sync.N
  const META = "cr.sync.meta";    // { count, stamp }
  const CHUNK = 7000;             // < 8192 bytes/item quota, with headroom
  const MAX_CHUNKS = 13;          // 13 * 7000 ≈ 91 KB < 100 KB total quota

  function area() {
    return (g.chrome && chrome.storage && chrome.storage.sync) ? chrome.storage.sync : null;
  }
  function has() { return !!area(); }

  // Only the user data we want to roam between devices.
  function snapshot(db) {
    return JSON.stringify({ templates: db.templates || {}, categories: db.categories || [] });
  }

  // Write the snapshot as numbered chunks + meta. Resolves { ok, stamp }.
  // ok:false when there's no sync area or the library is too big to fit.
  function push(db, stamp) {
    return new Promise((resolve) => {
      const a = area(); if (!a) return resolve({ ok: false });
      const json = snapshot(db);
      if (json.length > CHUNK * MAX_CHUNKS) return resolve({ ok: false, tooBig: true });
      const parts = {}; let n = 0;
      for (let i = 0; i < json.length; i += CHUNK) parts[PREFIX + (n++)] = json.slice(i, i + CHUNK);
      parts[META] = { count: n, stamp: stamp };
      try {
        a.set(parts, () => {
          if (chrome.runtime.lastError) return resolve({ ok: false });
          // Drop any higher-index chunks left over from a previously larger library.
          const stale = []; for (let i = n; i < MAX_CHUNKS; i++) stale.push(PREFIX + i);
          a.remove(stale, () => { void chrome.runtime.lastError; resolve({ ok: true, stamp: stamp }); });
        });
      } catch (e) { resolve({ ok: false }); }
    });
  }

  // Read + reassemble the remote snapshot. Resolves { templates, categories, stamp }
  // or null if nothing is stored / the data is incomplete (never a partial object).
  function pull() {
    return new Promise((resolve) => {
      const a = area(); if (!a) return resolve(null);
      try {
        a.get(null, (all) => {
          if (chrome.runtime.lastError || !all || !all[META]) return resolve(null);
          const count = all[META].count | 0;
          let json = "";
          for (let i = 0; i < count; i++) {
            const c = all[PREFIX + i];
            if (typeof c !== "string") return resolve(null);   // incomplete — ignore this round
            json += c;
          }
          try { const data = JSON.parse(json); data.stamp = all[META].stamp || 0; resolve(data); }
          catch (e) { resolve(null); }
        });
      } catch (e) { resolve(null); }
    });
  }

  // Newest-wins, additive merge of remote into local. Returns a NEW
  // { templates, categories } and never drops a record from either side.
  function merge(local, remote) {
    const templates = Object.assign({}, local.templates || {});
    const rt = (remote && remote.templates) || {};
    for (const id of Object.keys(rt)) {
      const cur = templates[id], inc = rt[id];
      if (!cur || (inc && (inc.updatedAt || 0) > (cur.updatedAt || 0))) templates[id] = inc;
    }
    const categories = (local.categories || []).slice();
    const seen = new Set(categories.map((c) => c.id));
    for (const c of ((remote && remote.categories) || [])) {
      if (!seen.has(c.id)) { categories.push(c); seen.add(c.id); }
    }
    return { templates: templates, categories: categories };
  }

  // Does `a` hold any template/category that `b` lacks (or a newer template)?
  // Order-independent. Lets store.js skip pointless writes/pushes so two devices
  // that already agree don't ping-pong onChanged events forever.
  function addsBeyond(a, b) {
    const at = (a && a.templates) || {}, bt = (b && b.templates) || {};
    for (const id of Object.keys(at)) {
      if (!bt[id]) return true;
      if ((at[id].updatedAt || 0) > (bt[id].updatedAt || 0)) return true;
    }
    const bc = new Set((((b && b.categories) || [])).map((c) => c.id));
    for (const c of ((a && a.categories) || [])) if (!bc.has(c.id)) return true;
    return false;
  }

  NS.crsync = { has: has, push: push, pull: pull, merge: merge, addsBeyond: addsBeyond, META: META, PREFIX: PREFIX };
})(globalThis);

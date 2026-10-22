/* Canned Responses — core/automation.js
 * Scheduled send + auto-reply DRAFTS (review-first). Runs in the service worker.
 *
 * Data lives in its own chrome.storage.local key ("cr.auto") — separate from the
 * template DB so it never rides along in template sync/export and never wakes
 * every content script on each write. The SW is the SINGLE WRITER: the dashboard
 * reads the blob directly and asks for changes via { type: "CR_AUTO", op, data }
 * messages, and every write here goes through mutate()'s queue, so concurrent
 * read-modify-writes can't clobber each other.
 *
 * Safety rules (the reason this is review-first):
 *   - Auto-reply NEVER sends on its own: matching emails become drafts in a review
 *     queue; only the user's click sends one.
 *   - Automated mail (no-reply senders, mailing lists, bulk, auto-replies) is always
 *     ignored, so two auto-responders can never loop.
 *   - Before sending a reply we re-check the thread: if the user already answered
 *     there, the draft is skipped instead of sent twice.
 *   - A send whose outcome is unknown (connection dropped / server error after the
 *     request left, or the worker died mid-send) is marked failed as "interrupted",
 *     never retried blindly — it may have gone out; the user checks Sent and decides.
 *     Only a rate-limit refusal (definitely not accepted) is retried, with backoff,
 *     and nothing is attempted while the browser is offline.
 *   - Scheduled emails that are later than the user's grace window (Chrome was
 *     closed) are held as "missed" rather than sent hours late without asking. */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});

  const KEY = "cr.auto";
  const ALARM_TICK = "cr-auto-tick";      // 1-min safety net, only while something is scheduled
  const ALARM_POLL = "cr-auto-poll";      // inbox check, only while auto-reply is on
  const ALARM_SEND = "cr-send:";          // one exact-time alarm per scheduled email
  const STUCK_MS = 5 * 60 * 1000;
  const MAX_ATTEMPTS = 3;
  const LOG_MAX = 80;
  const PROCESSED_MAX = 1500;
  const DONE_TTL = 14 * 24 * 3600 * 1000;   // handled drafts (with email text) are purged after 14 days
  const EXPIRE_MS = 30 * 24 * 3600 * 1000;  // unreviewed drafts are retired after 30 days
  const QUEUE_MAX = 150;                     // hard cap on stored drafts (storage quota safety)
  const LIST_MAX = 100;                      // messages listed per inbox check
  const POLL_BATCH = 30;                     // messages processed per check (the rest next time)
  const SENT_KEEP = 50;

  function err(code, message) { const e = new Error(message || code); e.code = code; return e; }
  const uuid = () => (NS.model ? NS.model.uuid() : String(Date.now()) + Math.random().toString(36).slice(2));

  function defaultSettings() {
    return { autoReplyEnabled: false, pollMinutes: 5, lateGraceMinutes: 60, maxDraftsPerDay: 25 };
  }
  function empty() {
    return {
      v: 1, scheduled: {}, rules: [], queue: {}, log: [],
      settings: defaultSettings(),
      state: { lastPollAt: 0, lastCheckedAt: 0, lastPollError: "", processed: [], draftsDay: "", draftsToday: 0 }
    };
  }
  function normalize(s) {
    const d = empty();
    s = s && typeof s === "object" ? s : {};
    return {
      v: 1,
      scheduled: s.scheduled && typeof s.scheduled === "object" ? s.scheduled : {},
      rules: Array.isArray(s.rules) ? s.rules : [],
      queue: s.queue && typeof s.queue === "object" ? s.queue : {},
      log: Array.isArray(s.log) ? s.log : [],
      settings: Object.assign(d.settings, s.settings || {}),
      state: Object.assign(d.state, s.state || {})
    };
  }
  function read() {
    return new Promise((res) => {
      try { chrome.storage.local.get(KEY, (r) => res(normalize(r && r[KEY]))); }
      catch (e) { res(empty()); }
    });
  }
  // A failed write must FAIL the mutation: silently losing a "sending"/"sent" mark
  // would let the next tick send the same email again.
  function write(s) {
    return new Promise((res, rej) => {
      try {
        chrome.storage.local.set({ [KEY]: s }, () => {
          const le = chrome.runtime.lastError;
          if (le) rej(err("storage", le.message)); else res();
        });
      } catch (e) { rej(err("storage", e.message)); }
    });
  }
  // Serialize every read-modify-write. fn may mutate s and return a value.
  let chain = Promise.resolve();
  function mutate(fn) {
    const run = chain.then(async () => {
      const s = await read();
      const out = await fn(s);
      await write(s);
      return out;
    });
    chain = run.catch(() => {});
    return run;
  }
  function log(s, type, params) {
    s.log.unshift(Object.assign({ at: Date.now(), type }, params || {}));
    if (s.log.length > LOG_MAX) s.log.length = LOG_MAX;
  }
  function track(event, props) { try { if (NS.analytics) NS.analytics.deliver(event, props); } catch (e) {} }

  // ---- Tokens -------------------------------------------------------------------
  const TOKEN_RE = /\{([a-z0-9_]+)\}/gi;
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function autoTokens(at) {
    const d = new Date(at || Date.now());
    return {
      date: d.toLocaleDateString(),
      time: d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      day: d.toLocaleDateString([], { weekday: "long" })
    };
  }
  // Replace known tokens; unknown ones are left visible so the reviewer sees them.
  function fill(text, vals, html) {
    return String(text || "").replace(TOKEN_RE, (m, name) => {
      const v = vals[name.toLowerCase()];
      return v ? (html ? escapeHtml(v) : v) : m;
    });
  }
  function senderVars(msg, profile) {
    const base = (msg.fromName || msg.fromEmail.split("@")[0] || "").replace(/[._]+/g, " ").trim();
    const parts = base.split(/\s+/).filter(Boolean);
    const cap = (w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : "");
    return {
      first_name: cap(parts[0] || ""),
      last_name: parts.length > 1 ? cap(parts[parts.length - 1]) : "",
      my_name: (profile && profile.name) || ""
    };
  }

  // ---- Validation ---------------------------------------------------------------
  const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
  function addrList(v) {
    return (Array.isArray(v) ? v : String(v || "").split(/[,;\n]/)).map((a) => a.trim()).filter(Boolean);
  }
  function validAddrs(list) { return list.every((a) => EMAIL_RE.test(a.replace(/^.*<([^>]+)>\s*$/, "$1"))); }

  // ---- Alarms + badge -------------------------------------------------------------
  function alarmsGet(name) { return new Promise((res) => { try { chrome.alarms.get(name, (a) => res(a || null)); } catch (e) { res(null); } }); }
  async function ensureAlarms(s) {
    s = s || await read();
    const upcoming = Object.values(s.scheduled).filter((r) => r.status === "scheduled");
    for (const r of upcoming) chrome.alarms.create(ALARM_SEND + r.id, { when: Math.max(r.retryAt || r.sendAt, Date.now() + 1000) });
    // The tick also stays while anything is mid-send, so a send interrupted by the
    // worker dying is recovered (marked "interrupted") instead of stuck forever.
    const inFlight = Object.values(s.scheduled).some((r) => r.status === "sending") ||
      Object.values(s.queue).some((q) => q.status === "sending");
    if (upcoming.length || inFlight) await ensureTick();
    else chrome.alarms.clear(ALARM_TICK);
    if (s.settings.autoReplyEnabled) {
      const a = await alarmsGet(ALARM_POLL);
      const period = Math.max(1, Number(s.settings.pollMinutes) || 5);
      if (!a || a.periodInMinutes !== period) chrome.alarms.create(ALARM_POLL, { delayInMinutes: 0.1, periodInMinutes: period });
    } else chrome.alarms.clear(ALARM_POLL);
  }
  async function ensureTick() {
    if (!(await alarmsGet(ALARM_TICK))) chrome.alarms.create(ALARM_TICK, { periodInMinutes: 1 });
  }
  async function refreshBadge(s) {
    s = s || await read();
    const pending = Object.values(s.queue).filter((q) => q.status === "pending").length;
    const attention = Object.values(s.scheduled).filter((r) => r.status === "missed" || r.status === "failed").length;
    const n = pending + attention;
    try {
      chrome.action.setBadgeText({ text: n ? (n > 99 ? "99+" : String(n)) : "" });
      chrome.action.setBadgeBackgroundColor({ color: attention ? "#dc2626" : "#2563eb" });
    } catch (e) {}
  }

  // ---- Scheduled send ---------------------------------------------------------------
  async function runDue() {
    const now = Date.now();
    // Offline: don't even try (a failed attempt would be ambiguous). The tick retries.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const s0 = await read(); await ensureAlarms(s0); await refreshBadge(s0);
      return;
    }
    const claimed = await mutate((s) => {
      pruneQueue(s);   // also recovers auto-reply drafts stuck in "sending"
      const out = [];
      // Alarms fire up to ~1 min late, so even the strictest setting tolerates 5 min.
      const grace = Number(s.settings.lateGraceMinutes) < 0 ? -1 : Math.max(5, Number(s.settings.lateGraceMinutes) || 60);
      for (const r of Object.values(s.scheduled)) {
        if (r.status === "sending" && now - (r.claimedAt || 0) > STUCK_MS) {
          r.status = "failed"; r.error = "interrupted"; log(s, "send_failed", { id: r.id, subject: r.subject, error: "interrupted" });
        }
        if (r.status !== "scheduled" || r.sendAt > now || (r.retryAt && r.retryAt > now)) continue;
        if (!r.sendLate && grace >= 0 && now - r.sendAt > grace * 60000) {
          r.status = "missed"; r.updatedAt = now; log(s, "missed", { id: r.id, subject: r.subject });
          continue;
        }
        r.status = "sending"; r.claimedAt = now;
        out.push(JSON.parse(JSON.stringify(r)));
      }
      return out;
    });
    if (claimed.length) await ensureTick();   // if the worker dies mid-send, the tick recovers it
    for (const r of claimed) {
      try {
        const vals = autoTokens(Date.now());
        const res = await NS.gmail.send({
          to: r.to, cc: r.cc, bcc: r.bcc,
          subject: fill(r.subject, vals, false), html: fill(r.html, vals, true)
        });
        await mutate((s) => {
          const x = s.scheduled[r.id]; if (!x) return;
          x.status = "sent"; x.sentAt = Date.now(); x.gmailId = res && res.id; x.error = ""; x.retryAt = 0; x.updatedAt = Date.now();
          log(s, "sent", { id: r.id, subject: r.subject, to: addrList(r.to).join(", ") });
          pruneSent(s);
        });
        track("scheduled_email_sent", {});
      } catch (e) {
        // 429 = Gmail refused it, so a retry can't duplicate. A dropped connection or a
        // 5xx may come AFTER Gmail accepted the message: never auto-resend those.
        const retry = e.code === "gmail_rate";
        const unknown = e.code === "network" || e.code === "gmail_server";
        await mutate((s) => {
          const x = s.scheduled[r.id]; if (!x) return;
          x.attempts = (x.attempts || 0) + 1;
          x.error = unknown ? "interrupted" : (e.code || "send_failed");
          x.errorDetail = String(e.message || "").slice(0, 300); x.updatedAt = Date.now();
          if (retry && x.attempts < MAX_ATTEMPTS) {
            x.status = "scheduled"; x.retryAt = Date.now() + Math.pow(2, x.attempts) * 60000;   // 2, 4 min
          } else {
            x.status = "failed";
            log(s, "send_failed", { id: r.id, subject: r.subject, error: x.error });
          }
        }).catch(() => {});
      }
    }
    const s = await read();
    await ensureAlarms(s);
    await refreshBadge(s);
  }
  function pruneSent(s) {
    const sent = Object.values(s.scheduled).filter((r) => r.status === "sent").sort((a, b) => b.sentAt - a.sentAt);
    for (const r of sent.slice(SENT_KEEP)) delete s.scheduled[r.id];
  }

  function saveScheduled(s, d) {
    const to = addrList(d.to), cc = addrList(d.cc), bcc = addrList(d.bcc);
    if (!to.length) throw err("no_recipient");
    if (!validAddrs(to.concat(cc, bcc))) throw err("bad_address");
    const subject = String(d.subject || "").trim();
    const html = String(d.html || "");
    if (!subject && !NS.gmail.htmlToText(html).trim()) throw err("empty_email");
    const sendAt = Number(d.sendAt);
    if (!sendAt) throw err("no_time");
    if (!d.now && sendAt < Date.now() - 60000) throw err("past_time");
    const now = Date.now();
    let r = d.id && s.scheduled[d.id];
    if (r && (r.status === "sent" || r.status === "sending")) throw err("locked");
    if (!r) { r = { id: uuid(), createdAt: now }; s.scheduled[r.id] = r; }
    Object.assign(r, {
      to, cc, bcc, subject, html, sendAt: d.now ? now : sendAt,
      status: "scheduled", sendLate: !!d.now, attempts: 0, error: "", errorDetail: "", retryAt: 0, updatedAt: now,
      templateId: d.templateId || r.templateId || null
    });
    return r;
  }

  // ---- Auto-reply drafts --------------------------------------------------------------
  const NOREPLY_RE = /(^|[._+-])(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounces?|notifications?|alerts?)([._+-]|@)/i;
  const PROMO_LABELS = ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_UPDATES", "CATEGORY_FORUMS", "SPAM", "TRASH"];
  // Never answer machines — prevents auto-reply loops and replies to bounces.
  function isMachine(msg) {
    const h = msg.headers || {};
    const auto = (h["auto-submitted"] || "").toLowerCase();
    if (auto && auto !== "no") return true;
    if (h["x-autoreply"] || h["x-autorespond"] || h["x-auto-response-suppress"]) return true;
    if (/^(bulk|junk|list|auto_reply)$/i.test((h.precedence || "").trim())) return true;
    if (!msg.fromEmail || NOREPLY_RE.test(msg.fromEmail)) return true;
    return false;
  }
  // "Normal" = a person writing to you: not a list/newsletter/notification category.
  function isNormal(msg) {
    const h = msg.headers || {};
    if (h["list-id"] || h["list-unsubscribe"]) return false;
    return !(msg.labelIds || []).some((l) => PROMO_LABELS.includes(l));
  }
  function senderMatches(entries, email) {
    email = String(email || "").toLowerCase();
    return (entries || []).some((raw) => {
      const e = String(raw).trim().toLowerCase();
      if (!e) return false;
      if (e.startsWith("@")) return email.endsWith(e);
      if (e.includes("@")) return email === e;
      return email.endsWith("@" + e) || email.endsWith("." + e);   // bare domain incl. subdomains
    });
  }
  function keywordsMatch(words, msg) {
    if (!words || !words.length) return true;
    const hay = (msg.subject + "\n" + msg.text).toLowerCase();
    return words.some((w) => w && hay.includes(String(w).toLowerCase()));
  }
  // Specific-sender rules win over "any normal email" rules.
  function matchRule(rules, msg) {
    const on = rules.filter((r) => r.enabled);
    const ordered = on.filter((r) => r.who === "senders").concat(on.filter((r) => r.who !== "senders"));
    for (const r of ordered) {
      if (r.who === "senders" ? !senderMatches(r.senders, msg.fromEmail) : !isNormal(msg)) continue;
      if (!keywordsMatch(r.keywords, msg)) continue;
      return r;
    }
    return null;
  }

  async function draftFor(rule, msg) {
    const cfg = NS.ai ? await NS.ai.load() : null;
    const profile = cfg ? cfg.profile : {};
    if (rule.mode === "template") {
      await NS.store.init();
      const tpl = rule.templateId && NS.store.get(rule.templateId);
      if (!tpl) throw err("template_missing");
      return fill(tpl.body, Object.assign(autoTokens(Date.now()), senderVars(msg, profile)), true);
    }
    const from = msg.fromName ? msg.fromName + " <" + msg.fromEmail + ">" : msg.fromEmail;
    const out = await NS.ai.generate(cfg, {
      task: "autoreply", instruction: rule.instructions,
      context: { subject: msg.subject, messages: [{ from, text: msg.text || msg.snippet }] }
    });
    return out.html;
  }
  function slimMsg(m) {
    return {
      id: m.id, threadId: m.threadId, internalDate: m.internalDate,
      fromName: m.fromName, fromEmail: m.fromEmail, replyToEmail: m.replyToEmail || "",
      subject: m.subject, messageId: m.messageId, references: m.references,
      snippet: m.snippet, text: m.text
    };
  }
  function today() { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }

  let polling = false;
  async function pollInbox() {
    if (polling) return;
    polling = true;
    try {
      const s0 = await read();
      if (!s0.settings.autoReplyEnabled) return;
      const startedAt = Date.now();
      if (!s0.rules.some((r) => r.enabled)) {
        await mutate((s) => { s.state.lastPollAt = startedAt; s.state.lastCheckedAt = Date.now(); s.state.lastPollError = ""; });
        return;
      }
      const acct = await NS.gmail.getAccount();
      if (!acct) throw err("gmail_disconnected");
      if (!acct.read) throw err("gmail_scope");
      const since = Math.floor(((s0.state.lastPollAt || startedAt - 3600000) - 120000) / 1000);
      const list = await NS.gmail.listMessages("in:inbox -from:me after:" + since, LIST_MAX);
      const seen = new Set(s0.state.processed);
      const fresh = list.filter((m) => !seen.has(m.id)).reverse();   // oldest first
      const batch = fresh.slice(0, POLL_BATCH);
      for (const ref of batch) {
        const msg = NS.gmail.parseMessage(await NS.gmail.getMessage(ref.id));
        const mine = msg.fromEmail === acct.email || (msg.labelIds || []).includes("SENT");
        const cur = await read();
        const rule = mine || isMachine(msg) ? null : matchRule(cur.rules, msg);
        // Mark it processed in the SAME write that creates its draft, so an error on a
        // later message (or the worker dying) can never draft this one twice.
        const item = await mutate((s) => {
          s.state.processed = s.state.processed.concat(msg.id).slice(-PROCESSED_MAX);
          if (!rule) return null;
          // Daily cap — protects the user's AI credits from a burst of matching mail.
          if (s.state.draftsDay !== today()) { s.state.draftsDay = today(); s.state.draftsToday = 0; }
          if (s.state.draftsToday >= Number(s.settings.maxDraftsPerDay || 25)) {
            if (!s.state.capLogged) { log(s, "cap_reached", {}); s.state.capLogged = today(); }
            return null;
          }
          s.state.draftsToday++;
          const q = { id: uuid(), ruleId: rule.id, ruleName: rule.name, mode: rule.mode, status: "generating",
            msg: slimMsg(msg), draftHtml: "", error: "", createdAt: Date.now(), updatedAt: Date.now() };
          s.queue[q.id] = q;
          return q;
        });
        if (item) await generateDraft(item.id);
      }
      // Only move the window forward once everything in it was handled; a burst larger
      // than one batch continues on the next check (already-processed ids are skipped).
      const caughtUp = fresh.length <= POLL_BATCH && list.length < LIST_MAX;
      await mutate((s) => {
        if (caughtUp) s.state.lastPollAt = startedAt;
        s.state.lastCheckedAt = Date.now(); s.state.lastPollError = "";
        if (s.state.capLogged && s.state.capLogged !== today()) s.state.capLogged = "";
        pruneQueue(s);
      });
    } catch (e) {
      await mutate((s) => {
        if (s.state.lastPollError !== (e.code || "error")) log(s, "poll_error", { error: e.code || "error" });
        s.state.lastPollError = e.code || "error"; s.state.lastCheckedAt = Date.now();
      });
    } finally {
      polling = false;
      await refreshBadge();
    }
  }
  function pruneQueue(s) {
    const now = Date.now();
    for (const q of Object.values(s.queue)) {
      const age = now - (q.updatedAt || q.createdAt || 0);
      if (["sent", "skipped"].includes(q.status) && age > DONE_TTL) delete s.queue[q.id];
      // Work that died with the service worker becomes actionable again. A reply that
      // may have gone out is "interrupted" — sending it again re-checks the thread first.
      else if (q.status === "generating" && age > STUCK_MS) { q.status = "failed"; q.error = "draft_failed"; q.updatedAt = now; }
      else if (q.status === "sending" && age > STUCK_MS) { q.status = "failed"; q.error = "interrupted"; q.updatedAt = now; }
      // Drafts nobody reviewed for a month are retired.
      else if (["pending", "failed"].includes(q.status) && now - (q.createdAt || 0) > EXPIRE_MS) {
        q.status = "skipped"; q.error = "expired"; q.updatedAt = now;
      }
    }
    // Storage safety: keep at most QUEUE_MAX drafts, dropping the oldest handled ones.
    const all = Object.values(s.queue);
    if (all.length > QUEUE_MAX) {
      const done = all.filter((q) => q.status === "sent" || q.status === "skipped").sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
      for (const q of done.slice(0, all.length - QUEUE_MAX)) delete s.queue[q.id];
    }
  }

  async function generateDraft(id) {
    const s0 = await read();
    const q = s0.queue[id];
    if (!q) return;
    const rule = s0.rules.find((r) => r.id === q.ruleId) || { mode: q.mode, instructions: "", templateId: "" };
    try {
      const html = await draftFor(rule, q.msg);
      await mutate((s) => {
        const x = s.queue[id]; if (!x || x.status !== "generating") return;   // skipped meanwhile
        x.draftHtml = html; x.status = "pending"; x.error = ""; x.updatedAt = Date.now();
        log(s, "draft_created", { id, from: q.msg.fromEmail, subject: q.msg.subject });
      });
      track("autoreply_draft_created", { mode: rule.mode });
    } catch (e) {
      await mutate((s) => {
        const x = s.queue[id]; if (!x || x.status !== "generating") return;
        x.status = "failed"; x.error = e.code || "draft_failed"; x.errorDetail = String(e.message || "").slice(0, 300); x.updatedAt = Date.now();
        log(s, "draft_failed", { id, from: q.msg.fromEmail, error: x.error });
      });
    }
  }

  function replySubject(subj) {
    subj = String(subj || "").trim();
    return /^(re|aw|sv|antw|r)\s*:/i.test(subj) ? subj : "Re: " + subj;
  }
  async function sendReply(id, html) {
    const q = await mutate((s) => {
      const x = s.queue[id];
      if (!x) throw err("not_found");
      if (!["pending", "failed"].includes(x.status) || (!x.draftHtml && !html)) throw err("locked");
      if (html != null) x.draftHtml = String(html);
      x.status = "sending"; x.updatedAt = Date.now();
      return JSON.parse(JSON.stringify(x));
    });
    try {
      if (await NS.gmail.repliedSince(q.msg.threadId, q.msg.internalDate)) {
        await mutate((s) => {
          const x = s.queue[id]; if (!x) return;
          x.status = "skipped"; x.error = "already_replied"; x.updatedAt = Date.now();
          log(s, "reply_skipped", { id, from: q.msg.fromEmail, error: "already_replied" });
        });
        return { skipped: true };
      }
      const refs = (q.msg.references ? q.msg.references + " " : "") + (q.msg.messageId || "");
      await NS.gmail.send({
        to: q.msg.replyToEmail || q.msg.fromEmail,
        subject: replySubject(q.msg.subject), html: q.draftHtml,
        threadId: q.msg.threadId, inReplyTo: q.msg.messageId, references: refs.trim()
      });
      await mutate((s) => {
        const x = s.queue[id]; if (!x) return;
        x.status = "sent"; x.sentAt = Date.now(); x.error = ""; x.updatedAt = Date.now();
        log(s, "reply_sent", { id, to: q.msg.replyToEmail || q.msg.fromEmail, subject: q.msg.subject });
      });
      track("autoreply_sent", { mode: q.mode });
      return { sent: true };
    } catch (e) {
      await mutate((s) => {
        const x = s.queue[id]; if (!x) return;
        x.status = "failed"; x.error = e.code || "send_failed"; x.errorDetail = String(e.message || "").slice(0, 300); x.updatedAt = Date.now();
      });
      throw e;
    }
  }

  // ---- Rules ----------------------------------------------------------------------------
  function cleanList(v) {
    return (Array.isArray(v) ? v : String(v || "").split(/[,;\n]/)).map((x) => x.trim()).filter(Boolean).slice(0, 200);
  }
  function saveRule(s, d) {
    const who = d.who === "senders" ? "senders" : "any";
    const senders = cleanList(d.senders);
    if (who === "senders" && !senders.length) throw err("no_senders");
    const mode = d.mode === "template" ? "template" : "ai";
    if (mode === "template" && !d.templateId) throw err("no_template");
    const now = Date.now();
    let r = d.id && s.rules.find((x) => x.id === d.id);
    if (!r) { r = { id: uuid(), enabled: true, createdAt: now }; s.rules.push(r); }
    Object.assign(r, {
      name: String(d.name || "").trim().slice(0, 80) || (who === "senders" ? senders.slice(0, 2).join(", ") : "Any email"),
      who, senders: who === "senders" ? senders : [], keywords: cleanList(d.keywords),
      mode, instructions: String(d.instructions || "").slice(0, 2000), templateId: mode === "template" ? d.templateId : "",
      updatedAt: now
    });
    return r;
  }

  // ---- Message router (dashboard -> SW) ---------------------------------------------------
  async function handle(op, d) {
    try { return await dispatch(op, d || {}); }
    finally {
      const s = await read();
      await ensureAlarms(s);
      await refreshBadge(s);
    }
  }
  async function dispatch(op, d) {
    let out;
    switch (op) {
      case "schedule.save": {
        out = await mutate((s) => saveScheduled(s, d));
        track(d.now ? "email_sent_now" : "email_scheduled", {});
        if (d.now) await runDue();
        break;
      }
      case "schedule.sendNow":
        out = await mutate((s) => {
          const r = s.scheduled[d.id];
          if (!r || r.status === "sent" || r.status === "sending") throw err("locked");
          Object.assign(r, { status: "scheduled", sendAt: Date.now(), sendLate: true, attempts: 0, error: "", retryAt: 0, updatedAt: Date.now() });
          return r;
        });
        await runDue();
        break;
      case "schedule.delete":
        out = await mutate((s) => {
          const r = s.scheduled[d.id];
          if (r && r.status === "sending") throw err("locked");
          delete s.scheduled[d.id];
        });
        try { chrome.alarms.clear(ALARM_SEND + d.id); } catch (e) {}
        break;
      case "schedule.clearSent":
        out = await mutate((s) => { for (const r of Object.values(s.scheduled)) if (r.status === "sent") delete s.scheduled[r.id]; });
        break;
      case "rules.save": out = await mutate((s) => saveRule(s, d)); break;
      case "rules.delete": out = await mutate((s) => { s.rules = s.rules.filter((r) => r.id !== d.id); }); break;
      case "rules.toggle":
        out = await mutate((s) => { const r = s.rules.find((x) => x.id === d.id); if (r) { r.enabled = !!d.enabled; r.updatedAt = Date.now(); } return r; });
        break;
      case "queue.send": out = await sendReply(d.id, d.html); break;
      case "queue.save":
        out = await mutate((s) => { const x = s.queue[d.id]; if (x && x.status === "pending") { x.draftHtml = String(d.html || ""); x.updatedAt = Date.now(); } return x; });
        break;
      case "queue.skip":
        out = await mutate((s) => {
          const x = s.queue[d.id];
          if (x && x.status !== "sending" && x.status !== "sent") { x.status = "skipped"; x.error = ""; x.updatedAt = Date.now(); }
        });
        break;
      case "queue.regenerate":
        await mutate((s) => {
          const x = s.queue[d.id];
          if (!x || ["sending", "sent", "generating"].includes(x.status)) throw err("locked");
          x.status = "generating"; x.updatedAt = Date.now();
        });
        await generateDraft(d.id);
        break;
      case "queue.delete":
        out = await mutate((s) => { const x = s.queue[d.id]; if (x && x.status !== "sending") delete s.queue[d.id]; });
        break;
      case "queue.clearDone":
        out = await mutate((s) => { for (const q of Object.values(s.queue)) if (["sent", "skipped"].includes(q.status)) delete s.queue[q.id]; });
        break;
      case "settings.update":
        out = await mutate((s) => {
          const p = d.patch || {};
          if (p.autoReplyEnabled && !s.settings.autoReplyEnabled) {
            // Start fresh: only mail from the last hour onward — never the whole backlog.
            s.state.lastPollAt = Date.now() - 3600000; s.state.lastCheckedAt = 0; s.state.lastPollError = "";
          }
          for (const k of Object.keys(defaultSettings())) if (k in p) s.settings[k] = p[k];
          return s.settings;
        });
        if (d.patch && d.patch.autoReplyEnabled) track("autoreply_enabled", {});
        break;
      case "autoreply.checkNow": await pollInbox(); break;
      case "log.clear": out = await mutate((s) => { s.log = []; }); break;
      case "badge.refresh": break;
      default: throw err("bad_op");
    }
    return out == null ? null : out;
  }

  async function onAlarm(alarm) {
    if (!alarm) return;
    if (alarm.name === ALARM_TICK || alarm.name.startsWith(ALARM_SEND)) return runDue();
    if (alarm.name === ALARM_POLL) return pollInbox();
  }

  // Startup / install / update: re-arm alarms (Chrome may drop them on restart),
  // then catch up on anything that came due while the browser was closed.
  async function boot() {
    try { await runDue(); } catch (e) { console.warn("[CR] automation boot", e); }
  }

  NS.automation = { KEY, handle, onAlarm, boot, runDue, pollInbox, matchRule, isMachine, isNormal, senderMatches, fill };
})(globalThis);

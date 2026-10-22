/* Canned Responses — ui/dashboard/dashboard.js
 * Scheduled send · Auto-reply drafts (review queue + rules) · AI writer · Settings.
 *
 * Reads three storage blobs directly and re-renders on storage.onChanged:
 *   cr.auto  — scheduled emails, rules, review queue, activity (written ONLY by the
 *              service worker; every change here is a CR_AUTO message)
 *   cr.gmail — the connected Gmail account (no token — that lives in session storage)
 *   cr.ai    — AI provider config + "About you" profile (written here)
 * Templates come from the shared CR.store, exactly like the options page. */
(function () {
  "use strict";
  const { store, sanitize, theme, entitlements, analytics, ai, gmail } = globalThis.CR;
  const T = (key, subs) => CR.i18n.t(key, subs);
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const canImages = () => !!(entitlements && entitlements.can("images"));
  const clean = (html) => sanitize.sanitize(String(html || ""), { images: canImages() });

  const AUTO_KEY = "cr.auto", AI_KEY = "cr.ai", GMAIL_KEY = "cr.gmail";
  // Embedded in the options page (iframe): the options sidebar navigates; we report
  // our own section changes back so its highlight follows. Standalone keeps a top bar.
  const EMBED = new URLSearchParams(location.search).has("embed") && window.parent !== window;
  if (!EMBED) document.documentElement.classList.add("standalone");
  // Unpacked (developer) build: Web Store installs always carry an update_url. Only
  // developers see OAuth setup details; users get plain-language messages instead.
  const DEV = (() => { try { return !chrome.runtime.getManifest().update_url; } catch (e) { return false; } })();
  const DRAFT_KEY = "cr.composer.v1";   // composer autosave (localStorage — per-browser convenience)
  const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
  const TABS = ["schedule", "autoreply", "ai", "settings"];
  const AUTO_TOKENS = ["date", "time", "day"];
  const TOKEN_RE = /\{([a-z0-9_]+)\}/gi;

  let auto = normAuto(null);       // cr.auto snapshot (read-only here)
  let account = null;              // connected Gmail account or null
  let aiCfg = ai.defaults();       // saved AI config
  let aiDraft = null;              // unsaved provider-form edits
  let tab = "schedule";
  let editingId = null;            // scheduled email being edited
  const varVals = {};              // composer variable values
  const dirtyDrafts = new Map();   // queue id -> edited (unsaved) draft html
  let queueRenderPending = false;
  let editingRuleId = null;
  let tgMode = "gen";

  // ---- Helpers ----------------------------------------------------------------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function codeErr(code, detail) { const e = new Error(detail || code); e.code = code || "error"; e.detail = detail || ""; return e; }
  function errText(code, detail) {
    const key = "dash_err_" + (code || "error");
    let m = T(key);
    if (m === key) m = T("dash_err_error");
    if (detail && ["error", "ai_error", "gmail_error", "gmail_forbidden"].includes(code)) m += " (" + detail + ")";
    return m;
  }
  function sw(type, extra) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(Object.assign({ type }, extra || {}), (res) => {
          if (chrome.runtime.lastError || !res) return reject(codeErr("error"));
          res.ok ? resolve(res.data) : reject(codeErr(res.error, res.detail));
        });
      } catch (e) { reject(codeErr("error")); }
    });
  }
  const call = (op, data) => sw("CR_AUTO", { op, data });

  function normAuto(a) {
    a = a && typeof a === "object" ? a : {};
    return {
      scheduled: a.scheduled || {}, rules: Array.isArray(a.rules) ? a.rules : [], queue: a.queue || {},
      log: Array.isArray(a.log) ? a.log : [],
      settings: Object.assign({ autoReplyEnabled: false, pollMinutes: 5, lateGraceMinutes: 60, maxDraftsPerDay: 25 }, a.settings || {}),
      state: Object.assign({ lastPollAt: 0, lastCheckedAt: 0, lastPollError: "" }, a.state || {})
    };
  }
  function readLocal(key) {
    return new Promise((res) => { try { chrome.storage.local.get(key, (r) => res(r && r[key])); } catch (e) { res(null); } });
  }

  let toastTimer = null;
  function toast(text, isErr) {
    const el = $("#toast");
    el.textContent = text;
    el.classList.toggle("err", !!isErr);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, isErr ? 5200 : 2600);
  }
  function setStatus(el, text, kind) {
    if (typeof el === "string") el = $(el);
    if (!el) return;
    el.textContent = text || "";
    el.className = "status" + (kind ? " " + kind : "");
  }
  // Disable + spinner while a button's action runs (keeps its size).
  function busy(btn, on) {
    if (!btn) return;
    btn.disabled = !!on;
    btn.classList.toggle("loading", !!on);
    if (on) btn.setAttribute("aria-busy", "true"); else btn.removeAttribute("aria-busy");
  }
  function gmailOffMsg() { return DEV ? T("dash_gmail_not_configured") : T("dash_gmail_coming_soon"); }

  function locale() { return (CR.i18n.getLocale() || "en").replace("_", "-"); }
  function fmtDay(ms) {
    try { return new Date(ms).toLocaleDateString(locale(), { weekday: "short", month: "short", day: "numeric" }); }
    catch (e) { return new Date(ms).toDateString(); }
  }
  function fmtTime(ms) {
    try { return new Date(ms).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" }); }
    catch (e) { return new Date(ms).toTimeString().slice(0, 5); }
  }
  function fmtFull(ms) { return fmtDay(ms) + " · " + fmtTime(ms); }
  function rel(ms) {
    const diff = ms - Date.now();
    const abs = Math.abs(diff);
    const units = [["day", 86400000], ["hour", 3600000], ["minute", 60000]];
    try {
      const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
      for (const [u, size] of units) if (abs >= size || u === "minute") return rtf.format(Math.round(diff / size), u);
    } catch (e) {}
    return fmtFull(ms);
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function toInput(ms) {
    const d = new Date(ms);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function fromInput(v) { const t = v ? new Date(v).getTime() : 0; return isNaN(t) ? 0 : t; }
  function tokensIn(text) {
    const out = [];
    String(text || "").replace(TOKEN_RE, (m, name) => {
      if (!AUTO_TOKENS.includes(name.toLowerCase()) && !out.includes(name)) out.push(name);
      return m;
    });
    return out;
  }
  function plain(html) { return sanitize.toPlainText(html || ""); }

  // ---- Boot ---------------------------------------------------------------------
  async function boot() {
    await store.init();
    const s = store.getSettings();
    CR.i18n.setLocale((s && s.locale) || "auto");
    CR.i18n.localize(document);
    applyTheme();

    const [a, acct, cfg] = await Promise.all([readLocal(AUTO_KEY), gmail.getAccount(), ai.load()]);
    auto = normAuto(a); account = acct; aiCfg = cfg;

    bindTabs(); bindComposer(); bindAutoReply(); bindAi(); bindSettings();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[AUTO_KEY]) { auto = normAuto(changes[AUTO_KEY].newValue); renderAutoState(); }
      if (changes[GMAIL_KEY]) { account = changes[GMAIL_KEY].newValue && changes[GMAIL_KEY].newValue.email ? changes[GMAIL_KEY].newValue : null; renderGmail(); }
      if (changes[AI_KEY]) { aiCfg = ai.normalize(changes[AI_KEY].newValue); renderProviderGrid(); renderAutoReply(); }
    });
    const bootLocale = (s && s.locale) || "auto";
    store.subscribe(() => {
      const st = store.getSettings() || {};
      if ((st.locale || "auto") !== bootLocale) { location.reload(); return; }   // language switched in options
      fillTemplateSelects(); applyTheme();
    });
    try {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
    } catch (e) {}

    selectTab((location.hash || "").slice(1));
    window.addEventListener("hashchange", () => selectTab((location.hash || "").slice(1)));
    renderAll();
    setInterval(() => { renderSchedule(); renderArStatus(); renderWhen(); }, 60000);   // keep "in 5 min" labels fresh
    call("badge.refresh").catch(() => {});
    if (analytics) analytics.capture("dashboard_opened", {});
  }
  function applyTheme() { theme.applyToDocument((store.getSettings() && store.getSettings().theme) || "system"); }
  function renderAll() {
    fillTemplateSelects();
    renderGmail(); renderAutoState(); renderProviderGrid(); renderProfile(); renderSettings();
  }
  function renderAutoState() { renderSchedule(); renderAutoReply(); renderTabBadges(); renderSettings(); }

  // ---- Tabs ---------------------------------------------------------------------------
  function bindTabs() {
    $$(".tab").forEach((b) => b.addEventListener("click", () => selectTab(b.dataset.tab)));
    $("#openTemplates").addEventListener("click", () => chrome.runtime.openOptionsPage());
    $("#gmailBannerBtn").addEventListener("click", () => connectGmail(tab === "autoreply"));
  }
  function selectTab(t) {
    if (!TABS.includes(t)) t = "schedule";
    tab = t;
    $$(".tab").forEach((b) => { b.classList.toggle("on", b.dataset.tab === t); b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
    $$(".tabpanel").forEach((p) => { p.hidden = p.id !== "tab-" + t; });
    if (location.hash.slice(1) !== t) history.replaceState(null, "", "#" + t);
    if (EMBED) window.parent.postMessage({ type: "cr-dash-tab", tab: t }, location.origin);
    renderBanner();
  }
  function renderTabBadges() {
    const pending = Object.values(auto.queue).filter((q) => q.status === "pending").length;
    const attention = Object.values(auto.scheduled).filter((r) => r.status === "missed" || r.status === "failed").length;
    const bq = $("#badgeQueue"), bs = $("#badgeSchedule");
    bq.hidden = !pending; bq.textContent = String(pending);
    bs.hidden = !attention; bs.textContent = String(attention); bs.classList.add("red");
  }

  // ---- Gmail connection -------------------------------------------------------------------
  function renderBanner() {
    const b = $("#gmailBanner");
    if (!(tab === "schedule" || tab === "autoreply") || account) { b.hidden = true; return; }
    b.hidden = false;
    const configured = gmail.configured();
    $("#gmailBannerMsg").textContent = configured ? T("dash_gmail_banner") : gmailOffMsg();
    $("#gmailBannerBtn").hidden = !configured;
  }
  async function connectGmail(read) {
    if (!gmail.configured()) { toast(gmailOffMsg(), true); if (DEV) selectTab("settings"); return; }
    // Must be the first await so it stays inside the click's user gesture.
    try { await chrome.permissions.request({ origins: gmail.ORIGINS }); } catch (e) {}
    try {
      account = await gmail.connect({ read: !!read });
      if (read && !account.read) toast(T("dash_err_gmail_scope"), true);
      else toast(T("dash_gmail_connected_toast", [account.email]));
      if (analytics) analytics.capture("gmail_connected", { read: !!account.read });
    } catch (e) {
      if (e.code !== "gmail_auth_canceled") toast(errText(e.code, e.message), true);
    }
    renderGmail();
    return account;
  }
  async function disconnectGmail() {
    if (!confirm(T("dash_gmail_disconnect_confirm"))) return;
    await gmail.disconnect();
    account = null;
    if (auto.settings.autoReplyEnabled) await call("settings.update", { patch: { autoReplyEnabled: false } }).catch(() => {});
    toast(T("dash_gmail_disconnected_toast"));
    renderGmail();
  }
  function renderGmail() {
    renderBanner();
    renderAutoReply();
    const card = $("#gmailCard");
    if (!gmail.configured()) {
      card.innerHTML = `<p class="muted">${esc(gmailOffMsg())}</p>` +
        (DEV ? `<p class="hint">${esc(T("dash_gmail_not_configured_hint"))}</p>` : "");
      return;
    }
    if (!account) {
      card.innerHTML = `
        <p class="muted">${esc(T("dash_gmail_intro"))}</p>
        <ul class="perms">
          <li><span class="yes">✓</span><span>${esc(T("dash_perm_send"))}</span></li>
          <li><span class="no">○</span><span>${esc(T("dash_perm_read_optional"))}</span></li>
        </ul>
        <button id="gConnect" class="btn primary" type="button">${esc(T("dash_connect_gmail"))}</button>`;
      $("#gConnect").addEventListener("click", () => connectGmail(false));
      return;
    }
    const initial = esc((account.email || "?").charAt(0).toUpperCase());
    card.innerHTML = `
      <div class="acct"><div class="avatar">${initial}</div>
        <div><div class="aemail">${esc(account.email)}</div><div class="hint">${esc(T("dash_gmail_connected_since", [fmtDay(account.connectedAt || Date.now())]))}</div></div>
      </div>
      <ul class="perms">
        <li><span class="${account.send ? "yes" : "no"}">${account.send ? "✓" : "○"}</span><span>${esc(T("dash_perm_send"))}</span></li>
        <li><span class="${account.read ? "yes" : "no"}">${account.read ? "✓" : "○"}</span><span>${esc(T("dash_perm_read"))}</span></li>
      </ul>
      <div class="actions">
        ${account.read ? "" : `<button id="gRead" class="btn ghost sm" type="button">${esc(T("dash_allow_read"))}</button>`}
        <button id="gReconnect" class="btn subtle sm" type="button">${esc(T("dash_gmail_reconnect"))}</button>
        <button id="gDisconnect" class="btn danger sm" type="button">${esc(T("dash_gmail_disconnect"))}</button>
      </div>`;
    if ($("#gRead")) $("#gRead").addEventListener("click", () => connectGmail(true));
    $("#gReconnect").addEventListener("click", () => connectGmail(!!account.read));
    $("#gDisconnect").addEventListener("click", disconnectGmail);
  }

  // ---- Templates in selects -------------------------------------------------------------
  function fillTemplateSelects() {
    const tpls = store.getAll();
    const opts = tpls.map((t) => `<option value="${esc(t.id)}">${esc(t.title || T("template_untitled"))}</option>`).join("");
    const cT = $("#cTemplate");
    cT.innerHTML = `<option value="">${esc(T("dash_insert_template"))}</option>` + opts;
    const rT = $("#rTemplate"), keep = rT.value;
    rT.innerHTML = `<option value="">${esc(T("dash_rule_choose_template"))}</option>` + opts;
    rT.value = tpls.some((t) => t.id === keep) ? keep : "";
    const cat = $("#tgCat"), keepCat = cat.value;
    cat.innerHTML = `<option value="">${esc(T("context_uncategorized"))}</option>` +
      store.getCategories().map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    cat.value = store.getCategories().some((c) => c.id === keepCat) ? keepCat : "";
  }

  // ==== SCHEDULED =======================================================================
  function bindComposer() {
    $("#ccToggle").addEventListener("click", () => { $("#ccRow").hidden = false; $("#ccToggle").hidden = true; $("#cCc").focus(); });
    bindMiniBar($(".minibar[data-for='cBody']"), $("#cBody"));
    $("#cBody").addEventListener("input", renderVars);
    $("#cSubject").addEventListener("input", renderVars);
    $("#cTemplate").addEventListener("change", (e) => {
      const t = store.get(e.target.value);
      e.target.value = "";
      if (!t) return;
      insertHtmlInto($("#cBody"), clean(t.body));
      renderVars();
    });
    $("#cAiBtn").addEventListener("click", () => {
      const row = $("#cAiRow");
      row.hidden = !row.hidden;
      if (!row.hidden) $("#cAiPrompt").focus();
    });
    $("#cAiGo").addEventListener("click", composeWithAi);
    $("#cAiPrompt").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); composeWithAi(); } });

    renderQuickChips();
    $("#cWhen").min = toInput(Date.now());
    $("#cWhen").addEventListener("input", renderWhen);
    $("#cWhen").addEventListener("change", renderWhen);

    // Never lose a half-written email: autosave every edit, restore on next visit.
    const composer = $(".composer");
    composer.addEventListener("input", saveDraftSoon);
    composer.addEventListener("change", saveDraftSoon);
    // Ctrl/Cmd+Enter schedules from anywhere in the composer.
    composer.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.id !== "cAiPrompt") {
        e.preventDefault();
        if (!$("#cSchedule").disabled) submitComposer(false);
      }
    });
    restoreDraft();
    renderWhen();

    $("#cSchedule").addEventListener("click", () => submitComposer(false));
    $("#cSendNow").addEventListener("click", () => submitComposer(true));
    $("#cReset").addEventListener("click", () => resetComposer());
    $("#cCancelEdit").addEventListener("click", () => resetComposer());

    for (const id of ["#schedAttention", "#schedUpcoming", "#schedSent"]) $(id).addEventListener("click", onScheduleAction);
    $("#clearSent").addEventListener("click", () => call("schedule.clearSent").catch((e) => toast(errText(e.code), true)));
  }

  function bindMiniBar(bar, editor) {
    if (!bar) return;
    $$("button[data-cmd]", bar).forEach((b) => {
      b.addEventListener("mousedown", (e) => e.preventDefault());   // keep the editor's selection
      b.addEventListener("click", () => {
        editor.focus();
        if (b.dataset.cmd === "createLink") {
          const url = prompt(T("prompt_link_url"), "https://");
          if (url && /^(https?:|mailto:)/i.test(url)) document.execCommand("createLink", false, url);
        } else document.execCommand(b.dataset.cmd, false, null);
      });
    });
  }
  function insertHtmlInto(editor, html) {
    if (!editor.innerHTML.trim() || editor.innerText.trim() === "") { editor.innerHTML = html; return; }
    editor.focus();
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) {
      const r = document.createRange(); r.selectNodeContents(editor); r.collapse(false);
      sel.removeAllRanges(); sel.addRange(r);
    }
    document.execCommand("insertHTML", false, html);
  }

  function renderQuickChips() {
    const now = new Date();
    const at = (daysAhead, h, m) => { const d = new Date(now); d.setDate(d.getDate() + daysAhead); d.setHours(h, m || 0, 0, 0); return d.getTime(); };
    const inHour = Math.ceil((Date.now() + 3600000) / 300000) * 300000;
    const toMonday = ((8 - now.getDay()) % 7) || 7;
    const chips = [
      [T("dash_quick_1h"), inHour],
      [T("dash_quick_tomorrow_am"), at(1, 9)],
      [T("dash_quick_tomorrow_pm"), at(1, 13)],
      [T("dash_quick_monday"), at(toMonday, 9)]
    ];
    const box = $("#cQuick");
    box.innerHTML = chips.map(([label, ms]) => `<button class="qchip" type="button" data-ms="${ms}" title="${esc(fmtFull(ms))}">${esc(label)}</button>`).join("");
    $$(".qchip", box).forEach((b) => b.addEventListener("click", () => { $("#cWhen").value = toInput(+b.dataset.ms); renderWhen(); saveDraftSoon(); }));
  }

  // "Sends Tue, Oct 21 · 9:00 AM (in 14 hours) · Asia/Kolkata time" — instant confirmation
  // of what the picker means, in the user's own time zone.
  function renderWhen() {
    const el = $("#tzHint");
    if (!el) return;
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || "").replace(/_/g, " ");
    const ms = fromInput($("#cWhen").value);
    el.className = "hint";
    if (!ms) { el.textContent = T("dash_tz_hint", [tz]); return; }
    if (ms < Date.now() - 60000) { el.textContent = T("dash_err_past_time"); el.classList.add("err"); return; }
    el.textContent = T("dash_when_preview", [fmtFull(ms), rel(ms), tz]);
    el.classList.add("whenok");
  }

  // ---- Composer autosave ----
  let draftTimer = null;
  function saveDraftSoon() { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 400); }
  function saveDraft() {
    const d = {
      to: $("#cTo").value, cc: $("#cCc").value, bcc: $("#cBcc").value, subject: $("#cSubject").value,
      html: $("#cBody").innerHTML, when: $("#cWhen").value, editingId, vars: varVals
    };
    const empty = !d.to.trim() && !d.cc.trim() && !d.bcc.trim() && !d.subject.trim() && !plain(d.html).trim();
    try { empty ? localStorage.removeItem(DRAFT_KEY) : localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) {}
  }
  function clearDraft() { clearTimeout(draftTimer); try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }
  function restoreDraft() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (e) {}
    if (!d || typeof d !== "object") return;
    $("#cTo").value = d.to || ""; $("#cCc").value = d.cc || ""; $("#cBcc").value = d.bcc || "";
    $("#cSubject").value = d.subject || "";
    $("#cBody").innerHTML = clean(d.html);
    $("#cWhen").value = d.when || "";
    if ((d.cc || "").trim() || (d.bcc || "").trim()) { $("#ccRow").hidden = false; $("#ccToggle").hidden = true; }
    Object.assign(varVals, d.vars && typeof d.vars === "object" ? d.vars : {});
    // Resume editing only if that scheduled email still exists and can still change.
    const r = d.editingId && auto.scheduled[d.editingId];
    if (r && r.status !== "sent" && r.status !== "sending") {
      editingId = d.editingId;
      $("#composerTitle").textContent = T("dash_composer_title_edit");
      $("#cSchedule").textContent = T("dash_save_changes");
      $("#cCancelEdit").hidden = false;
    }
    renderVars();
  }
  function firstBadAddress() {
    for (const id of ["#cTo", "#cCc", "#cBcc"]) {
      for (const raw of $(id).value.split(/[,;\n]/)) {
        const a = raw.trim();
        if (a && !EMAIL_RE.test(a.replace(/^.*<([^>]+)>\s*$/, "$1"))) return a;
      }
    }
    return "";
  }

  function renderVars() {
    const tokens = tokensIn($("#cSubject").value + " " + $("#cBody").innerHTML);
    const box = $("#cVars");
    if (!tokens.length) { box.hidden = true; box.innerHTML = ""; return; }
    // Keep focus/typing intact: only rebuild when the token set changes.
    const sig = tokens.join("|");
    if (box.dataset.sig === sig && !box.hidden) return;
    box.dataset.sig = sig;
    box.hidden = false;
    box.innerHTML = `<div class="vtitle">${esc(T("dash_vars_title"))}</div><div class="vgrid">` +
      tokens.map((t) => `<div><label for="var_${esc(t)}">{${esc(t)}}</label><input id="var_${esc(t)}" class="finput" data-tok="${esc(t)}" autocomplete="off" value="${esc(varVals[t] || "")}"></div>`).join("") +
      "</div>";
    $$("input[data-tok]", box).forEach((inp) => inp.addEventListener("input", () => { varVals[inp.dataset.tok] = inp.value; saveDraftSoon(); }));
  }
  function substitute(text, html) {
    return String(text || "").replace(TOKEN_RE, (m, name) => {
      const v = (varVals[name] || "").trim();
      return v ? (html ? esc(v) : v) : m;
    });
  }

  async function composeWithAi() {
    const instruction = $("#cAiPrompt").value.trim();
    if (!instruction) { $("#cAiPrompt").focus(); return; }
    const btn = $("#cAiGo");
    busy(btn, true); setStatus("#cStatus", T("dash_ai_writing"));
    try {
      const out = await sw("AI_GENERATE", { task: "compose", instruction, recipient: $("#cTo").value.trim() });
      if (out.subject && !$("#cSubject").value.trim()) $("#cSubject").value = out.subject;
      $("#cBody").innerHTML = clean(out.html);
      renderVars(); saveDraft();
      setStatus("#cStatus", T("dash_ai_done"), "ok");
    } catch (e) {
      setStatus("#cStatus", errText(e.code, e.detail), "err");
      if (e.code === "ai_not_configured") toast(T("dash_err_ai_not_configured"), true);
    } finally { busy(btn, false); }
  }

  async function submitComposer(now) {
    const to = $("#cTo").value.trim();
    const sendAt = now ? Date.now() : fromInput($("#cWhen").value);
    const status = $("#cStatus");
    if (!account) { setStatus(status, T("dash_err_gmail_disconnected"), "err"); renderBanner(); return; }
    if (!to) { setStatus(status, T("dash_err_no_recipient"), "err"); $("#cTo").focus(); return; }
    const bad = firstBadAddress();
    if (bad) { setStatus(status, T("dash_err_bad_address_named", [bad]), "err"); return; }
    if (!now && !sendAt) { setStatus(status, T("dash_err_no_time"), "err"); $("#cWhen").focus(); return; }
    if (!now && sendAt < Date.now() - 60000) { setStatus(status, T("dash_err_past_time"), "err"); return; }
    const subject = substitute($("#cSubject").value.trim(), false);
    const html = clean(substitute($("#cBody").innerHTML, true));
    const missing = tokensIn(subject + " " + html);
    if (missing.length) { setStatus(status, T("dash_vars_missing", [missing.map((t) => "{" + t + "}").join(", ")]), "err"); return; }
    if (now && !confirm(T("dash_confirm_send_now", [to]))) return;
    const btn = now ? $("#cSendNow") : $("#cSchedule");
    busy(btn, true);
    try {
      await call("schedule.save", { id: editingId, to, cc: $("#cCc").value, bcc: $("#cBcc").value, subject, html, sendAt, now: !!now });
      toast(now ? T("dash_sending_toast") : T("dash_scheduled_toast", [fmtFull(sendAt)]));
      resetComposer();   // also clears the autosaved draft
    } catch (e) {
      setStatus(status, errText(e.code, e.detail), "err");
    } finally { busy(btn, false); }
  }

  function resetComposer() {
    clearDraft();
    editingId = null;
    ["#cTo", "#cCc", "#cBcc", "#cSubject", "#cWhen", "#cAiPrompt"].forEach((s) => { $(s).value = ""; });
    $("#cBody").innerHTML = "";
    for (const k of Object.keys(varVals)) delete varVals[k];
    $("#cVars").hidden = true; $("#cVars").dataset.sig = "";
    $("#ccRow").hidden = true; $("#ccToggle").hidden = false;
    $("#composerTitle").textContent = T("dash_composer_title_new");
    $("#cSchedule").textContent = T("dash_schedule_btn");
    $("#cCancelEdit").hidden = true;
    setStatus("#cStatus", "");
    renderQuickChips();
    $("#cWhen").min = toInput(Date.now());
    renderWhen();
  }

  function editScheduled(id) {
    const r = auto.scheduled[id];
    if (!r) return;
    editingId = id;
    $("#cTo").value = (r.to || []).join(", ");
    $("#cCc").value = (r.cc || []).join(", ");
    $("#cBcc").value = (r.bcc || []).join(", ");
    const hasCc = (r.cc || []).length || (r.bcc || []).length;
    $("#ccRow").hidden = !hasCc; $("#ccToggle").hidden = !!hasCc;
    $("#cSubject").value = r.subject || "";
    $("#cBody").innerHTML = clean(r.html);
    $("#cWhen").value = toInput(r.sendAt > Date.now() ? r.sendAt : Date.now() + 3600000);
    $("#composerTitle").textContent = T("dash_composer_title_edit");
    $("#cSchedule").textContent = T("dash_save_changes");
    $("#cCancelEdit").hidden = false;
    renderVars(); renderWhen(); saveDraft();
    selectTab("schedule");
    $("#cTo").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onScheduleAction(e) {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const id = b.dataset.id, act = b.dataset.act;
    const r = auto.scheduled[id];
    try {
      if (act === "edit") return editScheduled(id);
      if (act === "open") return window.open("https://mail.google.com/mail/u/0/#sent/" + encodeURIComponent((r && r.gmailId) || ""), "_blank", "noopener");
      if (act === "sendnow") {
        if (!confirm(T("dash_confirm_send_now", [((r && r.to) || []).join(", ")]))) return;
        busy(b, true);
        await call("schedule.sendNow", { id });
        toast(T("dash_sending_toast"));
      }
      if (act === "delete") {
        if (r && r.status !== "sent" && !confirm(T("dash_confirm_delete_scheduled"))) return;
        await call("schedule.delete", { id });
        if (editingId === id) resetComposer();
      }
    } catch (err) { toast(errText(err.code, err.detail), true); busy(b, false); }
  }

  function schedRow(r, kind) {
    const when = kind === "sent" ? (r.sentAt || r.sendAt) : r.sendAt;
    const to = (r.to || []).join(", ");
    let chip = "", extra = "", acts = "";
    if (kind === "upcoming") {
      chip = r.status === "sending" ? `<span class="chip blue">${esc(T("dash_status_sending"))}</span>`
        : r.error ? `<span class="chip warn">${esc(T("dash_status_retrying"))}</span>` : "";
      acts = r.status === "sending" ? "" : `
        <button class="btn subtle sm" data-act="edit" data-id="${esc(r.id)}">${esc(T("button_edit"))}</button>
        <button class="btn subtle sm" data-act="sendnow" data-id="${esc(r.id)}">${esc(T("dash_send_now"))}</button>
        <button class="btn subtle sm" data-act="delete" data-id="${esc(r.id)}">${esc(T("button_cancel"))}</button>`;
    } else if (kind === "attention") {
      chip = r.status === "missed" ? `<span class="chip warn">${esc(T("dash_status_missed"))}</span>` : `<span class="chip err">${esc(T("dash_status_failed"))}</span>`;
      extra = `<div class="ierr">${esc(r.status === "missed" ? T("dash_missed_explain") : errText(r.error, r.errorDetail))}</div>`;
      acts = `
        <button class="btn primary sm" data-act="sendnow" data-id="${esc(r.id)}">${esc(T("dash_send_now"))}</button>
        <button class="btn subtle sm" data-act="edit" data-id="${esc(r.id)}">${esc(T("dash_reschedule"))}</button>
        <button class="btn subtle sm" data-act="delete" data-id="${esc(r.id)}">${esc(T("button_delete"))}</button>`;
    } else {
      chip = `<span class="chip ok">${esc(T("dash_status_sent"))}</span>`;
      acts = (r.gmailId ? `<button class="btn subtle sm" data-act="open" data-id="${esc(r.id)}">${esc(T("dash_open_in_gmail"))}</button>` : "") +
        `<button class="btn subtle sm" data-act="delete" data-id="${esc(r.id)}" title="${esc(T("dash_remove_from_list"))}">&times;</button>`;
    }
    // "Needs attention" rows carry an explanation, so their buttons sit under the text.
    const below = kind === "attention";
    return `<li><div class="irow">
      <div class="iwhen"><div class="d">${esc(fmtDay(when))}</div><div class="t">${esc(fmtTime(when))}${kind === "upcoming" ? " · " + esc(rel(when)) : ""}</div></div>
      <div class="imain"><div class="ititle"><span class="tt">${esc(r.subject || T("dash_no_subject"))}</span>${chip}</div>
        <div class="isub">${esc(T("dash_to_label", [to]))}</div>${extra}${below ? `<div class="iacts">${acts}</div>` : ""}</div>
      ${below ? "" : `<div class="iacts">${acts}</div>`}</div></li>`;
  }
  function renderSchedule() {
    const all = Object.values(auto.scheduled);
    const attention = all.filter((r) => r.status === "missed" || r.status === "failed").sort((a, b) => a.sendAt - b.sendAt);
    const upcoming = all.filter((r) => r.status === "scheduled" || r.status === "sending").sort((a, b) => a.sendAt - b.sendAt);
    const sent = all.filter((r) => r.status === "sent").sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0)).slice(0, 25);
    $("#attnCard").hidden = !attention.length;
    $("#schedAttention").innerHTML = attention.map((r) => schedRow(r, "attention")).join("");
    $("#schedUpcoming").innerHTML = upcoming.length ? upcoming.map((r) => schedRow(r, "upcoming")).join("")
      : `<li class="empty">${esc(T("dash_upcoming_empty"))}</li>`;
    $("#schedSent").innerHTML = sent.length ? sent.map((r) => schedRow(r, "sent")).join("")
      : `<li class="empty">${esc(T("dash_sent_empty"))}</li>`;
    $("#clearSent").hidden = !sent.length;
    // Without Gmail sign-in in this build there's nothing to send with.
    $("#cSchedule").disabled = $("#cSendNow").disabled = !gmail.configured();
  }

  // ==== AUTO-REPLY ========================================================================
  function bindAutoReply() {
    $("#arToggle").addEventListener("change", onArToggle);
    $("#arCheck").addEventListener("click", async () => {
      const b = $("#arCheck"); busy(b, true);
      try { await call("autoreply.checkNow"); toast(T("dash_ar_checked")); }
      catch (e) { toast(errText(e.code, e.detail), true); }
      finally { busy(b, false); }
    });
    $("#arSetup").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-step]");
      if (!b) return;
      const step = b.dataset.step;
      if (step === "gmail") connectGmail(true);
      else if (step === "rule") openRuleForm(null);
      else if (step === "ai") selectTab("ai");
      else if (step === "on") { busy(b, true); setAutoReply(true).finally(() => busy(b, false)); }
    });

    const ql = $("#queueList");
    ql.addEventListener("click", onQueueAction);
    ql.addEventListener("input", (e) => {
      const d = e.target.closest(".qdraft");
      if (d) dirtyDrafts.set(d.dataset.id, d.innerHTML);
    });
    ql.addEventListener("focusout", (e) => {
      const d = e.target.closest && e.target.closest(".qdraft");
      if (d && dirtyDrafts.has(d.dataset.id)) {
        const id = d.dataset.id;
        call("queue.save", { id, html: clean(dirtyDrafts.get(id)) }).then(() => dirtyDrafts.delete(id)).catch(() => {});
      }
      const next = e.relatedTarget;
      if (queueRenderPending && !(next && next.classList && next.classList.contains("qdraft"))) { queueRenderPending = false; setTimeout(renderQueue, 0); }
    });
    $("#queueDone").addEventListener("click", onQueueAction);
    $("#clearDone").addEventListener("click", () => call("queue.clearDone").catch((e) => toast(errText(e.code), true)));

    $("#ruleNew").addEventListener("click", () => openRuleForm(null));
    $("#rCancel").addEventListener("click", closeRuleForm);
    $("#rSave").addEventListener("click", saveRuleForm);
    $$("input[name='rWho']").forEach((r) => r.addEventListener("change", syncRuleForm));
    $$("input[name='rMode']").forEach((r) => r.addEventListener("change", syncRuleForm));
    $("#ruleList").addEventListener("click", onRuleAction);
    $("#ruleList").addEventListener("change", (e) => {
      const t = e.target.closest("input[data-act='toggle']");
      if (t) call("rules.toggle", { id: t.dataset.id, enabled: t.checked }).catch((err) => toast(errText(err.code), true));
    });
  }

  async function onArToggle(e) {
    const on = e.target.checked;
    e.target.checked = auto.settings.autoReplyEnabled;   // reflect real state until confirmed
    await setAutoReply(on);
  }
  async function setAutoReply(on) {
    if (on) {
      if (!gmail.configured()) { toast(gmailOffMsg(), true); return; }
      if (!account || !account.read) {
        const acct = await connectGmail(true);
        if (!acct || !acct.read) return;
      }
    }
    try {
      await call("settings.update", { patch: { autoReplyEnabled: on } });
      if (on && !auto.rules.length) { toast(T("dash_ar_add_rule_hint")); openRuleForm(null); }
      else if (on) toast(T("dash_ar_on_toast"));
    } catch (err) { toast(errText(err.code), true); }
  }

  function renderArStatus() {
    const st = auto.state, se = auto.settings;
    let txt;
    if (!se.autoReplyEnabled) txt = T("dash_ar_status_off");
    else if (st.lastPollError) txt = T("dash_ar_status_error", [errText(st.lastPollError)]);
    else if (st.lastCheckedAt) txt = T("dash_ar_status_on", [rel(st.lastCheckedAt), String(se.pollMinutes)]);
    else txt = T("dash_ar_status_starting", [String(se.pollMinutes)]);
    $("#arStatus").textContent = txt;
  }
  function renderAutoReply() {
    if (!$("#arToggle")) return;
    $("#arToggle").checked = !!auto.settings.autoReplyEnabled;
    $("#arToggle").disabled = !gmail.configured();
    renderArStatus();
    renderSetup(); renderQueue(); renderRules(); renderLog();
  }

  // Four steps to working auto-reply drafts, each with its own action; the card
  // disappears once everything is in place.
  function renderSetup() {
    const box = $("#arSetup");
    if (!gmail.configured()) { box.hidden = true; return; }
    const on = auto.rules.filter((r) => r.enabled);
    const aiNeeded = !on.length || on.some((r) => r.mode === "ai");
    const steps = [
      { key: "gmail", done: !!(account && account.read), title: "dash_step_gmail", desc: "dash_step_gmail_desc", btn: "dash_connect_gmail" },
      { key: "rule", done: on.length > 0, title: "dash_step_rule", desc: "dash_step_rule_desc", btn: "dash_rule_new" },
      { key: "ai", done: !aiNeeded || ai.isConfigured(aiCfg), title: "dash_step_ai", desc: "dash_step_ai_desc", btn: "dash_set_up_ai" },
      { key: "on", done: !!auto.settings.autoReplyEnabled, title: "dash_step_on", desc: "dash_step_on_desc", btn: "dash_step_turn_on" }
    ].filter((st) => st.key !== "ai" || !ai.builtinAvailable());   // the built-in AI needs no setup step
    if (steps.every((s) => s.done)) { box.hidden = true; return; }
    const next = steps.find((s) => !s.done);
    box.hidden = false;
    box.innerHTML = `<h3>${esc(T("dash_step_title"))}</h3><ol class="steps">` + steps.map((s, i) => `
      <li class="${s.done ? "done" : s === next ? "next" : ""}">
        <span class="num">${s.done ? "✓" : i + 1}</span>
        <span class="stext"><span class="stitle">${esc(T(s.title))}</span><br><span class="sdesc">${esc(T(s.desc))}</span></span>
        ${s.done ? `<span class="sdone">${esc(T("dash_step_done"))}</span>`
          : `<button class="btn ${s === next ? "primary" : "subtle"} sm" type="button" data-step="${s.key}">${esc(T(s.btn))}</button>`}
      </li>`).join("") + "</ol>";
  }

  // The reply is sent to Reply-To when the email sets one — say so plainly, and warn
  // when it points at a different domain than the sender (a classic phishing trick).
  function replyToLine(m) {
    const to = m.replyToEmail;
    if (!to || to === m.fromEmail) return "";
    const dom = (e) => String(e || "").split("@").pop();
    const other = dom(to) !== dom(m.fromEmail);
    return `<div class="${other ? "ierr" : "isub"}">${esc(T(other ? "dash_q_reply_to_warn" : "dash_q_reply_to", [to]))}</div>`;
  }
  function draftHasGaps(html) { return /\[[^\]\n]{1,40}\]|\{[a-z0-9_]+\}/i.test(plain(html)); }
  function queueRow(q) {
    const m = q.msg || {};
    const who = m.fromName || m.fromEmail || "";
    const head = `<div class="qhead"><span class="qfrom">${esc(who)}</span>${m.fromName ? `<span class="qemail">&lt;${esc(m.fromEmail)}&gt;</span>` : ""}
      <span class="chip">${esc(q.ruleName || "")}</span><span class="qtime" title="${esc(fmtFull(m.internalDate || q.createdAt))}">${esc(rel(m.internalDate || q.createdAt))}</span></div>
      <div class="qsubj">${esc(m.subject || T("dash_no_subject"))}</div>
      ${replyToLine(m)}
      <details><summary>${esc(T("dash_q_original"))}</summary><div class="qorig">${esc(m.text || m.snippet || "")}</div></details>`;
    if (q.status === "generating") return `<li class="qitem">${head}<div class="qwait"><span class="spin"></span>${esc(T("dash_q_generating"))}</div></li>`;
    if (q.status === "sending") return `<li class="qitem">${head}<div class="qwait"><span class="spin"></span>${esc(T("dash_status_sending"))}</div></li>`;
    const html = dirtyDrafts.has(q.id) ? dirtyDrafts.get(q.id) : clean(q.draftHtml);
    const failed = q.status === "failed";
    const gaps = html && draftHasGaps(html);
    return `<li class="qitem" data-id="${esc(q.id)}">${head}
      ${failed ? `<div class="ierr">${esc(errText(q.error, q.errorDetail))}</div>` : ""}
      ${html ? `<div class="rich qdraft" contenteditable="true" data-id="${esc(q.id)}" aria-label="${esc(T("dash_q_draft_label"))}">${html}</div>` : ""}
      ${gaps ? `<p class="hint">${esc(T("dash_q_gaps"))}</p>` : ""}
      <div class="actions">
        <span class="status" data-st="${esc(q.id)}"></span><span class="grow"></span>
        <button class="btn subtle sm" data-act="skip" data-id="${esc(q.id)}">${esc(T("dash_q_skip"))}</button>
        <button class="btn subtle sm" data-act="regen" data-id="${esc(q.id)}">${esc(q.mode === "template" ? T("dash_q_refill") : T("dash_q_regenerate"))}</button>
        ${html ? `<button class="btn primary sm" data-act="send" data-id="${esc(q.id)}">${esc(T("dash_q_send"))}</button>` : ""}
      </div></li>`;
  }
  function doneRow(q) {
    const m = q.msg || {};
    const chip = q.status === "sent" ? `<span class="chip ok">${esc(T("dash_status_replied"))}</span>`
      : `<span class="chip">${esc(q.error === "already_replied" ? T("dash_status_already_replied") : T("dash_status_skipped"))}</span>`;
    return `<li><div class="irow"><div class="imain">
      <div class="ititle"><span class="tt">${esc(m.subject || T("dash_no_subject"))}</span>${chip}</div>
      <div class="isub">${esc(m.fromName || m.fromEmail || "")} · ${esc(rel(q.sentAt || q.updatedAt || q.createdAt))}</div></div>
      <div class="iacts"><button class="btn subtle sm" data-act="dismiss" data-id="${esc(q.id)}" title="${esc(T("dash_remove_from_list"))}">&times;</button></div></div></li>`;
  }
  function renderQueue() {
    const ql = $("#queueList");
    const ae = document.activeElement;
    if (ae && ae.classList && ae.classList.contains("qdraft") && ql.contains(ae)) { queueRenderPending = true; return; }   // never clobber an edit in progress
    const items = Object.values(auto.queue);
    const open = items.filter((q) => ["pending", "generating", "failed", "sending"].includes(q.status))
      .sort((a, b) => (b.msg && b.msg.internalDate || b.createdAt) - (a.msg && a.msg.internalDate || a.createdAt));
    const done = items.filter((q) => q.status === "sent" || q.status === "skipped")
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 30);
    for (const id of Array.from(dirtyDrafts.keys())) if (!auto.queue[id] || auto.queue[id].status !== "pending") dirtyDrafts.delete(id);
    const pendingN = open.filter((q) => q.status === "pending").length;
    $("#qCount").textContent = pendingN ? String(pendingN) : "";
    ql.innerHTML = open.length ? open.map(queueRow).join("")
      : `<li class="empty">${esc(auto.settings.autoReplyEnabled ? T("dash_q_empty_on") : T("dash_q_empty_off"))}</li>`;
    $("#queueDone").innerHTML = done.length ? done.map(doneRow).join("") : `<li class="empty">${esc(T("dash_done_empty"))}</li>`;
    $("#clearDone").hidden = !done.length;
  }

  async function onQueueAction(e) {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const id = b.dataset.id, act = b.dataset.act;
    const st = $(`.status[data-st="${CSS.escape(id)}"]`);
    try {
      if (act === "send") {
        const ed = $(`.qdraft[data-id="${CSS.escape(id)}"]`);
        const html = clean(ed ? ed.innerHTML : "");
        if (!plain(html).trim()) { setStatus(st, T("dash_q_empty_draft"), "err"); return; }
        if (draftHasGaps(html) && !confirm(T("dash_q_gaps_confirm"))) return;
        busy(b, true); setStatus(st, T("dash_status_sending"));
        dirtyDrafts.delete(id);
        const res = await call("queue.send", { id, html });
        toast(res && res.skipped ? T("dash_status_already_replied") : T("dash_q_sent_toast"));
      } else if (act === "skip") {
        dirtyDrafts.delete(id);
        await call("queue.skip", { id });
      } else if (act === "regen") {
        if (dirtyDrafts.has(id) && !confirm(T("dash_q_regen_confirm"))) return;
        dirtyDrafts.delete(id);
        busy(b, true); setStatus(st, T("dash_q_generating"));
        await call("queue.regenerate", { id });
      } else if (act === "dismiss") {
        await call("queue.delete", { id });
      }
    } catch (err) {
      setStatus(st, errText(err.code, err.detail), "err");
      busy(b, false);
    }
  }

  // ---- Rules ------------------------------------------------------------------------------
  function ruleSummary(r) {
    const who = r.who === "senders" ? T("dash_rule_sum_from", [r.senders.join(", ")]) : T("dash_rule_sum_any");
    const kw = r.keywords && r.keywords.length ? " · " + T("dash_rule_sum_keywords", [r.keywords.join(", ")]) : "";
    let how;
    if (r.mode === "template") {
      const t = store.get(r.templateId);
      how = T("dash_rule_sum_template", [t ? t.title : T("dash_rule_template_missing")]);
    } else how = r.instructions ? T("dash_rule_sum_ai_with", [r.instructions.slice(0, 80)]) : T("dash_rule_sum_ai");
    return who + kw + " · " + how;
  }
  function renderRules() {
    const ul = $("#ruleList");
    ul.innerHTML = auto.rules.length ? auto.rules.map((r) => `
      <li class="rule"><div class="irow">
        <label class="switch sm" title="${esc(T("dash_rule_toggle_title"))}"><input type="checkbox" data-act="toggle" data-id="${esc(r.id)}" ${r.enabled ? "checked" : ""}><span class="slider"></span></label>
        <div class="imain"><div class="ititle"><span class="tt">${esc(r.name)}</span></div><div class="rsum">${esc(ruleSummary(r))}</div></div>
        <div class="iacts">
          <button class="btn subtle sm" data-act="edit" data-id="${esc(r.id)}">${esc(T("button_edit"))}</button>
          <button class="btn subtle sm" data-act="delete" data-id="${esc(r.id)}" title="${esc(T("button_delete"))}">&times;</button>
        </div></div></li>`).join("")
      : `<li class="empty">${esc(T("dash_rules_empty"))}</li>`;
  }
  function onRuleAction(e) {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const r = auto.rules.find((x) => x.id === b.dataset.id);
    if (b.dataset.act === "edit") openRuleForm(r);
    if (b.dataset.act === "delete" && confirm(T("dash_rule_delete_confirm", [r ? r.name : ""]))) {
      call("rules.delete", { id: b.dataset.id }).then(() => { if (editingRuleId === b.dataset.id) closeRuleForm(); })
        .catch((err) => toast(errText(err.code), true));
    }
  }
  function openRuleForm(r) {
    editingRuleId = r ? r.id : null;
    $("#ruleFormTitle").textContent = r ? T("dash_rule_edit_title") : T("dash_rule_new_title");
    $("#rName").value = r ? r.name : "";
    $(`input[name='rWho'][value='${r && r.who === "any" ? "any" : "senders"}']`).checked = true;
    $("#rSenders").value = r ? (r.senders || []).join(", ") : "";
    $("#rKeywords").value = r ? (r.keywords || []).join(", ") : "";
    $(`input[name='rMode'][value='${r && r.mode === "template" ? "template" : "ai"}']`).checked = true;
    $("#rInstr").value = r ? (r.instructions || "") : "";
    fillTemplateSelects();
    $("#rTemplate").value = r && r.templateId ? r.templateId : "";
    setStatus("#rStatus", "");
    $("#ruleForm").hidden = false;
    syncRuleForm();
    $("#rName").focus();
    $("#ruleForm").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function closeRuleForm() { editingRuleId = null; $("#ruleForm").hidden = true; }
  function syncRuleForm() {
    const who = ($("input[name='rWho']:checked") || {}).value;
    const mode = ($("input[name='rMode']:checked") || {}).value;
    $("#rSenders").hidden = who !== "senders";
    $("#rInstr").hidden = mode !== "ai";
    $("#rTemplate").hidden = mode !== "template";
  }
  async function saveRuleForm() {
    const data = {
      id: editingRuleId,
      name: $("#rName").value,
      who: ($("input[name='rWho']:checked") || {}).value,
      senders: $("#rSenders").value,
      keywords: $("#rKeywords").value,
      mode: ($("input[name='rMode']:checked") || {}).value,
      instructions: $("#rInstr").value,
      templateId: $("#rTemplate").value
    };
    const btn = $("#rSave"); busy(btn, true);
    try {
      await call("rules.save", data);
      toast(T("dash_rule_saved"));
      closeRuleForm();
      if (data.mode === "ai" && !ai.isConfigured(aiCfg)) toast(T("dash_ar_need_ai"), true);
    } catch (e) { setStatus("#rStatus", errText(e.code, e.detail), "err"); }
    finally { busy(btn, false); }
  }

  // ---- Activity log ---------------------------------------------------------------------------
  function logText(l) {
    const subj = l.subject || T("dash_no_subject");
    switch (l.type) {
      case "sent": return T("dash_log_sent", [subj, l.to || ""]);
      case "send_failed": return T("dash_log_send_failed", [subj, errText(l.error)]);
      case "missed": return T("dash_log_missed", [subj]);
      case "draft_created": return T("dash_log_draft_created", [l.from || ""]);
      case "draft_failed": return T("dash_log_draft_failed", [l.from || "", errText(l.error)]);
      case "reply_sent": return T("dash_log_reply_sent", [l.to || ""]);
      case "reply_skipped": return T("dash_log_reply_skipped", [l.from || ""]);
      case "poll_error": return T("dash_log_poll_error", [errText(l.error)]);
      case "cap_reached": return T("dash_log_cap_reached");
      default: return l.type;
    }
  }
  function renderLog() {
    const ul = $("#logList");
    ul.innerHTML = auto.log.length ? auto.log.slice(0, 50).map((l) =>
      `<li><time title="${esc(fmtFull(l.at))}">${esc(fmtDay(l.at) + " " + fmtTime(l.at))}</time><span>${esc(logText(l))}</span></li>`).join("")
      : `<li class="empty">${esc(T("dash_log_empty"))}</li>`;
  }

  // ==== AI WRITER =========================================================================
  const PROVIDER_ORDER = ["builtin", "gemini", "xai", "openai", "custom"];
  const LANGUAGES = [
    ["auto", null], ["English", "English"], ["Spanish", "Español"], ["Portuguese", "Português"], ["German", "Deutsch"],
    ["French", "Français"], ["Italian", "Italiano"], ["Dutch", "Nederlands"], ["Hindi", "हिन्दी"], ["Japanese", "日本語"],
    ["Chinese", "中文"], ["Korean", "한국어"], ["Arabic", "العربية"], ["Russian", "Русский"], ["Turkish", "Türkçe"],
    ["Polish", "Polski"], ["Indonesian", "Bahasa Indonesia"]
  ];

  function bindAi() {
    aiDraft = JSON.parse(JSON.stringify(aiCfg));
    // Show what is actually answering (e.g. "gemini" chosen but no key -> built-in).
    if (ai.activeProvider(aiCfg)) aiDraft.provider = ai.activeProvider(aiCfg);
    $("#provGrid").addEventListener("click", (e) => {
      const b = e.target.closest(".prov");
      if (!b) return;
      syncAiDraft();
      aiDraft.provider = b.dataset.p;
      renderProviderGrid(); renderProviderForm();
    });
    $("#aiKeyShow").addEventListener("click", () => {
      const k = $("#aiKey"); const show = k.type === "password";
      k.type = show ? "text" : "password";
      $("#aiKeyShow").textContent = show ? T("dash_hide") : T("dash_show");
    });
    ["#aiKey", "#aiModel", "#aiBase"].forEach((s) => $(s).addEventListener("input", syncAiDraft));
    $("#aiSave").addEventListener("click", saveAndTestAi);
    $("#aiLoadModels").addEventListener("click", loadModels);
    renderProviderForm();

    $("#pTone").innerHTML = Object.keys(ai.TONES).map((k) => `<option value="${k}">${esc(T("dash_tone_" + k))}</option>`).join("");
    $("#pLanguage").innerHTML = LANGUAGES.map(([v, label]) => `<option value="${esc(v)}">${esc(label || T("dash_lang_auto"))}</option>`).join("");
    $("#pSave").addEventListener("click", saveProfile);

    $$(".segbtn").forEach((b) => b.addEventListener("click", () => {
      tgMode = b.dataset.mode;
      $$(".segbtn").forEach((x) => x.classList.toggle("on", x === b));
      $("#tgGen").hidden = tgMode !== "gen";
      $("#tgImport").hidden = tgMode !== "import";
    }));
    $("#tgGenerate").addEventListener("click", generateTemplate);
    $("#tgConvert").addEventListener("click", convertPasted);
    $("#tgSave").addEventListener("click", saveGeneratedTemplate);
    $("#tgBody").addEventListener("input", renderTgVars);
  }

  function syncAiDraft() {
    if (!aiDraft || aiDraft.provider === "builtin") return;
    const p = aiDraft.provider;
    aiDraft.keys[p] = $("#aiKey").value.trim();
    aiDraft.models[p] = $("#aiModel").value.trim();
    if (p === "custom") aiDraft.customBase = $("#aiBase").value.trim();
  }
  // Built-in AI first (full width, "Free"), then the own-key providers.
  function renderProviderGrid() {
    if (!aiDraft) return;
    const active = ai.activeProvider(aiCfg);
    const order = PROVIDER_ORDER.filter((p) => p !== "builtin" || ai.builtinAvailable());
    $("#provGrid").innerHTML = order.map((p) => {
      const builtin = p === "builtin";
      const ownKey = !builtin && ai.hasOwnKey(Object.assign({}, aiCfg, { provider: p }));
      const label = builtin ? T("dash_prov_builtin") : ai.PROVIDERS[p].label;
      const desc = builtin ? T("dash_prov_desc_builtin", [String(ai.dailyLimit())]) : T("dash_prov_desc_" + p);
      const card = `<button type="button" class="prov ${builtin ? "wide" : ""} ${aiDraft.provider === p ? "on" : ""}" data-p="${p}" role="radio" aria-checked="${aiDraft.provider === p}">
        <span class="pname">${esc(label)}${builtin ? `<span class="free">${esc(T("dash_prov_free"))}</span>` : ""}</span>
        <span class="pdesc">${esc(desc)}</span>
        ${active === p ? `<span class="pset">${esc(T("dash_prov_active"))}</span>` : ownKey ? `<span class="pset">${esc(T("dash_prov_key_saved"))}</span>` : ""}
      </button>`;
      return builtin ? card + `<div class="provsep">${esc(T("dash_prov_byo_heading"))}</div>` : card;
    }).join("");
  }
  function renderProviderForm() {
    const p = aiDraft.provider, info = ai.PROVIDERS[p];
    const builtin = p === "builtin";
    $("#aiByo").hidden = builtin;
    $("#aiKeyNote").hidden = builtin;
    $("#aiBuiltinNote").hidden = !builtin;
    if (builtin) {
      $("#aiBuiltinNote").textContent = T("dash_ai_builtin_note", [String(ai.dailyLimit())]);
      $("#aiBaseRow").hidden = true;
      setStatus("#aiStatus", "");
      return;
    }
    $("#aiKey").value = aiDraft.keys[p] || "";
    $("#aiModel").value = aiDraft.models[p] || "";
    $("#aiModel").placeholder = info.defaultModel ? T("dash_ai_model_default", [info.defaultModel]) : T("dash_ai_model_auto");
    $("#aiBaseRow").hidden = p !== "custom";
    $("#aiBase").value = aiDraft.customBase || "";
    $("#aiKey").placeholder = p === "custom" ? T("dash_ai_key_optional") : "";
    const link = $("#aiKeyLink");
    link.hidden = !info.keyUrl;
    if (info.keyUrl) { link.href = info.keyUrl; link.textContent = T("dash_ai_get_key", [info.label]); }
    $("#aiModels").innerHTML = "";
    setStatus("#aiStatus", "");
  }

  // Request the provider's host permission FIRST (inside the click gesture), then save.
  async function permitAndSave() {
    syncAiDraft();
    const draft = ai.normalize(aiDraft);
    if (draft.provider === "builtin") {   // nothing to permit: the relay answers CORS
      const latest = await ai.load();
      aiCfg = await ai.save(Object.assign(latest, { provider: "builtin" }));
      renderProviderGrid();
      return aiCfg;
    }
    if (!ai.hasOwnKey(draft)) throw codeErr(draft.provider === "custom" ? "bad_url" : "no_key");
    const pattern = ai.originPattern(draft);
    if (!pattern) throw codeErr("bad_url");
    let ok = false;
    try { ok = await chrome.permissions.request({ origins: [pattern] }); } catch (e) { ok = false; }
    if (!ok) throw codeErr("permission_denied");
    const latest = await ai.load();
    aiCfg = await ai.save(Object.assign(latest, { provider: draft.provider, keys: draft.keys, models: draft.models, customBase: draft.customBase }));
    renderProviderGrid();
    return aiCfg;
  }
  async function saveAndTestAi() {
    const btn = $("#aiSave"); busy(btn, true);
    try {
      await permitAndSave();
      setStatus("#aiStatus", T("dash_ai_testing"));
      const res = await sw("AI_TEST");
      setStatus("#aiStatus", res.model === "builtin"
        ? T("dash_ai_test_ok_builtin", [String(res.remaining == null ? ai.dailyLimit() : res.remaining)])
        : T("dash_ai_test_ok", [res.model]), "ok");
      if (analytics) analytics.capture("ai_provider_saved", { provider: aiCfg.provider });
      renderAutoReply();
    } catch (e) { setStatus("#aiStatus", errText(e.code, e.detail), "err"); }
    finally { busy(btn, false); }
  }
  async function loadModels() {
    const btn = $("#aiLoadModels"); busy(btn, true);
    try {
      await permitAndSave();
      setStatus("#aiStatus", T("dash_ai_loading_models"));
      const list = await sw("AI_MODELS");
      $("#aiModels").innerHTML = (list || []).map((id) => `<option value="${esc(id)}"></option>`).join("");
      setStatus("#aiStatus", T("dash_ai_models_found", [String((list || []).length)]), "ok");
      $("#aiModel").focus();
    } catch (e) { setStatus("#aiStatus", errText(e.code, e.detail), "err"); }
    finally { busy(btn, false); }
  }

  function renderProfile() {
    const p = aiCfg.profile || {};
    $("#pName").value = p.name || "";
    $("#pRole").value = p.role || "";
    $("#pCompany").value = p.company || "";
    $("#pTone").value = ai.TONES[p.tone] ? p.tone : "friendly";
    $("#pLanguage").value = LANGUAGES.some(([v]) => v === p.language) ? p.language : "auto";
    $("#pSignature").value = p.signature || "";
    $("#pNotes").value = p.notes || "";
  }
  async function saveProfile() {
    const profile = {
      name: $("#pName").value.trim(), role: $("#pRole").value.trim(), company: $("#pCompany").value.trim(),
      tone: $("#pTone").value, language: $("#pLanguage").value,
      signature: $("#pSignature").value.trim(), notes: $("#pNotes").value.trim().slice(0, 2000)
    };
    const latest = await ai.load();
    aiCfg = await ai.save(Object.assign(latest, { profile }));
    setStatus("#pStatus", T("status_saved"), "ok");
  }

  // ---- New template from AI / pasted text ----------------------------------------------------------
  function showTemplateResult(title, html) {
    $("#tgResult").hidden = false;
    $("#tgTitle").value = title || "";
    $("#tgBody").innerHTML = clean(html);
    setStatus("#tgStatus", "");
    renderTgVars();
    $("#tgTitle").focus();
  }
  function renderTgVars() {
    const vars = tokensIn($("#tgBody").innerHTML);
    $("#tgVars").textContent = vars.length ? T("dash_tg_vars", [vars.map((v) => "{" + v + "}").join(", ")]) : T("dash_tg_no_vars");
  }
  async function generateTemplate() {
    const instruction = $("#tgPrompt").value.trim();
    if (!instruction) { $("#tgPrompt").focus(); return; }
    const btn = $("#tgGenerate"); busy(btn, true);
    setStatus("#tgGenStatus", T("dash_ai_writing"));
    try {
      const out = await sw("AI_GENERATE", { task: "template", instruction });
      showTemplateResult(out.title || ai.importText(out.text).title, out.html);
      setStatus("#tgGenStatus", "");
    } catch (e) { setStatus("#tgGenStatus", errText(e.code, e.detail), "err"); }
    finally { busy(btn, false); }
  }
  function convertPasted() {
    const raw = $("#tgPaste").value;
    if (!raw.trim()) { $("#tgPaste").focus(); return; }
    const out = ai.importText(raw);
    showTemplateResult(out.title, out.html);
  }
  async function saveGeneratedTemplate() {
    const title = $("#tgTitle").value.trim() || T("template_untitled");
    const body = clean($("#tgBody").innerHTML);
    if (!plain(body).trim()) { setStatus("#tgStatus", T("dash_q_empty_draft"), "err"); return; }
    const rec = await store.create({ title, body, folderId: $("#tgCat").value || null });
    if (!rec) { setStatus("#tgStatus", T("dash_err_template_limit"), "err"); return; }
    if (analytics) analytics.capture("template_created", { source: tgMode === "gen" ? "ai" : "ai_import" });
    $("#tgResult").hidden = true;
    $("#tgPrompt").value = ""; $("#tgPaste").value = "";
    toast(T("dash_tg_saved_toast", [title]));
    setStatus("#tgGenStatus", T("dash_tg_saved_toast", [title]), "ok");
  }

  // ==== SETTINGS ===========================================================================
  function bindSettings() {
    $("#devSetup").hidden = !DEV;
    $("#redirectUri").value = gmail.redirectUri();
    $("#copyRedirect").addEventListener("click", () => {
      navigator.clipboard.writeText($("#redirectUri").value).then(() => toast(T("toast_copied"))).catch(() => {});
    });
    const grace = [[15, "dash_grace_15"], [60, "dash_grace_60"], [360, "dash_grace_360"], [1440, "dash_grace_1440"], [-1, "dash_grace_always"]];
    $("#graceSel").innerHTML = grace.map(([v, k]) => `<option value="${v}">${esc(T(k))}</option>`).join("");
    $("#pollSel").innerHTML = [1, 5, 15, 30].map((v) => `<option value="${v}">${esc(T("dash_poll_minutes", [String(v)]))}</option>`).join("");
    $("#graceSel").addEventListener("change", (e) => updateAutoSettings({ lateGraceMinutes: Number(e.target.value) }));
    $("#pollSel").addEventListener("change", (e) => updateAutoSettings({ pollMinutes: Number(e.target.value) }));
    $("#capInput").addEventListener("change", (e) => {
      const v = Math.max(1, Math.min(200, Math.round(Number(e.target.value) || 25)));
      e.target.value = v;
      updateAutoSettings({ maxDraftsPerDay: v });
    });
  }
  function updateAutoSettings(patch) {
    call("settings.update", { patch }).then(() => toast(T("status_saved"))).catch((e) => toast(errText(e.code), true));
  }
  function renderSettings() {
    const se = auto.settings;
    const g = $("#graceSel");
    if (g && document.activeElement !== g) g.value = String([15, 60, 360, 1440, -1].includes(Number(se.lateGraceMinutes)) ? se.lateGraceMinutes : 60);
    const p = $("#pollSel");
    if (p && document.activeElement !== p) p.value = String([1, 5, 15, 30].includes(Number(se.pollMinutes)) ? se.pollMinutes : 5);
    const c = $("#capInput");
    if (c && document.activeElement !== c) c.value = se.maxDraftsPerDay;
  }

  boot().catch((e) => console.error("[CR] dashboard boot failed", e));
})();

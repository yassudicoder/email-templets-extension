/* Canned Responses — content/picker.js
 * The in-page template picker (command palette). Shadow-DOM isolated so host
 * CSS can't break it and vice-versa. Data-driven from the store, keyboard-first,
 * with inline variable fill. Week 1: functional + simple substring search.
 * Week 2: real fuzzy ranking, recents, polish. */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});
  const plain = (html) => (NS.sanitize ? NS.sanitize.toPlainText(html) : html);

  let host = null, shadow = null, open = false;
  let state = null; // { templates, filtered, index, query, onInsert }

  function ensureHost() {
    if (host) return;
    host = document.createElement("div");
    // pointer-events:none on the host -> it never blocks the page or the other
    // floating window; only the panel itself captures clicks.
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;inset:0;display:none;pointer-events:none;";
    shadow = host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);
  }

  function close() {
    open = false; state = null;
    if (host) host.style.display = "none";
    if (shadow) shadow.innerHTML = "";
  }

  function styles() {
    return `
      .panel{position:fixed;top:16%;left:50%;transform:translateX(-50%);width:min(560px,92vw);
        background:#fff;border-radius:12px;box-shadow:0 14px 48px rgba(0,0,0,.30);
        font:14px/1.45 system-ui,-apple-system,sans-serif;color:#111;overflow:hidden;
        pointer-events:auto;border:1px solid #e6e8eb;}
      .phead{display:flex;align-items:center;justify-content:space-between;padding:7px 8px 7px 14px;
        border-bottom:1px solid #f0f0f0;cursor:move;user-select:none;}
      .phead .ptitle{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#9aa1a8;}
      .phead .pclose{border:0;background:transparent;font-size:18px;line-height:1;color:#9aa1a8;cursor:pointer;
        width:26px;height:26px;border-radius:6px;}
      .phead .pclose:hover{background:#f0f0f0;color:#333;}
      .search{width:100%;box-sizing:border-box;padding:13px 16px;border:0;outline:0;font-size:15px;
        border-bottom:1px solid #eee;}
      ul{list-style:none;margin:0;padding:6px;max-height:46vh;overflow:auto;}
      li{padding:8px 8px 8px 12px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:6px;}
      li .rowmain{flex:1;min-width:0;}
      li .t{font-weight:600;}
      li .p{color:#666;font-size:12px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      li.sel{background:#2563eb;color:#fff;} li.sel .p{color:#dbe6ff;}
      li .rowacts{display:none;gap:2px;flex:0 0 auto;}
      li:hover .rowacts, li.sel .rowacts{display:flex;}
      li .ic{border:0;background:transparent;cursor:pointer;font-size:13px;color:#9aa1a8;
        width:26px;height:26px;border-radius:6px;line-height:1;}
      li .ic:hover{background:rgba(0,0,0,.08);color:#333;}
      li.sel .ic{color:#dbe6ff;} li.sel .ic:hover{background:rgba(255,255,255,.22);color:#fff;}
      .empty{padding:18px 16px;color:#888;}
      .ft{padding:8px 10px 8px 14px;color:#999;font-size:12px;border-top:1px solid #eee;
        display:flex;align-items:center;justify-content:space-between;}
      .ft .hints{display:flex;gap:12px;}
      .ft .newbtn{border:0;background:#eef3fb;color:#2563eb;border-radius:7px;padding:5px 10px;
        font-size:12px;font-weight:600;cursor:pointer;}
      .ft .newbtn:hover{background:#e0ebfb;}
      .varbox{padding:16px;} .varbox h3{margin:0 0 4px;font-size:14px;}
      .varbox label{display:block;font-weight:600;margin:12px 0 4px;font-size:13px;}
      .varbox input{width:100%;box-sizing:border-box;padding:9px 11px;font-size:14px;
        border:1px solid #cbd5e1;border-radius:8px;}
      .varbox .vhead{display:flex;align-items:center;gap:10px;margin-bottom:4px;}
      .varbox .vhead h3{margin:0;font-size:14px;}
      .varbox .backarrow{width:32px;height:32px;flex:0 0 auto;border:0;border-radius:8px;
        background:#f1f5f9;color:#111;font-size:20px;line-height:1;cursor:pointer;
        display:flex;align-items:center;justify-content:center;}
      .varbox .backarrow:hover{background:#e2e8f0;}
      .varbox .row{margin-top:16px;text-align:right;}
      .varbox button.primary{padding:8px 16px;border:0;border-radius:8px;background:#2563eb;color:#fff;
        font-size:14px;cursor:pointer;}
      .ft .lbtns{display:flex;gap:6px;}
      .ft .aibtn{border:0;background:#f3efff;color:#6d28d9;border-radius:7px;padding:5px 10px;
        font-size:12px;font-weight:600;cursor:pointer;}
      .ft .aibtn:hover{background:#ebe4ff;}
      .aibox textarea,.aibox select{width:100%;box-sizing:border-box;padding:9px 11px;font:14px/1.45 system-ui,-apple-system,sans-serif;
        border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#111;resize:vertical;}
      .aibox textarea:focus,.aibox select:focus{outline:0;border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.14);}
      .aibox .ctxrow{display:flex;align-items:center;gap:8px;font-weight:500;margin:12px 0 4px;cursor:pointer;}
      .aibox .ctxrow input{width:auto;margin:0;}
      .aibox .ctxsub{color:#6b7280;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .aibox .airow{display:flex;gap:8px;align-items:center;margin-top:10px;}
      .aibox .airow select{width:auto;flex:0 1 auto;padding:7px 9px;font-size:13px;}
      .aibox .grow{flex:1;}
      .aibox .aierr{margin-top:10px;padding:9px 11px;border-radius:8px;background:#fdecec;color:#b91c1c;font-size:13px;
        display:flex;gap:10px;align-items:center;}
      .aibox .aierr button{margin-left:auto;border:0;background:#fff;color:#b91c1c;border-radius:7px;padding:4px 10px;font-weight:600;cursor:pointer;}
      .aibox .aiwait{margin-top:10px;color:#6b7280;font-size:13px;}
      .aibox .spin{display:inline-block;width:11px;height:11px;border-radius:50%;border:2px solid #2563eb;
        border-right-color:transparent;animation:crspin .7s linear infinite;vertical-align:-1px;margin-right:7px;}
      @keyframes crspin{to{transform:rotate(360deg);}}
      .aibox .aisetup{margin-top:12px;padding:14px;border-radius:10px;background:#f3efff;}
      .aibox .aisetup b{display:block;margin-bottom:4px;font-size:14px;}
      .aibox .aisetup p{margin:0 0 12px;color:#4b5563;font-size:13px;}
      .aibox .row{display:flex;gap:8px;justify-content:flex-end;}
      .aibox button.ghost{padding:8px 12px;border:1px solid #d8dce2;border-radius:8px;background:transparent;color:#374151;font-size:13px;cursor:pointer;}
      .aibox button.ghost:hover{background:#f1f5f9;}
      .aibox button.primary:disabled{opacity:.6;cursor:default;}
      .aibox .aifoot{color:#9aa1a8;font-size:11.5px;margin-top:10px;}
      .cr-dark{background:#1f2430;color:#e6e8ee;border-color:#333b4d;}
      .cr-dark .phead{border-bottom-color:#2c3342;} .cr-dark .phead .ptitle{color:#7e8799;}
      .cr-dark .phead .pclose{color:#9aa3b2;} .cr-dark .phead .pclose:hover{background:#2c3342;color:#e6e8ee;}
      .cr-dark .search{background:transparent;color:#e6e8ee;border-bottom-color:#2c3342;}
      .cr-dark li .p{color:#9aa3b2;}
      .cr-dark li .ic{color:#8b93a3;} .cr-dark li .ic:hover{background:rgba(255,255,255,.08);color:#fff;}
      .cr-dark .empty{color:#8b93a3;}
      .cr-dark .ft{border-top-color:#2c3342;color:#7e8799;}
      .cr-dark .ft .newbtn{background:#1e2c45;color:#7eb0ff;} .cr-dark .ft .newbtn:hover{background:#24365a;}
      .cr-dark .varbox input{background:#232838;border-color:#3a4252;color:#e6e8ee;}
      .cr-dark .varbox .backarrow{background:#2a3140;color:#e6e8ee;} .cr-dark .varbox .backarrow:hover{background:#333b4d;}
      .cr-dark .ft .aibtn{background:#2d2350;color:#c4b5fd;} .cr-dark .ft .aibtn:hover{background:#372b63;}
      .cr-dark .aibox textarea,.cr-dark .aibox select{background:#232838;border-color:#3a4252;color:#e6e8ee;}
      .cr-dark .aibox .ctxsub,.cr-dark .aibox .aiwait{color:#9aa3b2;}
      .cr-dark .aibox .aisetup{background:#2d2350;} .cr-dark .aibox .aisetup p{color:#c9cfdb;}
      .cr-dark .aibox .aierr{background:#3a1c1f;color:#fca5a5;} .cr-dark .aibox .aierr button{background:#4a2428;color:#fecaca;}
      .cr-dark .aibox button.ghost{border-color:#3a4252;color:#cdd3df;} .cr-dark .aibox button.ghost:hover{background:#2a3140;}
    `;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // "cr-dark" when the resolved theme is dark (honors the Light/Dark/System toggle).
  function themeCls() {
    try { return NS.theme.resolve(NS.store.getSettings().theme) === "dark" ? "cr-dark" : ""; }
    catch (e) { return ""; }
  }

  function filterTemplates(q) {
    const needle = q.trim().toLowerCase();
    if (!needle) return state.templates;
    return state.templates.filter((t) =>
      (t.title + " " + plain(t.body)).toLowerCase().includes(needle));
  }

  function paintList() {
    ensureHost();
    host.style.display = "block";
    const items = state.filtered;
    shadow.innerHTML = `
      <style>${styles()}</style>
      <div class="panel ${themeCls()}">
        <div class="phead"><span class="ptitle">${esc(CR.i18n.t("picker_panel_title"))}</span><button class="pclose" title="${esc(CR.i18n.t("button_close_tooltip"))}">&times;</button></div>
        <input class="search" placeholder="${esc(CR.i18n.t("search_placeholder"))}" value="${esc(state.query)}" />
        ${items.length ? `<ul>${items.map((t, i) => `
          <li data-i="${i}" class="${i === state.index ? "sel" : ""}">
            <div class="rowmain">
              <div class="t">${esc(t.title)}</div>
              <div class="p">${esc(plain(t.body))}</div>
            </div>
            <div class="rowacts">
              <button class="ic" data-act="edit" title="${esc(CR.i18n.t("button_edit"))}">&#9998;</button>
              <button class="ic" data-act="del" title="${esc(CR.i18n.t("button_delete"))}">&#128465;</button>
            </div>
          </li>`).join("")}</ul>`
          : `<div class="empty">${esc(CR.i18n.t("picker_no_matches_query", [state.query]))}</div>`}
        <div class="ft">
          <span class="lbtns">
            <button class="newbtn" id="cr-new" title="${esc(CR.i18n.t("picker_new_template_title"))}">${esc(CR.i18n.t("picker_new_template_btn"))}</button>
            <button class="aibtn" id="cr-ai" title="${esc(CR.i18n.t("picker_ai_btn_title"))}">${esc(CR.i18n.t("picker_ai_btn"))}</button>
          </span>
          <span class="hints"><span>${esc(CR.i18n.t("picker_hint_navigate"))}</span><span>${esc(CR.i18n.t("picker_hint_insert"))}</span><span>${esc(CR.i18n.t("picker_hint_close"))}</span></span>
        </div>
      </div>`;
    const newBtn = shadow.getElementById("cr-new");
    if (newBtn) newBtn.addEventListener("click", () => {
      // Keep the picker open; open the new-template window cascaded off it.
      const app = globalThis.CR && globalThis.CR.app;
      if (app && app.newTemplate) app.newTemplate(cascadePos());
      else if (globalThis.CR && globalThis.CR.manager) globalThis.CR.manager.openNew(cascadePos());
    });
    shadow.getElementById("cr-ai").addEventListener("click", () => { if (state && state.ai) state.ai.configured = undefined; renderAi(); });
    const search = shadow.querySelector(".search");
    search.focus();
    const v = search.value; search.value = ""; search.value = v; // caret to end
    search.addEventListener("input", onSearch);
    search.addEventListener("keydown", onKey);
    shadow.querySelector(".pclose").addEventListener("click", close);
    afterRender();
    shadow.querySelectorAll("li").forEach((li) => {
      li.addEventListener("mouseenter", () => { state.index = +li.dataset.i; highlight(); });
      li.addEventListener("click", (e) => {
        const actEl = e.target.closest("[data-act]");
        const tpl = state.filtered[+li.dataset.i];
        if (actEl) {
          e.stopPropagation();
          if (actEl.dataset.act === "edit") editTemplate(tpl);
          else if (actEl.dataset.act === "del") deleteTemplate(tpl);
          return;
        }
        choose(+li.dataset.i);
      });
    });
  }

  // Position for a window cascaded off the picker's current spot (overlapping,
  // offset so it's not totally covering the picker).
  function cascadePos() {
    const p = shadow && shadow.querySelector(".panel");
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { left: r.left + 34, top: r.top + 34 };
  }

  function editTemplate(tpl) {
    if (!tpl) return;
    // Keep the picker open; open the edit window cascaded off it.
    const app = globalThis.CR && globalThis.CR.app;
    if (app && app.editTemplate) app.editTemplate(tpl.id, cascadePos());
    else if (NS.manager) NS.manager.openEdit(tpl.id, cascadePos());
  }

  async function deleteTemplate(tpl) {
    if (!tpl || !NS.store) return;
    if (!confirm(CR.i18n.t("picker_delete_confirm", [tpl.title || CR.i18n.t("template_untitled")]))) return;
    await NS.store.softDelete(tpl.id);
    state.templates = NS.store.getAll();
    state.filtered = filterTemplates(state.query);
    if (state.index >= state.filtered.length) state.index = Math.max(0, state.filtered.length - 1);
    paintList();
  }

  function highlight() {
    shadow.querySelectorAll("li").forEach((li) =>
      li.classList.toggle("sel", +li.dataset.i === state.index));
  }

  function onSearch(e) {
    state.query = e.target.value;
    state.filtered = filterTemplates(state.query);
    state.index = 0;
    paintList();
  }

  function onKey(e) {
    const n = state.filtered.length;
    if (e.key === "ArrowDown") { e.preventDefault(); if (n) { state.index = (state.index + 1) % n; highlight(); } }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (n) { state.index = (state.index - 1 + n) % n; highlight(); } }
    else if (e.key === "Enter") { e.preventDefault(); if (n) choose(state.index); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  }

  const TOKEN_RE = /\{([a-z0-9_]+)\}/gi;

  // Auto tokens resolve at insert time with NO prompt. Everything else
  // ({first_name}, {company}, …) is a fill-in the user is asked for.
  const AUTO = {
    date: () => new Date().toLocaleDateString(),
    time: () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    day:  () => new Date().toLocaleDateString([], { weekday: "long" })
  };
  function tokensIn(body) {
    const out = [], seen = new Set();
    let m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(body))) {
      const key = m[1].toLowerCase();
      if (!seen.has(m[1]) && !AUTO[key]) { seen.add(m[1]); out.push(m[1]); }   // skip auto tokens
    }
    return out;
  }
  // Replace every {token}: auto -> computed value, prompted -> user value (escaped),
  // unknown -> left untouched so a stray brace is never silently eaten.
  function substitute(body, vals) {
    return body.replace(TOKEN_RE, (m, name) => {
      const key = name.toLowerCase();
      if (AUTO[key]) return esc(AUTO[key]());
      return vals[name] ? esc(vals[name]) : m;
    });
  }

  function choose(i) {
    const tpl = state.filtered[i];
    if (!tpl) return;
    const tokens = tokensIn(tpl.body);
    if (tokens.length) renderVarFill(tpl, tokens);
    else finish(substitute(tpl.body, {}));   // still resolve auto tokens (date/time/day)
  }

  function renderVarFill(tpl, tokens) {
    shadow.innerHTML = `
      <style>${styles()}</style>
      <div class="panel ${themeCls()}"><div class="varbox">
        <div class="vhead">
          <button class="backarrow" id="back" title="${esc(CR.i18n.t("picker_back_btn_title"))}" aria-label="${esc(CR.i18n.t("button_back"))}">&larr;</button>
          <h3>${esc(CR.i18n.t("picker_fill_heading", [tpl.title]))}</h3>
        </div>
        ${tokens.map((t) => `<label>${esc(t)}</label>
          <input data-tok="${esc(t)}" placeholder="${esc(t)}" autocomplete="off" />`).join("")}
        <div class="row"><button class="primary" id="ins">${esc(CR.i18n.t("picker_insert_btn"))}</button></div>
      </div></div>`;
    const goBack = () => { if (state && state.fillOnly) close(); else paintList(); };
    const inputs = Array.from(shadow.querySelectorAll("input[data-tok]"));
    if (inputs[0]) inputs[0].focus();
    const apply = () => {
      const vals = {};
      inputs.forEach((inp) => { vals[inp.dataset.tok] = inp.value.trim(); });
      finish(substitute(tpl.body, vals));
    };
    shadow.getElementById("ins").addEventListener("click", apply);
    shadow.getElementById("back").addEventListener("click", (e) => { e.preventDefault(); goBack(); });
    inputs.forEach((inp) => inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); apply(); }
      else if (e.key === "Escape") { e.preventDefault(); goBack(); }     // Esc steps back, not close
    }));
    afterRender();
  }

  // ---- "Write with AI" view -------------------------------------------------
  // The provider call happens in the service worker (it holds the user's key); this
  // view only sends the instruction + — if the user leaves the box ticked — the open
  // conversation, and gets text back. Nothing is read from the page until Generate.
  const TONES = ["friendly", "professional", "concise", "formal", "casual"];
  function textToHtml(t) {
    return esc(String(t || "").trim()).replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
  }
  function aiErrText(code) {
    const key = "dash_err_" + (code || "error");
    const m = CR.i18n.t(key);
    return m === key ? CR.i18n.t("dash_err_error") : m;
  }
  function renderAi() {
    if (!state) return;
    const a = state.ai || (state.ai = { instruction: "", tone: "", useCtx: true, draft: "", html: "", busy: false, error: "" });
    if (a.ctx === undefined) { try { a.ctx = state.aiContext ? state.aiContext() : null; } catch (e) { a.ctx = null; } }
    if (a.configured === undefined) checkAiStatus(a);
    const t = (k, s) => esc(CR.i18n.t(k, s));
    const ctx = a.ctx;
    // No AI provider yet: say so up front (with the way to fix it) instead of
    // letting the user write an instruction that can only fail.
    if (a.configured === false) {
      shadow.innerHTML = `
        <style>${styles()}</style>
        <div class="panel ${themeCls()}"><div class="varbox aibox">
          <div class="vhead">
            <button class="backarrow" id="back" title="${t("picker_back_btn_title")}" aria-label="${t("button_back")}">&larr;</button>
            <h3>${t("picker_ai_heading")}</h3>
          </div>
          <div class="aisetup"><b>${t("picker_ai_setup_title")}</b><p>${t("picker_ai_setup_desc")}</p>
            <button class="primary" id="aiSetup">${t("dash_set_up_ai")}</button></div>
        </div></div>`;
      shadow.getElementById("back").addEventListener("click", (e) => { e.preventDefault(); paintList(); });
      shadow.getElementById("aiSetup").addEventListener("click", openAiSetup);
      shadow.getElementById("aiSetup").focus();
      afterRender();
      return;
    }
    shadow.innerHTML = `
      <style>${styles()}</style>
      <div class="panel ${themeCls()}"><div class="varbox aibox">
        <div class="vhead">
          <button class="backarrow" id="back" title="${t("picker_back_btn_title")}" aria-label="${t("button_back")}">&larr;</button>
          <h3>${t("picker_ai_heading")}</h3>
        </div>
        ${ctx ? `<label class="ctxrow"><input type="checkbox" id="aiCtx" ${a.useCtx ? "checked" : ""}>
          <span>${t("picker_ai_use_thread")}</span><span class="ctxsub">${esc(ctx.subject || "")}</span></label>` : ""}
        <textarea id="aiInstr" rows="3" placeholder="${t(ctx && a.useCtx ? "picker_ai_reply_ph" : "picker_ai_compose_ph")}">${esc(a.instruction)}</textarea>
        <div class="airow">
          <select id="aiTone" title="${t("dash_profile_tone")}">
            <option value="">${t("picker_ai_tone_default")}</option>
            ${TONES.map((k) => `<option value="${k}" ${a.tone === k ? "selected" : ""}>${t("dash_tone_" + k)}</option>`).join("")}
          </select>
          <span class="grow"></span>
          <button class="primary" id="aiGo" ${a.busy ? "disabled" : ""}>${t(a.draft ? "dash_q_regenerate" : "dash_generate")}</button>
        </div>
        ${a.busy ? `<div class="aiwait"><span class="spin"></span>${t("dash_ai_writing")}</div>` : ""}
        ${a.error ? `<div class="aierr"><span>${esc(aiErrText(a.error))}</span>${["ai_not_configured", "ai_auth", "ai_builtin_limit", "ai_builtin_unavailable"].includes(a.error) ? `<button id="aiSetup">${t("dash_set_up_ai")}</button>` : ""}</div>` : ""}
        ${a.draft ? `<label for="aiDraft">${t("picker_ai_draft_label")}</label>
          <textarea id="aiDraft" rows="8">${esc(a.draft)}</textarea>
          <div class="row">
            <button class="ghost" id="aiSaveTpl">${t("picker_ai_save_template")}</button>
            <button class="primary" id="aiInsert">${t("picker_insert_btn")}</button>
          </div>` : ""}
        <div class="aifoot">${t("picker_ai_footnote")}${a.remaining != null ? " · " + t("picker_ai_remaining", [String(a.remaining)]) : ""}</div>
      </div></div>`;
    const instr = shadow.getElementById("aiInstr");
    const draft = shadow.getElementById("aiDraft");
    const sync = () => {
      a.instruction = instr.value;
      a.tone = shadow.getElementById("aiTone").value;
      const c = shadow.getElementById("aiCtx"); if (c) a.useCtx = c.checked;
      if (draft) a.draft = draft.value;
    };
    const goBack = () => { sync(); paintList(); };
    shadow.getElementById("back").addEventListener("click", (e) => { e.preventDefault(); goBack(); });
    shadow.getElementById("aiGo").addEventListener("click", () => { sync(); generateAi(); });
    const c = shadow.getElementById("aiCtx");
    if (c) c.addEventListener("change", () => { sync(); renderAi(); });
    const setup = shadow.getElementById("aiSetup");
    if (setup) setup.addEventListener("click", openAiSetup);
    if (draft) {
      shadow.getElementById("aiInsert").addEventListener("click", () => { sync(); insertAi(); });
      shadow.getElementById("aiSaveTpl").addEventListener("click", () => { sync(); saveAiTemplate(); });
    }
    [instr, draft].forEach((el) => el && el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); goBack(); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault(); sync();
        if (el === draft) insertAi(); else generateAi();
      }
    }));
    (draft && !a.busy ? draft : instr).focus();
    afterRender();
  }
  function openAiSetup() {
    try { chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD", tab: "ai" }, () => void chrome.runtime.lastError); } catch (e) {}
  }
  // null while asking the service worker; true/false once known (re-renders on answer).
  function checkAiStatus(a) {
    a.configured = null;
    try {
      chrome.runtime.sendMessage({ type: "AI_STATUS" }, (res) => {
        void chrome.runtime.lastError;
        if (!res || !res.ok) return;              // unknown -> keep the normal view
        a.configured = !!(res.data && res.data.configured);
        if (state && state.ai === a && !a.configured) renderAi();
      });
    } catch (e) {}
  }
  function generateAi() {
    const a = state && state.ai;
    if (!a || a.busy) return;
    const useCtx = !!(a.ctx && a.useCtx);
    a.busy = true; a.error = "";
    renderAi();
    const done = (res) => {
      if (!state || state.ai !== a) return;   // picker closed meanwhile
      a.busy = false;
      if (res && res.ok) {
        a.draft = res.data.text; a.html = res.data.html; a.draftOrig = res.data.text;
        a.remaining = res.data.remaining == null ? null : res.data.remaining;   // built-in AI only
      }
      else a.error = (res && res.error) || "error";
      renderAi();
    };
    try {
      chrome.runtime.sendMessage({
        type: "AI_GENERATE", task: useCtx ? "reply" : "compose",
        instruction: a.instruction, tone: a.tone, context: useCtx ? a.ctx : null
      }, (res) => { void chrome.runtime.lastError; done(res); });
    } catch (e) { done(null); }
  }
  // The SW's HTML when the draft is untouched, else re-convert the edited text.
  function aiHtml(a) { return a.draft === a.draftOrig && a.html ? a.html : textToHtml(a.draft); }
  function insertAi() {
    const a = state && state.ai;
    if (!a || !a.draft.trim()) return;
    finish(aiHtml(a));
  }
  async function saveAiTemplate() {
    const a = state && state.ai;
    if (!a || !a.draft.trim() || !NS.store) return;
    const title = (a.instruction.trim() || a.draft.trim()).split("\n")[0].slice(0, 60) || CR.i18n.t("template_untitled");
    const html = aiHtml(a);
    const rec = await NS.store.create({ title, body: NS.sanitize ? NS.sanitize.sanitize(html) : html });
    if (NS.ui && NS.ui.cue) NS.ui.cue(CR.i18n.t(rec ? "picker_ai_saved_template" : "dash_err_template_limit"));
  }

  // ---- Draggable panel + remembered position ----------------------------
  let pickerPos = null;
  function loadPickerPos() {
    const s = NS.store && NS.store.getSettings && NS.store.getSettings();
    if (s && s.pickerPos) pickerPos = s.pickerPos;
  }
  function applyPickerPos() {
    const p = shadow && shadow.querySelector(".panel");
    // The fill box (abbreviation-expand) opens centered, not at the search
    // window's remembered corner — but it's still draggable below.
    if (!p || !pickerPos || (state && state.fillOnly)) return;
    const w = p.getBoundingClientRect().width || 560;
    const left = Math.max(0, Math.min(pickerPos.left, g.innerWidth - w));
    const top = Math.max(0, Math.min(pickerPos.top, g.innerHeight - 44));
    p.style.left = left + "px"; p.style.top = top + "px"; p.style.transform = "none";
  }
  function makeDraggable() {
    const p = shadow.querySelector(".panel");
    const handle = shadow.querySelector(".phead, .vhead");   // list header or var-fill header
    if (!p || !handle) return;
    handle.style.cursor = "move";
    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button, input, textarea, select")) return;
      e.preventDefault();
      const r = p.getBoundingClientRect();
      const offX = e.clientX - r.left, offY = e.clientY - r.top, w = r.width;
      p.style.transform = "none";
      const onMove = (ev) => {
        const left = Math.max(0, Math.min(ev.clientX - offX, g.innerWidth - w));
        const top = Math.max(0, Math.min(ev.clientY - offY, g.innerHeight - 44));
        p.style.left = left + "px"; p.style.top = top + "px";
        pickerPos = { left, top };
      };
      const onUp = () => {
        g.removeEventListener("mousemove", onMove, true);
        g.removeEventListener("mouseup", onUp, true);
        // Don't persist drags of the transient fill box; only the search window.
        if (pickerPos && NS.store && !(state && state.fillOnly)) NS.store.updateSettings({ pickerPos }).catch(() => {});
      };
      g.addEventListener("mousemove", onMove, true);
      g.addEventListener("mouseup", onUp, true);
    });
  }
  // Shared z-index so the most-recently opened/clicked window sits on top.
  function raise() { NS.__z = (NS.__z || 2147483000) + 1; if (host) host.style.zIndex = NS.__z; }
  function afterRender() {
    applyPickerPos(); makeDraggable(); raise();
    const p = shadow.querySelector(".panel");
    if (p) p.addEventListener("mousedown", raise);
  }

  function finish(html) {
    const cb = state.onInsert;
    close();
    if (cb) cb(html);
  }

  function openPicker(templates, opts) {
    if (open) return;
    open = true;
    state = {
      templates: templates || [],
      filtered: templates || [],
      index: 0, query: "",
      onInsert: (opts || {}).onInsert,
      aiContext: (opts || {}).aiContext
    };
    loadPickerPos();
    paintList();
  }

  // Open directly into the variable-fill box for one template (used by
  // abbreviation-expand). No tokens -> insert immediately, no UI.
  function openFill(tpl, onInsert) {
    const tokens = tokensIn(tpl.body);
    if (!tokens.length) { if (onInsert) onInsert(substitute(tpl.body, {})); return; }
    if (open) return;
    open = true;
    state = { templates: [], filtered: [], index: 0, query: "", onInsert, fillOnly: true };
    loadPickerPos();
    ensureHost();
    host.style.display = "block";
    renderVarFill(tpl, tokens);
  }

  NS.picker = { open: openPicker, fill: openFill, close, isOpen: () => open };
})(globalThis);

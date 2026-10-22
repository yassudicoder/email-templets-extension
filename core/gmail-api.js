/* Canned Responses — core/gmail-api.js
 * "Connect Gmail": OAuth (chrome.identity.launchWebAuthFlow, implicit grant) plus
 * the handful of Gmail API calls scheduled send and auto-reply drafts need.
 * Context-agnostic (service worker + dashboard page) — no DOM, no DOMParser.
 *
 * Privacy/safety model:
 *   - The access token lives ONLY in chrome.storage.session (memory; trusted
 *     contexts only — content scripts can't read it) and is never synced.
 *   - Scopes are incremental: gmail.send to schedule; gmail.readonly is asked for
 *     only when the user turns on auto-reply drafts.
 *   - Requests go straight from this browser to Google. Nothing touches our servers. */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});

  const SCOPE_SEND = "https://www.googleapis.com/auth/gmail.send";
  const SCOPE_READ = "https://www.googleapis.com/auth/gmail.readonly";
  const SCOPE_EMAIL = "email";
  const API = "https://gmail.googleapis.com/gmail/v1/users/me";
  const ACCOUNT_KEY = "cr.gmail";          // storage.local: { email, send, read, connectedAt }
  const TOKEN_KEY = "cr.gmail.token";      // storage.session: { token, expiresAt, send, read }
  // Optional host permissions requested on Connect (CORS-proof API access).
  const ORIGINS = ["https://gmail.googleapis.com/*", "https://www.googleapis.com/*", "https://oauth2.googleapis.com/*"];

  function err(code, message) { const e = new Error(message || code); e.code = code; return e; }

  function clientId() { return (NS.googleConfig && NS.googleConfig.GOOGLE_OAUTH_CLIENT_ID) || ""; }
  function configured() { return !!clientId(); }
  function redirectUri() {
    try { return chrome.identity.getRedirectURL(); } catch (e) { return ""; }
  }

  // ---- storage helpers -----------------------------------------------------
  function getLocal(key) {
    return new Promise((res) => { try { chrome.storage.local.get(key, (r) => res(r && r[key])); } catch (e) { res(null); } });
  }
  function setLocal(key, val) {
    return new Promise((res) => { try { chrome.storage.local.set({ [key]: val }, () => res()); } catch (e) { res(); } });
  }
  function session() { return (chrome.storage && chrome.storage.session) || chrome.storage.local; }
  function getToken0() {
    return new Promise((res) => { try { session().get(TOKEN_KEY, (r) => res(r && r[TOKEN_KEY])); } catch (e) { res(null); } });
  }
  function setToken0(val) {
    return new Promise((res) => {
      try { val ? session().set({ [TOKEN_KEY]: val }, () => res()) : session().remove(TOKEN_KEY, () => res()); }
      catch (e) { res(); }
    });
  }

  async function getAccount() {
    const a = await getLocal(ACCOUNT_KEY);
    return a && a.email ? a : null;
  }

  // ---- OAuth (implicit grant via launchWebAuthFlow) ------------------------
  function authUrl(opts) {
    const p = new URLSearchParams({
      client_id: clientId(),
      response_type: "token",
      redirect_uri: redirectUri(),
      scope: opts.scopes.join(" "),
      include_granted_scopes: "true"
    });
    if (opts.prompt) p.set("prompt", opts.prompt);
    if (opts.loginHint) p.set("login_hint", opts.loginHint);
    return "https://accounts.google.com/o/oauth2/v2/auth?" + p.toString();
  }

  function launch(url, interactive) {
    return new Promise((resolve, reject) => {
      const details = { url, interactive };
      // Let Google's silent redirect chain finish instead of aborting on first load.
      if (!interactive) { details.abortOnLoadForNonInteractive = false; details.timeoutMsForNonInteractive = 12000; }
      try {
        chrome.identity.launchWebAuthFlow(details, (redirect) => {
          const le = chrome.runtime.lastError;
          if (le || !redirect) return reject(err(interactive ? "gmail_auth_canceled" : "gmail_auth", le && le.message));
          resolve(redirect);
        });
      } catch (e) { reject(err("gmail_auth", e.message)); }
    });
  }

  function parseRedirect(redirect) {
    const hash = redirect.split("#")[1] || redirect.split("?")[1] || "";
    const p = new URLSearchParams(hash);
    if (p.get("error")) throw err("gmail_auth", p.get("error"));
    const token = p.get("access_token");
    if (!token) throw err("gmail_auth", "no access token");
    const granted = (p.get("scope") || "").split(/\s+/);
    return {
      token,
      expiresAt: Date.now() + (Number(p.get("expires_in")) || 3600) * 1000,
      send: granted.includes(SCOPE_SEND),
      read: granted.includes(SCOPE_READ)
    };
  }

  // Interactive connect from the dashboard (Connect Gmail / Allow reading).
  // opts.read → also ask for gmail.readonly (auto-reply drafts).
  async function connect(opts) {
    opts = opts || {};
    if (!configured()) throw err("gmail_not_configured");
    const prev = await getAccount();
    const scopes = [SCOPE_EMAIL, SCOPE_SEND];
    if (opts.read || (prev && prev.read)) scopes.push(SCOPE_READ);
    const redirect = await launch(authUrl({
      scopes,
      prompt: prev ? "consent" : "select_account consent",
      loginHint: prev && prev.email
    }), true);
    const tok = parseRedirect(redirect);
    if (!tok.send) throw err("gmail_scope_denied");
    const info = await fetchJson("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + tok.token } });
    const email = String((info && info.email) || "").toLowerCase();
    if (!email) throw err("gmail_auth", "no email");
    await setToken0(tok);
    const acct = { email, send: tok.send, read: tok.read, connectedAt: (prev && prev.email === email && prev.connectedAt) || Date.now() };
    await setLocal(ACCOUNT_KEY, acct);
    return acct;
  }

  async function disconnect() {
    const t = await getToken0();
    if (t && t.token) {
      try { await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(t.token), { method: "POST" }); } catch (e) {}
    }
    await setToken0(null);
    await new Promise((res) => { try { chrome.storage.local.remove(ACCOUNT_KEY, () => res()); } catch (e) { res(); } });
  }

  // A valid token with the needed scope, refreshed silently when expired.
  // need: "send" | "read". Throws gmail_disconnected / gmail_scope / gmail_auth.
  async function token(need) {
    const acct = await getAccount();
    if (!acct) throw err("gmail_disconnected");
    if (need === "read" && !acct.read) throw err("gmail_scope");
    const cur = await getToken0();
    if (cur && cur.token && cur.expiresAt - 60000 > Date.now() && cur[need]) return cur.token;
    if (!configured()) throw err("gmail_not_configured");
    const scopes = [SCOPE_EMAIL, SCOPE_SEND];
    if (acct.read) scopes.push(SCOPE_READ);
    const tok = parseRedirect(await launch(authUrl({ scopes, prompt: "none", loginHint: acct.email }), false));
    if (!tok[need]) throw err("gmail_scope");
    await setToken0(tok);
    return tok.token;
  }

  // ---- HTTP -----------------------------------------------------------------
  async function fetchJson(url, init) {
    let res;
    try { res = await fetch(url, init); }
    catch (e) { throw err("network", e.message); }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) {}
    if (!res.ok) {
      const msg = (data && data.error && (data.error.message || data.error)) || ("HTTP " + res.status);
      const code = res.status === 401 ? "gmail_auth" : res.status === 403 ? "gmail_forbidden"
        : res.status === 429 ? "gmail_rate" : res.status >= 500 ? "gmail_server" : "gmail_error";
      const e = err(code, String(msg)); e.status = res.status; throw e;
    }
    return data;
  }

  async function api(path, init, need) {
    init = init || {};
    for (let attempt = 0; attempt < 2; attempt++) {
      const t = await token(need || "send");
      const headers = Object.assign({ Authorization: "Bearer " + t }, init.headers || {});
      try { return await fetchJson(API + path, Object.assign({}, init, { headers })); }
      catch (e) {
        if (e.code === "gmail_auth" && attempt === 0) { await setToken0(null); continue; }   // stale token → refresh once
        throw e;
      }
    }
  }

  // ---- MIME ------------------------------------------------------------------
  function b64(str) {                       // UTF-8 safe base64
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64url(str) { return b64(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function fromB64url(data) {
    try {
      const bin = atob(String(data).replace(/-/g, "+").replace(/_/g, "/"));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder("utf-8").decode(bytes);
    } catch (e) { return ""; }
  }
  function wrap76(s) { return s.replace(/.{1,76}/g, "$&\r\n").trim(); }
  function encodeHeader(s) {
    s = String(s || "").replace(/[\r\n]+/g, " ");
    return /^[\x20-\x7e]*$/.test(s) ? s : "=?UTF-8?B?" + b64(s) + "?=";
  }
  function cleanAddrList(list) {
    return (Array.isArray(list) ? list : String(list || "").split(/[,;]/))
      .map((a) => a.replace(/[\r\n]+/g, "").trim()).filter(Boolean).join(", ");
  }

  // Plain-text alternative (no DOMParser in a service worker).
  function htmlToText(html) {
    return decodeEntities(String(html || "")
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, txt) => (txt.replace(/<[^>]+>/g, "") === href ? href : txt + " (" + href + ")"))
      .replace(/<[^>]+>/g, ""))
      .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function decodeEntities(s) {
    return s.replace(/&(nbsp|amp|lt|gt|quot|#39|#(\d+)|#x([0-9a-f]+));/gi, (m, name, dec, hex) => {
      if (dec) return String.fromCodePoint(+dec);
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" }[name.toLowerCase()] || m;
    });
  }

  function buildRaw(m) {
    const boundary = "cr_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const html = String(m.html || "");
    const text = m.text != null ? String(m.text) : htmlToText(html);
    const head = ["To: " + cleanAddrList(m.to)];
    if (cleanAddrList(m.cc)) head.push("Cc: " + cleanAddrList(m.cc));
    if (cleanAddrList(m.bcc)) head.push("Bcc: " + cleanAddrList(m.bcc));
    head.push("Subject: " + encodeHeader(m.subject));
    if (m.inReplyTo) head.push("In-Reply-To: " + m.inReplyTo.replace(/[\r\n]+/g, ""));
    if (m.references) head.push("References: " + m.references.replace(/[\r\n]+/g, " "));
    head.push("MIME-Version: 1.0", 'Content-Type: multipart/alternative; boundary="' + boundary + '"');
    const body = [
      "--" + boundary, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(b64(text)),
      "--" + boundary, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
      wrap76(b64('<div dir="auto">' + html + "</div>")),
      "--" + boundary + "--", ""
    ];
    return b64url(head.join("\r\n") + "\r\n\r\n" + body.join("\r\n"));
  }

  // Send an email from the connected account. m: { to, cc, bcc, subject, html,
  // threadId?, inReplyTo?, references? }. Resolves the Gmail message { id, threadId }.
  function send(m) {
    const payload = { raw: buildRaw(m) };
    if (m.threadId) payload.threadId = m.threadId;
    return api("/messages/send", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    }, "send");
  }

  // ---- Reading (auto-reply drafts; needs gmail.readonly) -----------------------
  async function listMessages(q, max) {
    const data = await api("/messages?" + new URLSearchParams({ q, maxResults: String(max || 20) }), {}, "read");
    return (data && data.messages) || [];
  }
  function getMessage(id) { return api("/messages/" + encodeURIComponent(id) + "?format=full", {}, "read"); }

  // Has the user (a SENT message) replied in this thread after `sinceMs`?
  async function repliedSince(threadId, sinceMs) {
    const t = await api("/threads/" + encodeURIComponent(threadId) + "?format=minimal", {}, "read");
    return ((t && t.messages) || []).some((m) =>
      (m.labelIds || []).includes("SENT") && Number(m.internalDate) > sinceMs);
  }

  function parseAddress(v) {
    v = String(v || "").trim();
    const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
    return { name: "", email: v.replace(/[<>]/g, "").trim().toLowerCase() };
  }

  function bodyText(payload) {
    let plain = "", html = "";
    (function walk(p) {
      if (!p) return;
      const type = (p.mimeType || "").toLowerCase();
      const isAttachment = p.filename && p.filename.length;
      if (!isAttachment && p.body && p.body.data) {
        if (type === "text/plain" && !plain) plain = fromB64url(p.body.data);
        else if (type === "text/html" && !html) html = fromB64url(p.body.data);
      }
      (p.parts || []).forEach(walk);
    })(payload);
    return plain || htmlToText(html);
  }

  // Drop the quoted history ("On … wrote:" and "> " lines) — the AI only needs the new message.
  function stripQuoted(text) {
    const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const outlookHeader = /^\s*From:\s.+$/i.test(l) && i > 0 && /^\s*$/.test(lines[i - 1]);
      if (/^\s*On .{4,200}wrote:\s*$/i.test(l) || /^-{2,}\s*Original Message\s*-{2,}/i.test(l) || outlookHeader) break;
      if (/^\s*>/.test(l)) continue;
      out.push(l);
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function parseMessage(m) {
    const headers = {};
    for (const h of ((m.payload && m.payload.headers) || [])) headers[h.name.toLowerCase()] = h.value;
    const from = parseAddress(headers.from);
    const replyTo = headers["reply-to"] ? parseAddress(headers["reply-to"]) : null;
    return {
      id: m.id, threadId: m.threadId, labelIds: m.labelIds || [],
      internalDate: Number(m.internalDate) || Date.now(),
      headers,
      fromName: from.name, fromEmail: from.email,
      replyToEmail: replyTo && replyTo.email,
      subject: headers.subject || "",
      messageId: headers["message-id"] || "",
      references: headers.references || "",
      snippet: decodeEntities(m.snippet || ""),
      text: stripQuoted(bodyText(m.payload)).slice(0, 6000)
    };
  }

  NS.gmail = {
    SCOPE_SEND, SCOPE_READ, ORIGINS,
    configured, redirectUri, getAccount, connect, disconnect, token,
    send, listMessages, getMessage, repliedSince, parseMessage,
    htmlToText, buildRaw
  };
})(globalThis);

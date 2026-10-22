/* Canned Responses — website/api/ai.js  (Vercel serverless function: POST /api/ai)
 *
 * The "Built-in AI" relay: lets extension users write with AI without getting
 * their own API key. YOUR provider key lives here as a server secret and is never
 * shipped in the extension (anything in the extension can be extracted by anyone).
 *
 * What it does: accepts { installId, task, system, user } from the extension,
 * enforces daily limits, forwards the prompt to the AI provider and returns { text }.
 * Request bodies are NEVER logged or stored — only error codes are logged.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SETUP — Vercel → Project → Settings → Environment Variables, then redeploy:
 *   AI_API_KEY            (required) your provider API key.
 *   AI_PROVIDER           "gemini" (default) or "openai" — "openai" means any
 *                         OpenAI-compatible API (OpenAI, xAI Grok, OpenRouter, Groq…).
 *   AI_MODEL              Model id. Default for gemini: gemini-flash-latest.
 *                         Required for "openai" (e.g. a Grok or GPT mini model).
 *   AI_BASE_URL           For "openai": e.g. https://api.x.ai/v1 or https://api.openai.com/v1
 *   EXTENSION_IDS         Comma-separated extension IDs allowed to call this (your Web
 *                         Store ID + your unpacked dev ID). Strongly recommended.
 *   AI_DAILY_LIMIT        Requests per user per day (default 30). Keep equal to
 *                         BUILTIN_DAILY_LIMIT in core/ai-config.js (shown in the UI).
 *   AI_IP_DAILY_LIMIT     Requests per network per day (default 150).
 *   AI_GLOBAL_DAILY_LIMIT Requests per day for ALL users together (default 3000) —
 *                         your hard cost ceiling.
 *   KV_REST_API_URL + KV_REST_API_TOKEN (Vercel KV / Upstash Redis, or the
 *                         UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN pair):
 *                         makes the limits exact across all server instances.
 *                         Without it, limits are counted per instance (best effort).
 * ALSO set a monthly budget / spend cap in your AI provider's console — it is the
 * final safety net if someone abuses the endpoint.
 * ─────────────────────────────────────────────────────────────────────────
 */
"use strict";

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const LIMIT_USER = () => num(process.env.AI_DAILY_LIMIT, 30);
const LIMIT_IP = () => num(process.env.AI_IP_DAILY_LIMIT, 150);
const LIMIT_ALL = () => num(process.env.AI_GLOBAL_DAILY_LIMIT, 3000);
const MAX_SYSTEM = 6000;     // chars — the extension's system prompts are ~1.5k
const MAX_USER = 24000;      // chars — instruction + capped email conversation
const TASKS = ["reply", "compose", "template", "autoreply", "test"];
const TIMEOUT_MS = 25000;

const memory = new Map();    // fallback counters (per server instance) when no KV is configured

// ---- CORS: only Chrome extensions (optionally only OUR extension IDs) ------------
function allowOrigin(req, res) {
  const origin = String(req.headers.origin || "");
  const m = origin.match(/^chrome-extension:\/\/([a-p]{32})$/);
  const ids = String(process.env.EXTENSION_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = !!m && (!ids.length || ids.includes(m[1]));
  if (ok) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  return ok;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

// ---- Daily counters --------------------------------------------------------------
async function hit(key) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      const r = await fetch(url.replace(/\/+$/, "") + "/pipeline", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify([["INCR", key], ["EXPIRE", key, "172800"]])
      });
      if (r.ok) {
        const out = await r.json();
        const n = Number(out && out[0] && out[0].result);
        if (Number.isFinite(n)) return n;
      }
    } catch (e) { /* fall through to the in-memory counter */ }
  }
  if (memory.size > 20000) memory.clear();
  const n = (memory.get(key) || 0) + 1;
  memory.set(key, n);
  return n;
}
function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || String(req.headers["x-real-ip"] || "") || "unknown";
}

// ---- Provider calls ---------------------------------------------------------------------
async function callProvider(system, user) {
  const key = process.env.AI_API_KEY;
  if (!key) { const e = new Error("no key"); e.code = "config"; throw e; }
  const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    if (provider === "openai") {
      const base = String(process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
      const model = process.env.AI_MODEL;
      if (!model) { const e = new Error("no model"); e.code = "config"; throw e; }
      const r = await fetch(base + "/chat/completions", {
        method: "POST", signal: ctl.signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] })
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw upstream(r.status);
      let text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (Array.isArray(text)) text = text.map((x) => (typeof x === "string" ? x : x.text || "")).join("");
      return { text: String(text || ""), model };
    }
    const model = process.env.AI_MODEL || "gemini-flash-latest";
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }]
      })
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw upstream(r.status);
    if (data && data.promptFeedback && data.promptFeedback.blockReason) { const e = new Error("blocked"); e.code = "blocked"; throw e; }
    const cand = data && data.candidates && data.candidates[0];
    const text = ((cand && cand.content && cand.content.parts) || []).filter((x) => !x.thought).map((x) => x.text || "").join("");
    return { text, model };
  } catch (e) {
    if (e && e.name === "AbortError") { const t = new Error("timeout"); t.code = "timeout"; throw t; }
    throw e;
  } finally { clearTimeout(timer); }
}
function upstream(status) {
  const e = new Error("upstream " + status);
  e.code = status === 429 ? "busy" : (status === 401 || status === 403) ? "config" : "upstream";
  return e;
}

// ---- Handler -------------------------------------------------------------------------------
module.exports = async function handler(req, res) {
  const allowed = allowOrigin(req, res);
  if (req.method === "OPTIONS") { res.statusCode = allowed ? 204 : 403; return res.end(); }
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (!allowed) return send(res, 403, { error: "origin" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  body = body && typeof body === "object" ? body : {};
  const installId = String(body.installId || "");
  const system = typeof body.system === "string" ? body.system : "";
  const user = typeof body.user === "string" ? body.user : "";
  const task = TASKS.includes(body.task) ? body.task : "";
  if (!/^[A-Za-z0-9-]{16,64}$/.test(installId) || !task || !system.trim() || !user.trim()
      || system.length > MAX_SYSTEM || user.length > MAX_USER) {
    return send(res, 400, { error: "bad_request" });
  }

  // Daily limits: per install, per network, and a global ceiling (UTC day).
  const day = new Date().toISOString().slice(0, 10);
  const [nUser, nIp, nAll] = await Promise.all([
    hit("ai:u:" + day + ":" + installId),
    hit("ai:ip:" + day + ":" + clientIp(req)),
    hit("ai:all:" + day)
  ]);
  if (nUser > LIMIT_USER() || nIp > LIMIT_IP()) return send(res, 429, { error: "limit", remaining: 0 });
  if (nAll > LIMIT_ALL()) return send(res, 503, { error: "busy" });

  try {
    const out = await callProvider(system, user);
    if (!out.text.trim()) return send(res, 502, { error: "empty" });
    return send(res, 200, { text: out.text, model: out.model, remaining: Math.max(0, LIMIT_USER() - nUser) });
  } catch (e) {
    const code = (e && e.code) || "upstream";
    console.error("[ai-relay]", code);   // never the request content
    if (code === "config") return send(res, 503, { error: "unavailable" });
    if (code === "busy" || code === "timeout") return send(res, 503, { error: "busy" });
    if (code === "blocked") return send(res, 422, { error: "blocked" });
    return send(res, 502, { error: "upstream" });
  }
};

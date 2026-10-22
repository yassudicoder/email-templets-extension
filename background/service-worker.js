/* Canned Responses — background/service-worker.js
 * Stateless event router (MV3 SW can be killed any time — never hold state).
 *   - Seeds onboarding samples on first install.
 *   - Runs schema migrations on update (via store.init()).
 *   - Relays the Ctrl/Cmd+J command to the focused tab's content script.
 *   - Hosts scheduled send + auto-reply drafts (core/automation.js) and the
 *     bring-your-own-key AI calls (core/ai.js) — all state lives in storage,
 *     alarms wake it on time.
 * Shares the core modules with content scripts through the globalThis.CR
 * namespace (loaded here via importScripts). */
importScripts("/core/model.js", "/core/sync.js", "/core/store.js", "/core/entitlements.js", "/core/analytics.js",
  "/core/feedback-config.js", "/core/google-config.js", "/core/ai-config.js", "/core/ai.js", "/core/gmail-api.js", "/core/automation.js");

const { store, model, analytics, feedbackConfig, entitlements, ai, automation } = globalThis.CR;

function codeErr(code) { const e = new Error(code); e.code = code; return e; }
// Reply shape for every async message: { ok, data } | { ok:false, error, detail }.
function respond(promise, sendResponse) {
  promise.then((data) => sendResponse({ ok: true, data: data == null ? null : data }),
    (e) => sendResponse({ ok: false, error: (e && e.code) || "error", detail: String((e && e.message) || "").slice(0, 300) }));
  return true;   // keep the channel open for the async reply
}
// Only our own extension pages (dashboard/options) may drive Gmail sending.
function fromExtensionPage(sender) {
  return !!sender && sender.id === chrome.runtime.id && String(sender.url || "").startsWith(chrome.runtime.getURL(""));
}
async function gate(feature) {
  await store.init();
  if (entitlements && !entitlements.can(feature)) throw codeErr("plan");
}
async function aiConfig() {
  const cfg = await ai.load();
  if (!ai.isConfigured(cfg)) throw codeErr("ai_not_configured");
  return cfg;
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await store.init(); // creates the DB and/or migrates to the current schema

  // One-question uninstall survey — Chrome opens this when the user removes the
  // extension. URL is a TODO placeholder in core/feedback-config.js. setUninstallURL
  // persists across SW restarts, so setting it on install/update is enough.
  if (feedbackConfig && feedbackConfig.UNINSTALL_SURVEY_URL) {
    chrome.runtime.setUninstallURL(feedbackConfig.UNINSTALL_SURVEY_URL, () => void chrome.runtime.lastError);
  }

  automation.boot();   // re-arm alarms after install/update

  if (details.reason === "install") {
    if (store.getAll().length === 0) await store.bulkInsert(model.sampleTemplates(Date.now()));
    chrome.tabs.create({ url: chrome.runtime.getURL("ui/welcome/welcome.html") });
  }
  // "Save selection as Canned Response" context menu (only on our host pages).
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "cr-save-selection",
      title: chrome.i18n.getMessage("ctx_save_selection"),
      contexts: ["selection"],
      documentUrlPatterns: ["https://mail.google.com/*", "https://www.linkedin.com/*"]
    }, () => void chrome.runtime.lastError);
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "cr-save-selection" || !tab || tab.id == null) return;
  chrome.tabs.sendMessage(tab.id, { type: "SAVE_SELECTION", text: info.selectionText || "" },
    () => void chrome.runtime.lastError);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === "OPEN_OPTIONS") chrome.runtime.openOptionsPage();
  // "Set up AI" etc. from the in-page picker: open the options page on that
  // Automation & AI section (options.js reads settings.openView).
  if (msg.type === "OPEN_DASHBOARD") {
    const tab = ["schedule", "autoreply", "ai", "settings"].includes(msg.tab) ? msg.tab : "schedule";
    store.init().then(() => store.updateSettings({ openView: tab })).then(() => chrome.runtime.openOptionsPage());
  }
  // Analytics events from content scripts / options — consent is checked in deliver().
  if (msg.type === "CR_ANALYTICS") analytics.deliver(msg.event, msg.props);

  // AI writing (picker "Write with AI", dashboard). The key never leaves this SW/the
  // provider request; callers only get the generated text back.
  if (msg.type === "AI_STATUS") {
    return respond(ai.load().then((cfg) => ({ configured: ai.isConfigured(cfg), provider: ai.activeProvider(cfg) })), sendResponse);
  }
  if (msg.type === "AI_GENERATE") {
    return respond((async () => {
      await gate("ai_writer");
      const cfg = await aiConfig();
      const task = ["reply", "compose", "template"].includes(msg.task) ? msg.task : "compose";
      const out = await ai.generate(cfg, {
        task, instruction: String(msg.instruction || "").slice(0, 4000), tone: msg.tone,
        context: msg.context || null, recipient: msg.recipient || ""
      });
      analytics.deliver("ai_generated", { task, provider: ai.activeProvider(cfg) });   // content-free
      return out;
    })(), sendResponse);
  }
  if (msg.type === "AI_TEST" && fromExtensionPage(sender)) return respond(aiConfig().then((cfg) => ai.test(cfg)), sendResponse);
  if (msg.type === "AI_MODELS" && fromExtensionPage(sender)) return respond(aiConfig().then((cfg) => ai.listModels(cfg)), sendResponse);

  // Scheduled send + auto-reply drafts — the SW is the single writer of that state.
  if (msg.type === "CR_AUTO" && fromExtensionPage(sender)) {
    return respond((async () => {
      await gate(String(msg.op || "").startsWith("schedule.") ? "scheduled_send" : "auto_reply");
      return automation.handle(msg.op, msg.data);
    })(), sendResponse);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => { automation.onAlarm(alarm); });
// Browser start: alarms may have been dropped, and anything due while Chrome was
// closed is caught up (or held as "missed", per the user's grace setting).
chrome.runtime.onStartup.addListener(() => { automation.boot(); });

chrome.commands.onCommand.addListener((command) => {
  if (command !== "open-picker") return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null) return;
    // No frameId -> delivered to every frame; the focused frame acts.
    chrome.tabs.sendMessage(tab.id, { type: "OPEN_PICKER" }, () => void chrome.runtime.lastError);
  });
});

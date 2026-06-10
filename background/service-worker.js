/* Canned Responses — background/service-worker.js
 * Stateless event router (MV3 SW can be killed any time — never hold state).
 *   - Seeds onboarding samples on first install.
 *   - Runs schema migrations on update (via store.init()).
 *   - Relays the Ctrl/Cmd+J command to the focused tab's content script.
 * Shares the core modules with content scripts through the globalThis.CR
 * namespace (loaded here via importScripts). */
importScripts("/core/model.js", "/core/store.js");

const { store, model } = globalThis.CR;

chrome.runtime.onInstalled.addListener(async (details) => {
  await store.init(); // creates the DB and/or migrates to the current schema
  if (details.reason === "install") {
    if (store.getAll().length === 0) await store.bulkInsert(model.sampleTemplates(Date.now()));
    chrome.tabs.create({ url: chrome.runtime.getURL("ui/welcome/welcome.html") });
  }
  // "Save selection as Canned Response" context menu (only on our host pages).
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "cr-save-selection",
      title: "Save selection as Canned Response",
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

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "OPEN_OPTIONS") chrome.runtime.openOptionsPage();
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "open-picker") return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null) return;
    // No frameId -> delivered to every frame; the focused frame acts.
    chrome.tabs.sendMessage(tab.id, { type: "OPEN_PICKER" }, () => void chrome.runtime.lastError);
  });
});

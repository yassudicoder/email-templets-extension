// THROWAWAY SPIKE — service worker.
// Only job: relay the chrome.commands hotkey to the active tab's content script.
// Stateless on purpose (MV3 SW can be killed at any time).
//
// NOTE: the content script ALSO listens for Ctrl/Cmd+J directly (keydown), because:
//   (a) Ctrl+J is Chrome's "open downloads" shortcut and chrome.commands cannot always
//       win that binding on every platform, and
//   (b) a synchronous keydown handler captures the caret/selection more reliably than an
//       async round-trip through the SW.
// Both routes call the same openPicker() and are guarded against double-firing.

chrome.commands.onCommand.addListener((command) => {
  if (command !== "open-picker") return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null) return;
    // No frameId -> delivered to every frame in the tab. The focused frame handles it.
    chrome.tabs.sendMessage(tab.id, { type: "OPEN_PICKER" }, () => void chrome.runtime.lastError);
  });
});

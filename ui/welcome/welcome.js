/* Canned Responses — ui/welcome/welcome.js
 * First-run welcome: shows the hotkey, the starter templates, and the manager. */
(function () {
  "use strict";
  const { store, sanitize } = globalThis.CR;
  const $ = (s) => document.querySelector(s);

  store.init().then(() => {
    CR.i18n.setLocale((store.getSettings() && store.getSettings().locale) || "auto");
    CR.i18n.localize(document);
    // The welcome page stays LIGHT (clean, professional first impression). The
    // toggle below only sets the preference for the rest of the extension UI.
    const hotkey = (store.getSettings() && store.getSettings().hotkey) || "Alt+A";
    const box = $("#hkbox");
    if (box) box.textContent = hotkey.replace(/\+/g, " + ");
    document.querySelectorAll(".hkfill").forEach((el) => { el.textContent = hotkey; });

    const list = $("#list");
    const items = store.getAll().slice(0, 5);
    if (!items.length) {
      list.innerHTML = '<li class="lt"></li>';
      list.querySelector(".lt").textContent = CR.i18n.t("welcome_empty_state");
      return;
    }
    items.forEach((t) => {
      const li = document.createElement("li");
      li.innerHTML = '<span class="lt"></span><span class="ls"></span>';
      li.querySelector(".lt").textContent = t.title || CR.i18n.t("template_untitled");
      const snip = sanitize.toPlainText(t.body).replace(/\s+/g, " ").trim();
      li.querySelector(".ls").textContent = snip.length > 84 ? snip.slice(0, 84).trim() + "…" : snip;
      list.appendChild(li);
    });

    // Theme preference (applies to the picker, popup & manager — not this page).
    const seg = $("#themeSeg");
    if (seg) {
      const cur = store.getSettings().theme || "system";
      seg.querySelectorAll("button").forEach((b) => {
        b.classList.toggle("active", b.dataset.themeVal === cur);
        b.addEventListener("click", async () => {
          await store.updateSettings({ theme: b.dataset.themeVal });
          seg.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
        });
      });
    }
  }).catch((e) => console.error("[CR] welcome init failed", e));

  $("#manage").addEventListener("click", () => chrome.runtime.openOptionsPage());
})();

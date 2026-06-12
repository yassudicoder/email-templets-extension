/* Canned Responses — content/capture.js
 * "Save selection as template" capture. A small floating pill appears on text
 * selection (discoverable, unlike the right-click menu). Captures RICH HTML
 * (formatting kept), strips images cleanly via the sanitizer, and surfaces a
 * one-line note when images were present — never a silent drop or broken image.
 * Shared by the right-click context menu (content.js relays SAVE_SELECTION here). */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});
  if (NS.__capture) return;
  NS.__capture = true;

  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
    + ' stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';

  // ---- Rich capture -----------------------------------------------------
  function captureSelectionRich(allowImg) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const text = sel.toString().trim();
    if (!text) return null;
    const box = document.createElement("div");
    for (let i = 0; i < sel.rangeCount; i++) box.appendChild(sel.getRangeAt(i).cloneContents());
    const raw = box.innerHTML;
    const hadMedia = NS.sanitize && NS.sanitize.detectMedia(raw);   // images/tables present?
    const html = NS.sanitize ? NS.sanitize.sanitize(raw, { images: allowImg }) : text;
    return { html, text, hadMedia };
  }

  async function save() {
    const allowImg = !!(NS.entitlements && NS.entitlements.can("images"));   // Pro keeps images
    const cap = captureSelectionRich(allowImg);
    if (!cap) return;                         // this frame has no selection
    await NS.store.init();
    const title = cap.text.replace(/\s+/g, " ").split(" ").slice(0, 6).join(" ").slice(0, 60) || "Saved snippet";
    const rec = await NS.store.create({ title, body: cap.html });
    hidePill();
    if (!rec) {
      const lim = (NS.store.templateLimit && NS.store.templateLimit()) || 150;
      toast(CR.i18n.t("toast_template_limit_reached", [lim]), true);
      return;
    }
    let msg = CR.i18n.t("toast_saved_as_template");
    if (!allowImg && cap.hadMedia) msg += " — " + CR.i18n.t("toast_images_pro_feature");   // graceful upsell
    toast(msg, false, rec.id);
  }

  // ---- Toast (with optional Edit link) ----------------------------------
  let toastEl, toastTimer;
  function toast(msg, isErr, editId) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.style.cssText = "all:initial;position:fixed;left:50%;bottom:26px;transform:translateX(-50%);"
        + "z-index:2147483647;font:13px system-ui,-apple-system,sans-serif;color:#fff;padding:10px 14px;"
        + "border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.3);display:flex;align-items:center;gap:12px;";
      document.documentElement.appendChild(toastEl);
    }
    toastEl.style.background = isErr ? "#dc2626" : "#16a34a";
    toastEl.textContent = "";
    const span = document.createElement("span");
    span.textContent = msg;
    toastEl.appendChild(span);
    if (editId) {
      const a = document.createElement("a");
      a.textContent = CR.i18n.t("button_edit");
      a.style.cssText = "color:#fff;text-decoration:underline;cursor:pointer;font-weight:600;";
      a.addEventListener("click", async () => {
        try { await NS.store.updateSettings({ focusTemplateId: editId }); } catch (e) {}
        if (NS.app) NS.app.openManager();     // full editor (rich)
        hideToast();
      });
      toastEl.appendChild(a);
    }
    toastEl.style.display = "flex";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, editId ? 5000 : 2500);
  }
  function hideToast() { if (toastEl) toastEl.style.display = "none"; }

  // ---- Floating selection pill ------------------------------------------
  let host, shadow;
  function ensureUI() {
    if (host) return;
    host = document.createElement("div");
    host.style.cssText = "all:initial;position:absolute;z-index:2147483646;display:none;";
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = "<style>"
      + ".pill{display:inline-flex;align-items:center;gap:6px;background:#1f2937;color:#fff;"
      + "font:12px/1 system-ui,-apple-system,sans-serif;padding:8px 11px;border-radius:8px;cursor:pointer;"
      + "box-shadow:0 4px 14px rgba(0,0,0,.35);} .pill:hover{background:#111827;} .pill svg{width:14px;height:14px;}"
      + "</style><button class=\"pill\" id=\"b\">" + ICON + " " + CR.i18n.t("capture_pill_label") + "</button>";
    document.documentElement.appendChild(host);
    const b = shadow.getElementById("b");
    b.addEventListener("mousedown", (e) => e.preventDefault()); // keep the selection alive
    b.addEventListener("click", (e) => { e.preventDefault(); save(); });
  }
  function showAt(rect) {
    ensureUI();
    host.style.display = "block";
    const w = 150;
    let left = g.scrollX + rect.left + rect.width / 2 - w / 2;
    left = Math.max(6, Math.min(left, g.scrollX + g.innerWidth - w - 6));
    const top = g.scrollY + rect.top - 42;
    host.style.left = left + "px";
    host.style.top = Math.max(g.scrollY + 4, top) + "px";
  }
  function hidePill() { if (host) host.style.display = "none"; }

  function onMouseUp() {
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel && sel.toString().trim();
      // Inputs/textareas don't expose a window selection, so the pill naturally
      // only appears for real page/contenteditable text (email bodies, compose).
      if (!text || text.length < 2 || !sel.rangeCount) { hidePill(); return; }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) { hidePill(); return; }
      showAt(rect);
    }, 10);
  }

  document.addEventListener("mouseup", onMouseUp, true);
  document.addEventListener("mousedown", (e) => {
    if (host && e.composedPath && e.composedPath().includes(host)) return; // clicking the pill
    hidePill();
  }, true);
  document.addEventListener("scroll", hidePill, true);

  NS.capture = { save };
})(globalThis);

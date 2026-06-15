/* Canned Responses — ui/options/feedback.js
 * In-page feedback panel for the options page. User-initiated only: NOTHING is
 * sent until the user clicks "Send". Posts a JSON body to Web3Forms (no backend)
 * straight from the extension-origin options page — Web3Forms returns CORS
 * headers, so this needs no host_permissions and no CSP change.
 *
 * Privacy: the only diagnostics attached are extension version, browser+OS, and
 * locale — and only when the (default-on, user-visible) "Include this info" box
 * is checked. No template/message content is ever read or sent. We persist just
 * one content-free flag (settings.feedbackSentAt) — never the feedback text. */
(function () {
  "use strict";
  const { store, i18n } = globalThis.CR;
  const cfg = globalThis.CR.feedbackConfig || {};
  const $ = (sel, root) => (root || document).querySelector(sel);

  // ---- Lightly parse navigator.userAgent into "Browser · OS" --------------
  function parseUA(ua) {
    ua = ua || "";
    let browser = "Browser";
    let m;
    if (/\bEdg\//.test(ua) && (m = /\bEdg\/(\d+)/.exec(ua))) browser = "Edge " + m[1];
    else if (/\bOPR\//.test(ua) && (m = /\bOPR\/(\d+)/.exec(ua))) browser = "Opera " + m[1];
    else if (/\bFirefox\//.test(ua) && (m = /\bFirefox\/(\d+)/.exec(ua))) browser = "Firefox " + m[1];
    else if (/\bChrome\//.test(ua) && (m = /\bChrome\/(\d+)/.exec(ua))) browser = "Chrome " + m[1];
    else if (/\bSafari\//.test(ua)) browser = "Safari";

    let os = "Unknown OS";
    if (/Windows NT 10/.test(ua)) os = "Windows";
    else if (/Windows/.test(ua)) os = "Windows";
    else if (/Mac OS X/.test(ua)) os = "macOS";
    else if (/CrOS/.test(ua)) os = "ChromeOS";
    else if (/Android/.test(ua)) os = "Android";
    else if (/Linux/.test(ua)) os = "Linux";
    return browser + " · " + os;
  }

  // Exactly what the diagnostics line shows AND what gets attached — kept in sync.
  function diagnosticsString() {
    let version = "?";
    let locale = "?";
    try { version = chrome.runtime.getManifest().version; } catch (e) {}
    try { locale = (chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || "?"; } catch (e) {}
    return "v" + version + " · " + parseUA(navigator.userAgent) + " · " + locale;
  }

  function mailtoFallbackLink() {
    const a = document.createElement("a");
    a.href = "mailto:" + cfg.CONTACT_EMAIL;
    a.textContent = cfg.CONTACT_EMAIL;
    a.className = "fb-mailto";
    return a;
  }

  let busy = false;

  function open() {
    const modal = $("#feedbackModal");
    if (!modal) return;
    // Reset to the form view each time it's opened.
    $("#fbForm").hidden = false;
    $("#fbSuccess").hidden = true;
    const err = $("#fbError");
    err.hidden = true; err.textContent = "";
    $("#fbDiagText").textContent = diagnosticsString();
    modal.hidden = false;
    const msg = $("#fbMessage");
    if (msg) msg.focus();
  }
  function close() {
    const modal = $("#feedbackModal");
    if (modal) modal.hidden = true;
  }

  function showError(messageEl) {
    const err = $("#fbError");
    err.textContent = "";
    // "Couldn't send — email me directly at <mailto>"
    err.appendChild(document.createTextNode(i18n.t("feedback_error_lead") + " "));
    err.appendChild(mailtoFallbackLink());
    err.hidden = false;
    if (messageEl) messageEl.scrollIntoView({ block: "nearest" });
  }

  function setBusy(on) {
    busy = on;
    const btn = $("#fbSubmit");
    if (!btn) return;
    btn.disabled = on;
    btn.textContent = on ? i18n.t("feedback_sending") : i18n.t("feedback_submit");
  }

  async function submit() {
    if (busy) return;
    const messageEl = $("#fbMessage");
    const message = (messageEl.value || "").trim();
    const errEl = $("#fbError");

    // Validate the one important field before sending anything.
    if (!message) {
      errEl.textContent = i18n.t("feedback_validation_empty");
      errEl.hidden = false;
      messageEl.focus();
      return;
    }
    errEl.hidden = true; errEl.textContent = "";

    // No access key configured yet → don't pretend; route to the mailto fallback.
    if (!cfg.WEB3FORMS_ACCESS_KEY) { showError(messageEl); return; }

    const type = $("#fbType").value || "general";
    const typeLabel = $("#fbType").selectedOptions[0] ? $("#fbType").selectedOptions[0].textContent : type;
    const email = ($("#fbEmail").value || "").trim();
    const includeDiag = $("#fbDiag").checked;
    const botcheck = $("#fbBotcheck").value;   // honeypot — humans leave this empty

    const payload = {
      access_key: cfg.WEB3FORMS_ACCESS_KEY,
      subject: "Canned Responses feedback — " + typeLabel,
      from_name: "Canned Responses user",
      type: typeLabel,
      message: message,
      botcheck: botcheck
    };
    if (email) payload.email = email;                         // reply-to address
    if (includeDiag) payload.diagnostics = diagnosticsString();

    setBusy(true);
    try {
      const res = await fetch(cfg.WEB3FORMS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.success) {
        // Success — DON'T clear the textarea until now (so a failed send keeps the text).
        $("#fbForm").hidden = true;
        $("#fbSuccess").hidden = false;
        messageEl.value = "";
        $("#fbEmail").value = "";
        try { store.updateSettings({ feedbackSentAt: Date.now() }); } catch (e) {}  // content-free flag only
      } else {
        showError(messageEl);
      }
    } catch (e) {
      showError(messageEl);
    } finally {
      setBusy(false);
    }
  }

  function wire() {
    const openBtn = $("#feedbackBtn");
    if (!openBtn) return;                 // feedback markup not present — nothing to do
    openBtn.addEventListener("click", open);
    $("#fbClose").addEventListener("click", close);
    $("#feedbackModal").addEventListener("click", (e) => { if (e.target.id === "feedbackModal") close(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("#feedbackModal").hidden) close();
    });
    // Handle the form's submit event (covers the button click AND Enter in a field)
    // so the action-less form never navigates/reloads the options page.
    $("#fbForm").addEventListener("submit", (e) => { e.preventDefault(); submit(); });
    $("#fbSendAnother").addEventListener("click", () => {
      $("#fbSuccess").hidden = true;
      $("#fbForm").hidden = false;
      $("#fbMessage").focus();
    });
    // Point the two static mailto links at the configured contact address.
    document.querySelectorAll(".fb-direct-mailto").forEach((a) => { a.href = "mailto:" + cfg.CONTACT_EMAIL; });
  }

  document.addEventListener("DOMContentLoaded", wire);
})();

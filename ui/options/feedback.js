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

  // ---- Open an email draft to the contact address. We use a Gmail compose URL
  //      (opens in-browser) rather than mailto:, which silently does nothing when
  //      the OS has no default mail app configured. -------------------------------
  function composeUrl(message, type) {
    const typeLabel = (type && TYPE_LABELS[type]) || "Feedback";
    let url = "https://mail.google.com/mail/?view=cm&fs=1&to=" +
      encodeURIComponent(cfg.CONTACT_EMAIL || "") +
      "&su=" + encodeURIComponent("Canned Responses feedback — " + typeLabel);
    if (message) url += "&body=" + encodeURIComponent(message);
    return url;
  }
  function openCompose(message, type) {
    window.open(composeUrl(message, type), "_blank", "noopener");
  }

  function emailFallbackLink() {
    const a = document.createElement("a");
    a.href = composeUrl("", "");
    a.target = "_blank"; a.rel = "noopener";
    a.textContent = cfg.CONTACT_EMAIL;
    a.className = "fb-mailto";
    return a;
  }

  // Canonical English labels for the email subject/type, so the developer's inbox
  // stays consistent regardless of the user's UI language (the form is localized).
  const TYPE_LABELS = {
    bug: "Bug report", feature: "Feature request",
    general: "General feedback", other: "Other"
  };

  let busy = false;

  function open() {
    const modal = $("#feedbackModal");
    if (!modal) return;
    // Reset to the form view each time it's opened.
    $("#fbForm").hidden = false;
    $("#fbSuccess").hidden = true;
    const err = $("#fbError");
    err.hidden = true; err.textContent = "";
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
    // "Couldn't send — email me directly at <link>"
    err.appendChild(document.createTextNode(i18n.t("feedback_error_lead") + " "));
    err.appendChild(emailFallbackLink());
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

    const type = $("#fbType").value || "general";

    // No backend access key configured → just open an email draft (Gmail compose)
    // with the message prefilled, so "Send feedback" works without a backend.
    if (!cfg.WEB3FORMS_ACCESS_KEY) { openCompose(message, type); close(); return; }

    const typeLabel = TYPE_LABELS[type] || "Feedback";
    const email = ($("#fbEmail").value || "").trim();
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
    // Point the "email directly" link at a Gmail compose window (opens in-browser;
    // mailto: silently fails when no OS mail app is set).
    document.querySelectorAll(".fb-direct-mailto").forEach((a) => {
      a.href = composeUrl("", "");
      a.target = "_blank"; a.rel = "noopener";
    });
  }

  document.addEventListener("DOMContentLoaded", wire);
})();

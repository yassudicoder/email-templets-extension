/* Canned Responses — content/surfaces/linkedin.js
 * Thin LinkedIn adapter: (1) surface policy (degrade rich -> plain), and (2) the
 * OPTIONAL nav button. Like the Gmail button, this is the one LinkedIn-DOM-
 * dependent piece — ISOLATED here and NON-LOAD-BEARING: if LinkedIn changes its
 * markup, Alt+A and insertion keep working; only this button is affected. */
(function (g) {
  "use strict";
  const NS = (g.CR = g.CR || {});
  NS.surfaces = NS.surfaces || {};
  NS.surfaces.linkedin = {
    name: "linkedin",
    matches: () => location.hostname.endsWith("linkedin.com"),
    // LinkedIn composers are largely plain-text — degrade gracefully.
    preferPlainText: () => true
  };

  if (g.top !== g || !location.hostname.endsWith("linkedin.com")) return;

  const BTN_ID = "cr-li-btn";
  const ICON =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
    ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  function makeButton() {
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.setAttribute("aria-label", CR.i18n.t("surface_btn_aria_label"));
    btn.title = CR.i18n.t("linkedin_btn_title");
    btn.innerHTML = ICON + '<span style="font-size:12px;line-height:1.2;">' + CR.i18n.t("picker_panel_title") + '</span>';
    btn.style.cssText = [
      "display:flex", "flex-direction:column", "align-items:center", "justify-content:center",
      "gap:1px", "height:100%", "min-width:60px", "padding:0 8px", "background:transparent",
      "border:0", "cursor:pointer", "color:inherit", "opacity:.66",
      "font-family:inherit", "user-select:none"
    ].join(";");
    btn.addEventListener("mouseenter", () => { btn.style.opacity = "1"; });
    btn.addEventListener("mouseleave", () => { btn.style.opacity = ".66"; });
    btn.addEventListener("mousedown", (e) => e.preventDefault()); // keep editable focus
    const open = (e) => { e.preventDefault(); const app = g.CR && g.CR.app; if (app) (app.openPanel || app.open)(); };
    btn.addEventListener("click", open);
    return btn;
  }

  // Anchor to the Notifications / Messaging nav item by href (stable, unlike
  // LinkedIn's obfuscated class names). Clone that item's classes + theme color
  // so our button blends in (and adapts to light/dark mode).
  function anchorItem() {
    const link = document.querySelector(
      'header nav a[href*="/notifications"], header nav a[href*="/messaging"],' +
      'a[href*="/notifications/"], a[href*="/messaging/"]'
    );
    return link ? link.closest("li") : null;
  }

  function tryInject() {
    if (document.getElementById(BTN_ID)) return;
    const ref = anchorItem();
    if (!ref || !ref.parentElement) return;
    const li = document.createElement("li");
    li.className = ref.className || "global-nav__primary-item";
    const btn = makeButton();
    const inner = ref.querySelector("a, button") || ref;
    try { btn.style.color = getComputedStyle(inner).color; } catch (e) { /* keep inherit */ }
    li.appendChild(btn);
    ref.parentElement.insertBefore(li, ref.nextSibling);
  }

  let scheduled = false;
  function ensure() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; try { tryInject(); } catch (e) { /* contained */ } }, 300);
  }
  function start() {
    ensure();
    new MutationObserver(ensure).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(ensure, 2000);   // safety net: re-inject if a LinkedIn re-render removed our button
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})(globalThis);

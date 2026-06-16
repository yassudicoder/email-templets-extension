/* Theme toggle — the initial data-theme is set by an inline <head> script
 * (before paint, no flash). This just injects the nav toggle + persists choice. */
(function () {
  "use strict";
  var root = document.documentElement;
  function cur() { return root.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
  // Keep the mobile browser chrome (address bar) in sync with the active theme.
  function paintChrome(t) {
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement("meta"); m.name = "theme-color"; document.head.appendChild(m); }
    m.content = t === "dark" ? "#0c0e14" : "#ffffff";
  }
  // dark.css is loaded conditionally (only when dark is active) to cut render-blocking
  // CSS for the light-mode majority. The inline <head> script injects it on first paint
  // when the initial theme is dark; this handles the runtime toggle (light → dark).
  function ensureDarkCss(on) {
    if (!on || document.getElementById("cr-darkcss")) return;
    var l = document.createElement("link");
    l.rel = "stylesheet"; l.href = "/dark.css"; l.id = "cr-darkcss";
    document.head.appendChild(l);
  }
  function set(t) {
    ensureDarkCss(t === "dark");
    root.setAttribute("data-theme", t); paintChrome(t);
    try { localStorage.setItem("cr-theme", t); } catch (e) {}
  }
  ensureDarkCss(cur() === "dark");
  paintChrome(cur());

  var SUN = '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg class="moon" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/></svg>';

  function build() {
    if (document.querySelector(".theme-toggle")) return;
    var btn = document.createElement("button");
    btn.className = "theme-toggle";
    btn.type = "button";
    btn.setAttribute("aria-label", "Toggle dark mode");
    btn.title = "Toggle light / dark";
    btn.innerHTML = SUN + MOON;
    btn.addEventListener("click", function () { set(cur() === "dark" ? "light" : "dark"); });
    var nav = document.querySelector(".navlinks") || document.querySelector(".nav");
    if (!nav) return;
    var cta = nav.querySelector("a.btn");
    if (cta) nav.insertBefore(btn, cta); else nav.appendChild(btn);
  }

  // On phones the secondary nav links are hidden (CSS). Surface them in a tap
  // menu so Blog/Features/FAQ stay reachable. Injected here so all pages share it.
  var HAMB = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  var XICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  function buildMenu() {
    var navlinks = document.querySelector(".navlinks");
    if (!navlinks || document.querySelector(".nav-menu-btn")) return;
    var nav = document.querySelector(".nav") || navlinks;
    var links = navlinks.querySelectorAll("a:not(.btn)");
    if (!links.length) return;

    var panel = document.createElement("div");
    panel.className = "nav-menu-panel";
    panel.id = "nav-menu-panel";

    var btn = document.createElement("button");
    btn.className = "nav-menu-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Menu");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "nav-menu-panel");
    btn.innerHTML = HAMB;

    function close() { nav.classList.remove("menu-open"); btn.setAttribute("aria-expanded", "false"); btn.innerHTML = HAMB; }
    function open() { nav.classList.add("menu-open"); btn.setAttribute("aria-expanded", "true"); btn.innerHTML = XICON; }

    Array.prototype.forEach.call(links, function (a) {
      var c = a.cloneNode(true);
      c.className = "";
      c.addEventListener("click", close);
      panel.appendChild(c);
    });

    // theme toggle, relocated into the menu on mobile (the bar copy is hidden by CSS)
    var t2 = document.createElement("button");
    t2.className = "theme-toggle nav-menu-toggle";
    t2.type = "button";
    t2.setAttribute("aria-label", "Toggle dark mode");
    t2.innerHTML = SUN + MOON;
    t2.addEventListener("click", function () { set(cur() === "dark" ? "light" : "dark"); });
    panel.appendChild(t2);

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      nav.classList.contains("menu-open") ? close() : open();
    });
    document.addEventListener("click", function (e) {
      if (nav.classList.contains("menu-open") && !panel.contains(e.target) && !btn.contains(e.target)) close();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    window.addEventListener("resize", function () { if (window.innerWidth > 900) close(); });

    var toggleBtn = navlinks.querySelector(".theme-toggle");
    if (toggleBtn) navlinks.insertBefore(btn, toggleBtn);
    else { var cta = navlinks.querySelector("a.btn"); cta ? navlinks.insertBefore(btn, cta) : navlinks.appendChild(btn); }
    nav.appendChild(panel);
  }

  function init() { build(); buildMenu(); }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);

  // follow the OS only while the user hasn't made an explicit choice
  try {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
      if (!localStorage.getItem("cr-theme")) set(e.matches ? "dark" : "light");
    });
  } catch (e) {}
})();

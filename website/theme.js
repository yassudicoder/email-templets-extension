/* Theme toggle — the initial data-theme is set by an inline <head> script
 * (before paint, no flash). This just injects the nav toggle + persists choice. */
(function () {
  "use strict";
  var root = document.documentElement;
  function cur() { return root.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
  function set(t) { root.setAttribute("data-theme", t); try { localStorage.setItem("cr-theme", t); } catch (e) {} }

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

  if (document.readyState !== "loading") build();
  else document.addEventListener("DOMContentLoaded", build);

  // follow the OS only while the user hasn't made an explicit choice
  try {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
      if (!localStorage.getItem("cr-theme")) set(e.matches ? "dark" : "light");
    });
  } catch (e) {}
})();

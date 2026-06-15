/* Canned Responses — marketing site (homepage only). Analytics live in analytics.js. */
(function () {
  "use strict";

  /* ---- A1: testimonials — data-driven; the section stays hidden until real
     quotes exist. To publish, add objects to TESTIMONIALS below; the section
     renders and unhides itself. No raw user count is shown, by design. ---- */
  var TESTIMONIALS = [
    // { quote: "Cut my reply time in half.", name: "Jordan P.", role: "Recruiter" },
  ];
  (function renderTestimonials() {
    var sec = document.getElementById("testimonials");
    var grid = document.getElementById("tmonialGrid");
    if (!sec || !grid) return;
    if (!TESTIMONIALS.length) { sec.hidden = true; return; }
    var esc = function (s) {
      return String(s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
    };
    grid.innerHTML = TESTIMONIALS.map(function (t) {
      var who = "<b>" + esc(t.name || "") + "</b>" + (t.role ? " · " + esc(t.role) : "");
      return '<figure class="tmonial">' +
        '<div class="tm-stars" aria-hidden="true">★★★★★</div>' +
        "<blockquote>" + esc(t.quote || "") + "</blockquote>" +
        "<figcaption>" + who + "</figcaption>" +
        "</figure>";
    }).join("");
    sec.hidden = false;
  })();

  /* ---- A2: drop the real-Gmail proof figure if its image isn't present yet,
     so no broken image ever shows (the slot reserves its size when present). ---- */
  (function gmailProof() {
    var img = document.querySelector(".gmail-proof img");
    if (!img) return;
    var fail = function () { var f = img.closest("figure"); if (f) f.remove(); };
    if (img.complete && img.naturalWidth === 0) fail();
    else img.addEventListener("error", fail);
  })();

  /* ---- A3: reveal the slim sticky CTA once the hero has scrolled out of view.
     Keyboard-accessible (real link; not focusable while hidden via CSS
     visibility). Motion is handled in CSS and disabled under reduced-motion. ---- */
  (function stickyCta() {
    var bar = document.getElementById("stickyCta");
    var hero = document.querySelector(".hero");
    if (!bar || !hero || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      bar.classList.toggle("show", !entries[0].isIntersecting);
    }, { threshold: 0 });
    io.observe(hero);
  })();
})();

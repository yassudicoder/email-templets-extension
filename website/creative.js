/* creative.js — "The Living Spec Sheet" ambient system. Additive, self-contained.
 * grain (all pages) · crop/registration frame (all pages) · graph grid (homepage)
 * · running-header ticker pause · drafting dimension-divider draw + count-up.
 * Honors prefers-reduced-motion. No-op where targets are absent. Vanilla, no deps. */
(function () {
  "use strict";
  var d = document, body = d.body;
  if (!body) return;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* the ruled grid goes on any page with an editorial header… */
  var headEl = d.querySelector(".hero, .blog-head, .article-head, .legal");
  /* …but softer behind long-form reading pages so body copy always wins */
  var faintGrid = !!d.querySelector(".article-body, .legal");

  /* ---- grain: faint risograph overlay above content (skip if blend unsupported) ---- */
  var blendOK = !window.CSS || !CSS.supports || CSS.supports("mix-blend-mode", "multiply");
  if (blendOK && !d.querySelector(".cr-grain")) {
    var g = d.createElement("div");
    g.className = "cr-grain"; g.setAttribute("aria-hidden", "true");
    body.appendChild(g);
  }

  /* ---- grid (homepage, behind content) + crop/registration frame (all pages) ---- */
  if (!d.querySelector(".cr-frame")) {
    if (headEl) {
      var grid = d.createElement("div");
      grid.className = "cr-grid" + (faintGrid ? " cr-faint" : "");
      grid.setAttribute("aria-hidden", "true");
      body.insertBefore(grid, body.firstChild);
    }
    var frame = d.createElement("div");
    frame.className = "cr-frame"; frame.setAttribute("aria-hidden", "true");
    frame.innerHTML =
      '<span class="cr-mk tl"></span><span class="cr-mk tr"></span>' +
      '<span class="cr-mk bl"></span><span class="cr-mk br"></span>' +
      '<span class="cr-reg"></span>';
    body.appendChild(frame);
  }

  /* ---- ticker: pause when offscreen or tab hidden (CSS handles hover + reduced-motion) ---- */
  var tickers = [].slice.call(d.querySelectorAll(".cr-ticker"));
  if (tickers.length && !reduce) {
    tickers.forEach(function (t) {
      var track = t.querySelector(".cr-tk-track"); if (!track) return;
      var vis = true, on = true;
      function sync() { t.classList.toggle("cr-pause", !vis || !on); }
      d.addEventListener("visibilitychange", function () { vis = !d.hidden; sync(); });
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (es) {
          es.forEach(function (e) { on = e.isIntersecting; }); sync();
        }, { threshold: 0 }).observe(t);
      }
    });
  }

  /* ============================================================
     margin-sidenotes — Tufte-style marginalia.
     Mobile-first: each .cr-sn marker is a real <button> that toggles its
     note open inline (tap / Enter / Space; Esc + blur close). On wide
     viewports (>=1280px) the notes are lifted into the right gutter and
     a collision-avoidance pass stacks them so they never overlap (gwern).
     No-ops when no .cr-sn is present. Reduced-motion + dark inherited from CSS.
     ============================================================ */
  (function marginSidenotes() {
    var snHost = d.querySelector(".article-body");
    var sns = snHost ? [].slice.call(snHost.querySelectorAll(".cr-sn")) : [];
    if (!sns.length) return;

    var DESKTOP = "(min-width: 1280px)";
    var mq = window.matchMedia ? window.matchMedia(DESKTOP) : { matches: false, addEventListener: null };
    var openSn = null;

    /* wire each marker as an accessible button + collapsible note */
    sns.forEach(function (sn, i) {
      var ref = sn.querySelector(".cr-sn-ref");
      var note = sn.querySelector(".cr-sn-note");
      if (!ref || !note) return;
      if (!note.id) note.id = "cr-sn-note-" + (i + 1);

      /* a real <button> ships in the markup; if a non-button shipped, upgrade it */
      var isBtn = ref.tagName === "BUTTON";
      if (!isBtn) { ref.setAttribute("role", "button"); ref.setAttribute("tabindex", "0"); }
      ref.setAttribute("aria-controls", note.id);
      ref.setAttribute("aria-expanded", "false");
      if (!ref.getAttribute("aria-label")) ref.setAttribute("aria-label", "Footnote " + (i + 1) + ", show note");
      note.setAttribute("role", "note");

      function setOpen(on) {
        if (mq.matches) return;                 // desktop: note always shown in margin
        sn.setAttribute("data-open", on ? "1" : "0");
        ref.setAttribute("aria-expanded", on ? "true" : "false");
        if (on) { if (openSn && openSn !== sn) collapse(openSn); openSn = sn; }
        else if (openSn === sn) openSn = null;
      }
      function collapse(other) {
        other.setAttribute("data-open", "0");
        var r = other.querySelector(".cr-sn-ref"); if (r) r.setAttribute("aria-expanded", "false");
      }
      function toggle() { setOpen(sn.getAttribute("data-open") !== "1"); }

      ref.addEventListener("click", function (e) { e.preventDefault(); toggle(); });
      ref.addEventListener("keydown", function (e) {
        /* native <button> already fires click on Enter/Space — only synthesize
           it for an upgraded non-button marker, to avoid a double-toggle */
        if (!isBtn && (e.key === "Enter" || e.key === " " || e.key === "Spacebar")) { e.preventDefault(); toggle(); }
        else if (e.key === "Escape") { setOpen(false); ref.blur(); }
      });

      /* desktop: light the note when its marker is hovered or focused */
      function lit(on) { sn.classList.toggle("cr-sn-lit", on && mq.matches); }
      ref.addEventListener("mouseenter", function () { lit(true); });
      ref.addEventListener("mouseleave", function () { lit(false); });
      ref.addEventListener("focus", function () { lit(true); });
      ref.addEventListener("blur", function () { lit(false); });
      note.addEventListener("mouseenter", function () { lit(true); });
      note.addEventListener("mouseleave", function () { lit(false); });
    });

    /* one mobile-open at a time: tap elsewhere / Esc closes it */
    d.addEventListener("click", function (e) {
      if (!openSn || mq.matches) return;
      if (!openSn.contains(e.target)) {
        openSn.setAttribute("data-open", "0");
        var r = openSn.querySelector(".cr-sn-ref"); if (r) r.setAttribute("aria-expanded", "false");
        openSn = null;
      }
    });
    d.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && openSn && !mq.matches) {
        var r = openSn.querySelector(".cr-sn-ref");
        openSn.setAttribute("data-open", "0");
        if (r) { r.setAttribute("aria-expanded", "false"); r.focus(); }
        openSn = null;
      }
    });

    /* ---- desktop placement: anchor each note beside its marker, then push
       any note down until it clears the previous one (collision avoidance) ---- */
    var raf = 0;
    function place() {
      raf = 0;
      if (!mq.matches) {                       // mobile: clear inline styles, let CSS collapse
        sns.forEach(function (sn) {
          var note = sn.querySelector(".cr-sn-note");
          if (note) note.style.top = "";
          sn.classList.remove("cr-sn-lit");
        });
        return;
      }
      var hostTop = snHost.getBoundingClientRect().top + (window.scrollY || window.pageYOffset);
      var prevBottom = -1e6, GAP = 14;
      sns.forEach(function (sn) {
        var ref = sn.querySelector(".cr-sn-ref");
        var note = sn.querySelector(".cr-sn-note");
        if (!ref || !note) return;
        note.style.top = "0px";                // reset before measuring height
        var anchor = ref.getBoundingClientRect().top + (window.scrollY || window.pageYOffset) - hostTop;
        var top = Math.max(anchor, prevBottom + GAP);
        note.style.top = top + "px";
        prevBottom = top + note.offsetHeight;
      });
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(place); }

    /* place once fonts/layout settle, on resize, and on any size shift; a couple
       of delayed passes catch the scroll-reveal transforms settling in */
    if (mq.matches) schedule();
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("load", function () { schedule(); setTimeout(schedule, 250); setTimeout(schedule, 900); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    if ("ResizeObserver" in window) {
      var ro = new ResizeObserver(schedule);
      ro.observe(snHost);
    }
    /* media-query flip between margin and inline modes */
    var onMq = function () {
      if (!mq.matches && openSn) { openSn.setAttribute("data-open", "0"); openSn = null; }
      schedule();
    };
    if (mq.addEventListener) mq.addEventListener("change", onMq);
    else if (mq.addListener) mq.addListener(onMq);
  })();

  /* ---- dimension dividers: draw the measure-lines + count the index up, once in view ---- */
  var dims = [].slice.call(d.querySelectorAll(".cr-dim"));
  if (dims.length) {
    var pad2 = function (n) { n = n || 0; return (n < 10 ? "0" : "") + n; };
    var countUp = function (el, n) {
      if (reduce || isNaN(n)) { el.textContent = pad2(n); return; }
      var start = null;
      function step(ts) {
        if (start === null) start = ts;
        var p = Math.min((ts - start) / 560, 1), e = 1 - Math.pow(1 - p, 3);
        el.textContent = pad2(Math.round(e * n));
        if (p < 1) requestAnimationFrame(step); else el.textContent = pad2(n);
      }
      requestAnimationFrame(step);
    };
    var activate = function (el) {
      if (el.getAttribute("data-on")) return;
      el.setAttribute("data-on", "1"); el.classList.add("cr-on");
      var num = el.querySelector(".cr-dm-num");
      if (num) {
        var n = parseInt(num.getAttribute("data-n"), 10);
        if (!isNaN(n)) setTimeout(function () { countUp(num, n); }, 260);
      }
    };
    if (reduce || !("IntersectionObserver" in window)) {
      dims.forEach(activate);
    } else {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { activate(e.target); io.unobserve(e.target); } });
      }, { threshold: 0.45, rootMargin: "0px 0px -8% 0px" });
      dims.forEach(function (el) { io.observe(el); });
    }
  }
})();

/* =====================================================================
   article-cover — enhances every .article-head into an editorial "cover
   plate": mono kicker rule, oversized outlined index numeral (outline->fill
   on load), index stamp, and an abstract line closed by a registration mark.
   Standalone IIFE; no-op when no .article-head present. Reduced-motion safe.
   ===================================================================== */
(function () {
  "use strict";
  var head = document.querySelector(".article-head");
  if (!head || head.classList.contains("cr-cover")) return;
  if (head.querySelector(".cr-cover-idx")) return;

  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mono = function (s) { return (s == null ? "" : String(s)).trim(); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  var meta = head.querySelector(".article-meta");
  var tagEl = head.querySelector(".post-tag");
  var category = mono(tagEl && tagEl.textContent) || "Guide";

  var readTime = "", dateTxt = "";
  if (meta) {
    [].slice.call(meta.querySelectorAll("span")).forEach(function (s) {
      var t = mono(s.textContent);
      if (!t || s === tagEl || t === "·") return;
      if (/\bread\b/i.test(t) || /\bmin\b/i.test(t)) readTime = t;
      else if (/\d/.test(t) || /updated|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(t)) dateTxt = t;
    });
  }

  var idxAttr = head.getAttribute("data-index");
  var slugMap = {
    "gmail-canned-responses": 1, "how-to-save-canned-responses-linkedin": 2,
    "customer-support-email-templates": 3, "best-canned-response-extensions": 4,
    "recruiter-outreach-templates": 5, "gmail-templates-vs-text-blaze-vs-briskine": 6
  };
  var idxNum;
  if (idxAttr != null && idxAttr !== "" && !isNaN(parseInt(idxAttr, 10))) idxNum = parseInt(idxAttr, 10);
  else { var slug = (location.pathname.split("/").pop() || "").replace(/\.html?$/i, ""); idxNum = slugMap[slug] || 1; }
  var idxPad = (idxNum < 10 ? "0" : "") + idxNum;

  var kicker = document.createElement("div");
  kicker.className = "cr-cover-kicker";
  kicker.innerHTML =
    '<span class="cr-cover-cat">' + esc(category.toUpperCase()) + '</span>' +
    '<span class="cr-cover-kdot">/</span><span>No.' + idxPad + '</span>' +
    '<span class="cr-cover-vol">VOL.01 · CANNED RESPONSES</span>';

  var plate = document.createElement("div");
  plate.className = "cr-cover-idx"; plate.setAttribute("aria-hidden", "true");
  plate.textContent = reduce ? idxPad : "00";

  var stamp = document.createElement("span");
  stamp.className = "cr-cover-stamp"; stamp.setAttribute("aria-hidden", "true");
  stamp.textContent = "No." + idxPad;

  var absMeta = [];
  if (dateTxt) absMeta.push(dateTxt.replace(/^updated\s+/i, "Upd. "));
  if (readTime) absMeta.push(readTime.toUpperCase());
  absMeta.push("FIELD NOTE / " + category.toUpperCase());

  var abstract = document.createElement("div");
  abstract.className = "cr-cover-abstract";
  abstract.innerHTML =
    '<span class="cr-cover-a-label">ABSTRACT</span>' +
    '<span class="cr-cover-a-meta">' + esc(absMeta.join("  ·  ")) + '</span>' +
    '<span class="cr-cover-reg" aria-hidden="true"></span>';

  if (meta) { meta.setAttribute("hidden", ""); meta.setAttribute("aria-hidden", "true"); }
  head.insertBefore(kicker, head.firstChild);
  head.appendChild(plate);
  head.appendChild(stamp);
  var lead = head.querySelector(".article-lead");
  if (lead && lead.parentNode === head) lead.insertAdjacentElement("afterend", abstract);
  else head.appendChild(abstract);
  head.classList.add("cr-cover");

  function countUp(el, target, pad) {
    var dur = 700, t0 = null;
    function frame(ts) {
      if (t0 == null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur), eased = 1 - Math.pow(1 - p, 3), v = Math.round(eased * target);
      el.textContent = (v < 10 ? "0" : "") + v;
      if (p < 1) requestAnimationFrame(frame); else el.textContent = pad;
    }
    requestAnimationFrame(frame);
  }
  function develop() { head.classList.add("cr-developed"); if (reduce) { plate.textContent = idxPad; return; } countUp(plate, idxNum, idxPad); }
  function start() {
    if (!("IntersectionObserver" in window)) { develop(); return; }
    var io = new IntersectionObserver(function (ents) { ents.forEach(function (e) { if (e.isIntersecting) { develop(); io.disconnect(); } }); }, { threshold: 0.2 });
    io.observe(plate);
    setTimeout(function () { if (!head.classList.contains("cr-developed")) { develop(); io.disconnect(); } }, 1200);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { requestAnimationFrame(start); });
  else requestAnimationFrame(start);
})();

/* =====================================================================
   hub-editorial — "Card-Catalog Index" for the blog hub contents list.
   Builds a FILED-UNDER facet row (peripheral dimming) + a per-row hover
   dossier line (READ N MIN · YEAR) with a register caret. Standalone IIFE;
   no-op when .toc-list is absent. Reduced-motion / keyboard / touch safe.
   ===================================================================== */
(function () {
  "use strict";
  var d = document;
  var list = d.querySelector(".toc-list");
  var toc = d.querySelector("main.toc, .toc");
  if (!list || !toc) return;
  var rows = [].slice.call(list.querySelectorAll("a.tocrow"));
  if (!rows.length) return;
  toc.classList.add("cr-hub");

  function estReadMin(row) {
    var t = (row.querySelector(".toctitle") || {}).textContent || "";
    var k = (row.querySelector(".tocdek") || {}).textContent || "";
    var words = (t + " " + k).trim().split(/\s+/).filter(Boolean).length;
    return Math.max(4, Math.min(14, Math.round(words / 9) + 4));
  }
  function catOf(row) {
    var explicit = row.getAttribute("data-cat");
    if (explicit) return explicit.trim().toUpperCase();
    var el = row.querySelector(".toccat");
    return ((el && el.textContent) || "FILED").trim().toUpperCase();
  }
  function yearOf(row) { return (row.getAttribute("data-year") || "2026").trim(); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  var counts = {}, order = [];
  rows.forEach(function (row) {
    var cat = catOf(row);
    if (!(cat in counts)) { counts[cat] = 0; order.push(cat); }
    counts[cat]++;
    row.setAttribute("data-cr-cat", cat);

    var read = row.getAttribute("data-read");
    var mins = read ? parseInt(read, 10) : estReadMin(row);
    if (isNaN(mins)) mins = estReadMin(row);

    var main = row.querySelector(".tocmain");
    var dek = row.querySelector(".tocdek");
    if (main && dek && !main.querySelector(".cr-meta")) {
      var meta = d.createElement("div");
      meta.className = "cr-meta";
      meta.setAttribute("aria-hidden", "true");
      meta.innerHTML =
        '<span class="cr-mrule"></span>' +
        '<span>READ <b>' + mins + ' MIN</b></span>' +
        '<span class="cr-dot">·</span>' +
        '<span>' + esc(yearOf(row)) + '</span>';
      dek.parentNode.insertBefore(meta, dek.nextSibling);
    }
    var num = row.querySelector(".tocnum");
    if (num) num.classList.add("cr-caret");
  });

  var masthead = toc.querySelector(".toc-masthead");
  if (masthead && !toc.querySelector(".cr-facets")) {
    var bar = d.createElement("div");
    bar.className = "cr-facets";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Filter entries by category");
    bar.innerHTML = '<span class="cr-facets-k">Filed under</span>';
    order.forEach(function (cat) {
      var b = d.createElement("button");
      b.type = "button"; b.className = "cr-facet";
      b.setAttribute("aria-pressed", "false");
      b.setAttribute("data-cr-facet", cat);
      b.innerHTML = esc(cat) + '<span class="cr-facet-n">' + counts[cat] + '</span>';
      bar.appendChild(b);
    });
    masthead.parentNode.insertBefore(bar, masthead.nextSibling);

    var facets = [].slice.call(bar.querySelectorAll(".cr-facet"));
    var active = null;
    function applyDim(cat) {
      if (cat) {
        toc.classList.add("cr-filtering");
        rows.forEach(function (r) { r.getAttribute("data-cr-cat") === cat ? r.removeAttribute("data-cr-dim") : r.setAttribute("data-cr-dim", "1"); });
      } else {
        toc.classList.remove("cr-filtering");
        rows.forEach(function (r) { r.removeAttribute("data-cr-dim"); });
      }
    }
    function setActive(cat) {
      active = cat;
      facets.forEach(function (f) { f.setAttribute("aria-pressed", f.getAttribute("data-cr-facet") === cat ? "true" : "false"); });
      applyDim(cat);
    }
    facets.forEach(function (f) {
      var cat = f.getAttribute("data-cr-facet");
      f.addEventListener("click", function () { setActive(active === cat ? null : cat); });
      f.addEventListener("mouseenter", function () { if (!active) applyDim(cat); });
      f.addEventListener("mouseleave", function () { if (!active) applyDim(null); });
      f.addEventListener("focus", function () { if (!active) applyDim(cat); });
      f.addEventListener("blur", function () { if (!active) applyDim(null); });
    });
    bar.addEventListener("keydown", function (e) { if (e.key === "Escape" && active) { e.preventDefault(); setActive(null); } });
  }
})();

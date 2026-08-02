/* ==========================================================================
   CANNED RESPONSES — once.js
   Behavior for the TYPE IT ONCE experience. Vanilla, no dependencies.
   1) THE TYPIST — scroll-scrubbed typing → Alt+A → collapse → palette → insert
   2) THE DESK — real interactive demo (real Alt+A, real ;intro+Tab, real caret)
   3) EXPANSION / THE WALL / CAPTURE / GMAIL⇄LINKEDIN — scripted vignettes
   4) PAYOFF — Alt+A morphs into the install key
   Honors prefers-reduced-motion. No libraries.
   ========================================================================== */
(function () {
  "use strict";
  var d = document;
  d.documentElement.classList.remove("no-js");
  var reduceMq = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  var reduce = !!(reduceMq && reduceMq.matches);
  if (reduceMq && reduceMq.addEventListener) reduceMq.addEventListener("change", function (e) { reduce = e.matches; });
  function $(s, c) { return (c || d).querySelector(s); }
  function $$(s, c) { return [].slice.call((c || d).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  /* The email the visitor watches being typed — exactly 187 keystrokes. */
  var EMAIL = "Hi Sarah,\n\nThanks for reaching out — happy to help with this. Could we do Thursday at 2:00 PM? I'll send over a calendar invite and a short agenda beforehand. Happy to adjust.\n\nBest,\nAlex";

  /* ========================================================================
     1) THE TYPIST
     ======================================================================== */
  (function typist() {
    var track = $("#tTrack"), stage = $("#tStage"), section = track && track.closest(".typist");
    if (!track || !stage) return;
    var typed = $("#tTyped"), mKeys = $("#mKeys"), mTime = $("#mTime"),
        mTimes = $("#mTimes b"),
        kAlt = $("#kAlt"), kA = $("#kA"),
        shards = $("#tShards"), chip = $("#tChip"),
        palette = $("#tPalette"), query = $("#tQuery"),
        body = $("#tBody");
    var LEN = EMAIL.length;

    var SEG = [
      { n: 0, a: 0.00, b: 0.26 },
      { n: 1, a: 0.26, b: 0.44 },
      { n: 2, a: 0.44, b: 0.60 },
      { n: 3, a: 0.60, b: 0.80 },
      { n: 4, a: 0.80, b: 1.00 }
    ];
    section.setAttribute("data-scene", "0");

    /* shards — fragments of the email that fly into the command chip */
    var PIECES = ["Hi Sarah,", "Thanks for", "reaching out —", "happy to help", "with this.", "Could we do", "Thursday", "at 2:00 PM?", "calendar invite", "a short agenda", "Best,", "Alex"];
    var shardEls = [];
    PIECES.forEach(function (p, i) {
      var s = d.createElement("span");
      s.className = "shard";
      s.textContent = p;
      s.style.setProperty("--i", i);
      shards.appendChild(s);
      shardEls.push(s);
    });
    function layoutShards() {
      var sr = stage.getBoundingClientRect();
      var br = body.getBoundingClientRect();
      var cr = chip.getBoundingClientRect();
      var cx = (cr.left + cr.right) / 2 - sr.left, cy = (cr.top + cr.bottom) / 2 - sr.top;
      shardEls.forEach(function (s, i) {
        var col = i % 3, row = (i / 3) | 0;
        var x = br.left - sr.left + 14 + col * ((br.width - 40) / 3) + (i * 7) % 18;
        var y = br.top - sr.top + 10 + row * ((br.height - 30) / 4);
        s.style.left = x + "px";
        s.style.top = y + "px";
        s.style.setProperty("--tx", (cx - x) + "px");
        s.style.setProperty("--ty", (cy - y) + "px");
      });
    }

    function fmtTime(sec) {
      var m = (sec / 60) | 0, s = (sec % 60) | 0;
      return m + ":" + (s < 10 ? "0" : "") + s;
    }
    function pad3(n) { n = Math.round(n); return n < 100 ? ("00" + n).slice(-3) : String(n); }

    var raw = 0, smooth = 0, active = false, lastScene = -1, flashed = false;
    var trackTop = 0, trackH = 0, vh = 1, lastApplied = -1;
    function remeasure() {
      vh = window.innerHeight || 1;
      var r = track.getBoundingClientRect();
      trackTop = r.top + (window.scrollY || 0);
      trackH = track.offsetHeight;
    }
    function measure() {
      var total = trackH - vh;
      raw = total > 0 ? clamp(((window.scrollY || 0) - trackTop) / total, 0, 1) : 0;
    }
    function sceneFor(p) {
      for (var i = 0; i < SEG.length; i++) if (p <= SEG[i].b) return SEG[i];
      return SEG[SEG.length - 1];
    }

    function apply() {
      var p = smooth;
      var seg = sceneFor(p);
      if (Math.abs(p - lastApplied) < 0.0002 && seg.n === lastScene) return;
      lastApplied = p;
      var t = clamp((p - seg.a) / (seg.b - seg.a || 1), 0, 1);

      if (seg.n !== lastScene) {
        section.setAttribute("data-scene", String(seg.n));
        if (seg.n === 3) layoutShards();
        if (seg.n === 4) {
          typed.textContent = EMAIL;
          mKeys.textContent = "3";
          mKeys.classList.add("stamp");
          mTime.textContent = "0:01";
          mTime.classList.add("stamp");
          if (!flashed && !reduce) {
            flashed = true;
            body.classList.add("flash");
            setTimeout(function () { body.classList.remove("flash"); }, 550);
          }
        } else {
          mKeys.classList.remove("stamp");
          mTime.classList.remove("stamp");
          if (seg.n < 4) flashed = false;
        }
        lastScene = seg.n;
      }

      if (seg.n === 0) {
        var k = Math.round(t * LEN);
        typed.textContent = EMAIL.slice(0, k);
        mKeys.textContent = pad3(k);
        mTime.textContent = fmtTime(k / 4.2);
        mTimes.textContent = "×1";
      } else if (seg.n === 1) {
        typed.textContent = EMAIL;
        var total = LEN * 23;
        var kk = LEN + t * (total - LEN);
        mKeys.textContent = String(Math.round(kk / 10) * 10);
        mTime.textContent = fmtTime(kk / 4.2);
        mTimes.textContent = "×" + clamp(Math.round(1 + t * 22), 1, 23);
      } else if (seg.n === 2) {
        typed.textContent = EMAIL;
        mKeys.textContent = String(LEN * 23);
        mTimes.textContent = "×23";
        kAlt.classList.toggle("is-down", t > 0.35);
        kA.classList.toggle("is-down", t > 0.62);
      } else if (seg.n === 3) {
        palette.classList.toggle("p-open", t > 0.4);
        var q = "follow";
        var qn = clamp(Math.round(((t - 0.45) / 0.35) * q.length), 0, q.length);
        query.textContent = q.slice(0, qn);
      }
      if (seg.n !== 3) palette.classList.remove("p-open");
      if (seg.n !== 2) { kAlt.classList.remove("is-down"); kA.classList.remove("is-down"); }
    }

    var rafId = 0;
    function loop() {
      measure();
      smooth = reduce ? raw : smooth + (raw - smooth) * 0.2;
      if (Math.abs(raw - smooth) < 0.0004) smooth = raw;
      apply();
      rafId = active ? requestAnimationFrame(loop) : 0;
    }
    function setActive(on) {
      if (on === active) return;
      active = on;
      if (on && !rafId) rafId = requestAnimationFrame(loop);
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { setActive(e.isIntersecting); });
      }, { rootMargin: "80px 0px" }).observe(track);
    } else setActive(true);
    window.addEventListener("resize", function () {
      remeasure();
      if (lastScene === 3) layoutShards();
    }, { passive: true });
    window.addEventListener("load", remeasure);
    remeasure(); measure(); smooth = raw; apply();
  })();

  /* ========================================================================
     2) THE DESK — the real demo
     ======================================================================== */
  (function desk() {
    var section = $("#try"), compose = $("#dmCompose"), dmBody = $("#dmBody"),
        hint = $("#dmHint"), log = $("#dmLog"),
        altBtn = $("#dmAltBtn"), abbrBtn = $("#dmAbbrBtn"),
        vFirst = $("#vFirst"), vCompany = $("#vCompany");
    if (!section || !dmBody) return;

    var TEMPLATES = [
      { title: "Quick follow-up", shortcut: "followup", body: "Hi {first_name},<br><br>Just following up on my last note — any thoughts? Happy to answer questions whenever suits.<br><br>Best,<br>Alex" },
      { title: "Meeting reschedule", shortcut: "resched", body: "Hi {first_name}, something's come up on my side — could we move our call to {day} at {time}? Sorry for the shuffle!" },
      { title: "Thanks for applying", shortcut: "applied", body: "Hi {first_name},<br><br>Thanks so much for applying to {company}! We're reviewing applications this week and will get back to you shortly." },
      { title: "Introduction", shortcut: "intro", body: "Hi {first_name},<br><br>Thanks for reaching out — I'd love to introduce you to what we're building at {company}. Would {day} work for a quick call?<br><br>Best,<br>Alex" },
      { title: "Support reply", shortcut: "support", body: "Hi {first_name}, sorry for the trouble — as of {date} this is fixed on our side. Could you refresh, sign out and back in, and try again?" }
    ];

    /* ---- console log ---- */
    function addLog(txt, cls) {
      var li = d.createElement("li");
      li.textContent = txt;
      if (cls) li.classList.add(cls);
      log.appendChild(li);
      requestAnimationFrame(function () { requestAnimationFrame(function () { li.classList.add("on"); }); });
      while (log.children.length > 6) log.removeChild(log.firstChild);
    }

    /* ---- caret bookkeeping (both boundaries must live inside the body) ---- */
    var savedRange = null;
    function insideBody(r) {
      return dmBody.contains(r.startContainer) && dmBody.contains(r.endContainer);
    }
    function saveCaret() {
      var sel = window.getSelection();
      if (sel.rangeCount && insideBody(sel.getRangeAt(0))) {
        savedRange = sel.getRangeAt(0).cloneRange();
      }
    }
    d.addEventListener("selectionchange", saveCaret);
    dmBody.addEventListener("focus", saveCaret);

    function caretRange() {
      if (savedRange && insideBody(savedRange)) {
        var r0 = savedRange.cloneRange();
        // never leave the caret inside a resolved-token span
        var tokEl = r0.startContainer.nodeType === 1 ? r0.startContainer : r0.startContainer.parentNode;
        var tok = tokEl && tokEl.closest ? tokEl.closest(".tok-i") : null;
        if (tok) { r0.setStartAfter(tok); r0.collapse(true); }
        return r0;
      }
      var r = d.createRange();
      r.selectNodeContents(dmBody);
      r.collapse(false);
      return r;
    }

    /* ---- variable resolution ---- */
    function autoVals() {
      var now = new Date();
      return {
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        day: now.toLocaleDateString([], { weekday: "long" })
      };
    }
    function valueFor(token) {
      var a = autoVals();
      if (a[token] != null) return a[token];
      if (token === "first_name") return (vFirst && vFirst.value.trim()) || "Alex";
      if (token === "company") return (vCompany && vCompany.value.trim()) || "Acme";
      return "{" + token + "}";
    }
    function bodyToHtml(tpl) {
      var resolved = [];
      var html = tpl.body.replace(/\{([a-z0-9_]+)\}/gi, function (m, tok) {
        var v = valueFor(tok.toLowerCase());
        resolved.push("{" + tok + "} → " + v);
        if (reduce) return '<span class="tok-i resolved">' + esc(v) + "</span>";
        return '<span class="tok-i" data-v="' + esc(v) + '">{' + esc(tok) + "}</span>";
      });
      return { html: html, resolved: resolved };
    }

    /* ---- insertion at the caret (the product's one promise) ---- */
    function insertAtCaret(html, after) {
      var range = caretRange();
      range.deleteContents();
      var tmp = d.createElement("div");
      tmp.innerHTML = html;
      var frag = d.createDocumentFragment(), node, last = null;
      while ((node = tmp.firstChild)) last = frag.appendChild(node);
      range.insertNode(frag);
      if (last) {
        var sel = window.getSelection();
        var nr = d.createRange();
        nr.setStartAfter(last);
        nr.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nr);
        savedRange = nr.cloneRange();
      }
      dmBody.focus();
      if (!reduce) {
        dmBody.classList.add("flash");
        setTimeout(function () { dmBody.classList.remove("flash"); }, 520);
      }
      var toks = $$(".tok-i:not(.resolved)", dmBody);
      toks.forEach(function (tk, i) {
        setTimeout(function () {
          tk.textContent = tk.getAttribute("data-v");
          tk.classList.add("resolved");
        }, 380 + i * 150);
      });
      if (after) after();
    }

    /* ---- the palette ---- */
    var pal = d.createElement("div");
    pal.className = "palette dm-palette";
    pal.setAttribute("role", "dialog");
    pal.setAttribute("aria-label", "Template picker");
    pal.innerHTML =
      '<div class="p-head mono">TEMPLATES <span class="p-key">ALT+A</span></div>' +
      '<div class="p-search mono"><input id="dmQ" type="text" placeholder="Search templates…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="dmList" aria-autocomplete="list" aria-label="Search templates"></div>' +
      '<div class="p-list" id="dmList" role="listbox" aria-label="Templates"></div>' +
      '<div class="p-foot mono"><span>↑↓ navigate</span><span>↵ insert</span><span>esc close</span></div>';
    compose.appendChild(pal);
    var q = $("#dmQ", pal), list = $("#dmList", pal);
    var open = false, idx = 0, filtered = TEMPLATES.slice();

    function render() {
      list.innerHTML = "";
      if (!filtered.length) {
        q.removeAttribute("aria-activedescendant");
        var e = d.createElement("div");
        e.className = "p-empty mono";
        e.textContent = "No matches — in the extension you'd hit + New template";
        list.appendChild(e);
        return;
      }
      filtered.forEach(function (t, i) {
        var row = d.createElement("div");
        row.className = "p-row" + (i === idx ? " sel" : "");
        row.id = "dmOpt" + i;
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", i === idx ? "true" : "false");
        row.innerHTML = "<b></b><span class='mono'></span>";
        row.firstChild.textContent = t.title;
        row.lastChild.textContent = ";" + t.shortcut;
        row.addEventListener("mouseenter", function () { idx = i; render(); });
        row.addEventListener("mousedown", function (ev) { ev.preventDefault(); choose(); });
        list.appendChild(row);
      });
      q.setAttribute("aria-activedescendant", "dmOpt" + idx);
    }
    function filter() {
      var s = q.value.trim().toLowerCase();
      filtered = TEMPLATES.filter(function (t) {
        return (t.title + " " + t.shortcut + " " + t.body).toLowerCase().indexOf(s) !== -1;
      });
      idx = 0;
      render();
    }
    function openPal() {
      if (open) return;
      open = true;
      saveCaret();
      q.value = "";
      filter();
      pal.classList.add("p-open");
      q.setAttribute("aria-expanded", "true");
      q.focus();
      hint.textContent = "PICKER OPEN — IT'S LISTENING";
      addLog("picker opened · " + TEMPLATES.length + " templates", "cmdline");
    }
    function closePal(refocus) {
      if (!open) return;
      open = false;
      pal.classList.remove("p-open");
      q.setAttribute("aria-expanded", "false");
      if (refocus !== false) dmBody.focus();
    }
    function choose() {
      var t = filtered[idx];
      if (!t) return;
      closePal(false);
      var out = bodyToHtml(t);
      insertAtCaret(out.html, function () {
        addLog("“" + t.title + "” inserted at your cursor · 3 keypresses", "ok");
        out.resolved.forEach(function (r) { addLog(r); });
        hint.textContent = "“" + t.title.toUpperCase() + "” INSERTED ✓" +
          (out.resolved.length ? " · " + out.resolved.length + " VARIABLES RESOLVED" : "") +
          " · NOW TRY ;intro + TAB";
      });
    }
    /* keyboard containment: Escape works anywhere in the dialog, focus loss closes it */
    pal.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); closePal(); }
    });
    d.addEventListener("keydown", function (e) {
      if (open && e.key === "Escape") { e.preventDefault(); closePal(); }
    });
    pal.addEventListener("focusout", function (e) {
      if (open && (!e.relatedTarget || !pal.contains(e.relatedTarget))) closePal(false);
    });
    q.addEventListener("input", filter);
    q.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); if (filtered.length) { idx = (idx + 1) % filtered.length; render(); } }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (filtered.length) { idx = (idx - 1 + filtered.length) % filtered.length; render(); } }
      else if (e.key === "Enter") { e.preventDefault(); choose(); }
      else if (e.key === "Escape") { e.preventDefault(); closePal(); }
    });
    d.addEventListener("mousedown", function (e) {
      if (open && !pal.contains(e.target)) closePal(false);
    });

    /* ---- REAL Alt+A ---- */
    var deskVisible = false;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { deskVisible = e.isIntersecting; });
      }, { threshold: 0.25 }).observe(section);
    } else deskVisible = true;
    window.addEventListener("keydown", function (e) {
      if (!deskVisible || open) return;
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.code !== "KeyA") return;
      // never hijack typing in a real text field (macOS Option+A composes "å")
      var ae = d.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;
      // only fire when attention is plausibly on the demo: focus inside it, or nothing focused
      if (!(section.contains(ae) || ae === d.body || ae === null)) return;
      e.preventDefault();
      pressBtn(altBtn);
      openPal();
    }, true);

    /* ---- REAL ;shortcut + Tab (the expander, re-implemented) ---- */
    function expandNode(node, offset) {
      if (node.nodeType !== 3) return false;
      var before = node.textContent.slice(0, offset);
      var m = before.match(/;([a-z0-9_]+)$/i);
      if (!m) return false;
      var tpl = null;
      TEMPLATES.forEach(function (t) { if (t.shortcut.toLowerCase() === m[1].toLowerCase()) tpl = t; });
      if (!tpl) return false;
      var del = d.createRange();
      del.setStart(node, offset - m[0].length);
      del.setEnd(node, offset);
      del.deleteContents();
      savedRange = del.cloneRange();
      var out = bodyToHtml(tpl);
      insertAtCaret(out.html, function () {
        addLog(";" + tpl.shortcut + " + TAB → expanded in place", "ok");
        out.resolved.forEach(function (rr) { addLog(rr); });
        hint.textContent = ";" + tpl.shortcut.toUpperCase() + " EXPANDED ✓" +
          (out.resolved.length ? " · " + out.resolved.length + " VARIABLES RESOLVED" : "");
      });
      return true;
    }
    dmBody.addEventListener("keydown", function (e) {
      if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      var sel = window.getSelection();
      if (!sel.rangeCount || !sel.isCollapsed) return;
      var r = sel.getRangeAt(0);
      if (!dmBody.contains(r.startContainer)) return;
      if (expandNode(r.startContainer, r.startOffset)) e.preventDefault();
    });

    /* ---- fallback buttons (mobile + discoverability) ---- */
    function pressBtn(b) {
      if (!b || reduce) return;
      b.classList.add("is-down");
      setTimeout(function () { b.classList.remove("is-down"); }, 160);
    }
    altBtn.addEventListener("click", function () { pressBtn(altBtn); dmBody.focus(); openPal(); });
    abbrBtn.addEventListener("click", function () {
      if (abbrBtn.disabled) return;
      abbrBtn.disabled = true;
      closePal(false);
      dmBody.focus();
      var r = d.createRange();
      r.selectNodeContents(dmBody);
      r.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(r);
      var prefix = dmBody.textContent.length && !/\s$/.test(dmBody.textContent) ? " " : "";
      var tn = d.createTextNode(prefix + ";intro");
      r.insertNode(tn);
      var nr = d.createRange();
      nr.setStart(tn, tn.length); nr.collapse(true);
      sel.removeAllRanges(); sel.addRange(nr);
      savedRange = nr.cloneRange();
      addLog("typed ;intro", "cmdline");
      setTimeout(function () {
        // expand directly against the node we inserted — immune to selection changes
        if (tn.parentNode && dmBody.contains(tn)) {
          expandNode(tn, tn.textContent.length);
        }
        abbrBtn.disabled = false;
      }, reduce ? 0 : 420);
    });
    dmBody.addEventListener("focus", function () {
      if (hint.textContent.indexOf("CLICK INTO") === 0) hint.textContent = "NOW PRESS ALT+A — THE REAL KEYS";
    });
  })();

  /* one visually-hidden status line narrates the scripted vignettes for AT */
  var vigSay = (function () {
    var el = d.createElement("p");
    el.className = "sr-only";
    el.setAttribute("role", "status");
    d.body.appendChild(el);
    return function (t) { el.textContent = t; };
  })();

  /* ========================================================================
     3) EXPANSION vignette
     ======================================================================== */
  (function expansion() {
    var stage = $("#exStage"), tab = $("#exTab"), replay = $("#exReplay");
    if (!stage) return;
    var played = false, timers = [];
    function run() {
      if (reduce) { stage.classList.add("is-open"); vigSay("Expanded ;intro into the full introduction email."); return; }
      tab.classList.add("is-down");
      timers.push(setTimeout(function () {
        tab.classList.remove("is-down");
        stage.classList.add("is-open");
        vigSay("Expanded ;intro into the full introduction email.");
      }, 180));
    }
    function reset() {
      timers.forEach(clearTimeout); timers = [];
      stage.classList.remove("is-open");
    }
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting && !played) { played = true; timers.push(setTimeout(run, 500)); io.disconnect(); }
        });
      }, { threshold: 0.5 });
      io.observe(stage);
    } else run();
    tab.addEventListener("click", function () { reset(); timers.push(setTimeout(run, 80)); });
    if (replay) replay.addEventListener("click", function () { reset(); timers.push(setTimeout(run, 260)); });
  })();

  /* ========================================================================
     4) THE WALL
     ======================================================================== */
  (function wall() {
    var stage = $("#wallStage"), grid = $("#wallGrid"), key = $("#wallKey");
    if (!stage || !grid) return;
    var PHRASES = [
      ["Just following up…", "FOLLOW-UP · AGAIN"],
      ["Thanks for reaching out…", "INTRO · AGAIN"],
      ["Could we reschedule…", "RESCHEDULE · AGAIN"],
      ["Thanks so much for applying…", "APPLICATION · AGAIN"],
      ["Sorry for the trouble — try…", "SUPPORT · AGAIN"],
      ["Great speaking with you…", "THANK-YOU · AGAIN"]
    ];
    var N = 24;
    for (var i = 0; i < N; i++) {
      var p = PHRASES[i % PHRASES.length];
      var el = d.createElement("div");
      el.className = "wm";
      el.style.setProperty("--i", i);
      el.innerHTML = "<i></i><span></span>";
      el.firstChild.textContent = p[1];
      el.lastChild.textContent = p[0];
      grid.appendChild(el);
    }
    var items = $$(".wm", grid);
    var timers = [];
    function crush() {
      var sr = stage.getBoundingClientRect();
      var kr = key.getBoundingClientRect();
      var cx = (kr.left + kr.right) / 2, cy = (kr.top + kr.bottom) / 2;
      items.forEach(function (el) {
        var r = el.getBoundingClientRect();
        el.style.setProperty("--tx", (cx - (r.left + r.width / 2)) + "px");
        el.style.setProperty("--ty", (cy - (r.top + r.height / 2)) + "px");
      });
      stage.classList.add("is-crush");
      timers.push(setTimeout(function () { stage.classList.add("is-out"); }, 750));
    }
    function play() {
      stage.classList.add("is-on");
      if (reduce) {
        stage.classList.add("is-static");
        vigSay("A month of repeated replies compressed into six reusable templates.");
        return;
      }
      timers.push(setTimeout(crush, 2100));
      timers.push(setTimeout(function () {
        vigSay("A month of repeated replies compressed into six reusable templates.");
      }, 3000));
    }
    function reset() {
      timers.forEach(clearTimeout); timers = [];
      stage.classList.remove("is-on", "is-crush", "is-out", "is-static");
    }
    var played = false;
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting && !played) { played = true; play(); io.disconnect(); } });
      }, { threshold: 0.35 });
      io.observe(stage);
    } else play();
    var replay = $("#wallReplay");
    if (replay) replay.addEventListener("click", function () { reset(); timers.push(setTimeout(play, 300)); });
  })();

  /* ========================================================================
     5) CAPTURE
     ======================================================================== */
  (function capture() {
    var stage = $("#capStage"), sel = $("#capSel"), pill = $("#capPill");
    if (!stage) return;
    var timers = [];
    function placePill() {
      var mr = pill.parentNode.getBoundingClientRect();
      var sr = sel.getBoundingClientRect();
      pill.style.left = clamp(sr.left - mr.left + sr.width / 2, 90, mr.width - 90) + "px";
      pill.style.top = (sr.top - mr.top - 40) + "px";
    }
    function play() {
      placePill();
      stage.classList.add("s1");
      if (reduce) {
        stage.classList.add("s2", "s3", "s4", "s5");
        vigSay("Selected text saved as a new template.");
        return;
      }
      timers.push(setTimeout(function () { stage.classList.add("s2"); }, 1000));
      timers.push(setTimeout(function () { stage.classList.add("s3"); }, 1900));
      timers.push(setTimeout(function () { stage.classList.add("s4"); }, 2200));
      timers.push(setTimeout(function () {
        stage.classList.add("s5");
        vigSay("Selected text saved as a new template.");
      }, 2950));
    }
    function reset() {
      timers.forEach(clearTimeout); timers = [];
      stage.classList.remove("s1", "s2", "s3", "s4", "s5");
    }
    var played = false;
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting && !played) { played = true; timers.push(setTimeout(play, 350)); io.disconnect(); } });
      }, { threshold: 0.4 });
      io.observe(stage);
    } else play();
    var replay = $("#capReplay");
    if (replay) replay.addEventListener("click", function () { reset(); timers.push(setTimeout(play, 300)); });
    window.addEventListener("resize", function () { if (stage.classList.contains("s2")) placePill(); }, { passive: true });
  })();

  /* ========================================================================
     6) GMAIL ⇄ LINKEDIN
     ======================================================================== */
  (function both() {
    var stage = $("#bothStage"), g = $("#bpGmail"), l = $("#bpLi");
    if (!stage) return;
    var RICH = "Hi Sarah — something's come up on my side. Could we move our call to <b>Thursday at 2:00 PM</b>? Sorry for the shuffle!";
    var PLAIN = "Hi Sarah — something's come up on my side. Could we move our call to Thursday at 2:00 PM? Sorry for the shuffle!";
    var timers = [];
    function fill(el, html) {
      el.innerHTML = html;
      if (!reduce) {
        el.classList.add("flash");
        setTimeout(function () { el.classList.remove("flash"); }, 520);
      }
    }
    function play() {
      if (reduce) {
        fill(g, RICH); fill(l, PLAIN);
        vigSay("The same template inserted into Gmail with formatting and into LinkedIn as plain text.");
        return;
      }
      timers.push(setTimeout(function () { stage.classList.add("to-g"); }, 400));
      timers.push(setTimeout(function () { fill(g, RICH); }, 1050));
      timers.push(setTimeout(function () { stage.classList.remove("to-g"); }, 1600));
      timers.push(setTimeout(function () { stage.classList.add("to-l"); }, 2200));
      timers.push(setTimeout(function () { fill(l, PLAIN); }, 2850));
      timers.push(setTimeout(function () {
        stage.classList.remove("to-l");
        vigSay("The same template inserted into Gmail with formatting and into LinkedIn as plain text.");
      }, 3400));
    }
    function reset() {
      timers.forEach(clearTimeout); timers = [];
      stage.classList.remove("to-g", "to-l");
      g.innerHTML = ""; l.innerHTML = "";
    }
    var played = false;
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting && !played) { played = true; play(); io.disconnect(); } });
      }, { threshold: 0.4 });
      io.observe(stage);
    } else play();
    var replay = $("#bothReplay");
    if (replay) replay.addEventListener("click", function () { reset(); timers.push(setTimeout(play, 300)); });
  })();

  /* ========================================================================
     7) PAYOFF — Alt+A becomes the install key
     ======================================================================== */
  (function fin() {
    var fin = $("#install");
    if (!fin) return;
    var keys = $$("#finCombo .keycap");
    function morph() {
      if (reduce) { fin.classList.add("morphed"); return; }
      keys.forEach(function (k, i) {
        setTimeout(function () { k.classList.add("is-down"); }, 300 + i * 220);
      });
      setTimeout(function () { fin.classList.add("morphed"); }, 1050);
    }
    var played = false;
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting && !played) { played = true; morph(); io.disconnect(); } });
      }, { threshold: 0.5 });
      io.observe(fin);
    } else morph();
  })();

  /* ========================================================================
     8) theme — the lamp switch (shares the blog's stored preference)
     ======================================================================== */
  (function theme() {
    var root = d.documentElement;
    function cur() { return root.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
    function set(t) {
      if (t === "dark") root.setAttribute("data-theme", "dark");
      else root.removeAttribute("data-theme");
      try { localStorage.setItem("cr-theme", t); } catch (e) {}
      sync();
    }
    var btn = d.createElement("button");
    btn.type = "button";
    btn.className = "theme-key";
    btn.innerHTML =
      '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' +
      '<svg class="moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/></svg>';
    function sync() {
      var dark = cur() === "dark";
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
      btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      btn.title = dark ? "Light mode" : "Dark mode";
    }
    sync();
    btn.addEventListener("click", function () { set(cur() === "dark" ? "light" : "dark"); });
    var bar = $(".bar"), cta = $(".btn-bar");
    if (bar && cta) bar.insertBefore(btn, cta); else if (bar) bar.appendChild(btn);
    // follow the OS only while the user hasn't chosen
    try {
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
        var stored = null;
        try { stored = localStorage.getItem("cr-theme"); } catch (err) {}
        if (!stored) {
          if (e.matches) root.setAttribute("data-theme", "dark");
          else root.removeAttribute("data-theme");
          sync();
        }
      });
    } catch (e) {}
  })();

  /* ========================================================================
     9) micro — magnetic primary buttons
     ======================================================================== */
  (function micro() {
    if (reduce || !window.matchMedia || !matchMedia("(pointer:fine)").matches) return;
    $$(".btn-blue").forEach(function (b) {
      b.addEventListener("mousemove", function (e) {
        var r = b.getBoundingClientRect();
        var dx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1);
        var dy = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2), -1, 1);
        b.style.transform = "translate(" + (dx * 3).toFixed(1) + "px," + (dy * 3 - 1).toFixed(1) + "px)";
      });
      b.addEventListener("mouseleave", function () { b.style.transform = ""; });
    });
  })();
})();

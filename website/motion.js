/* Canned Responses — shared site motion.
 * Reading-progress bar · scroll-reveal · live hero demo · FAQ polish.
 * Self-contained, accessible (honors reduced-motion), and a no-op where elements
 * are absent — so the same file works on the landing page, blog, and article. */
(function () {
  "use strict";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var byId = function (id) { return document.getElementById(id); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* ---- reading-progress bar ---- */
  var bar = document.createElement("div");
  bar.className = "read-progress";
  document.body.appendChild(bar);
  function prog() {
    var h = document.documentElement, m = h.scrollHeight - h.clientHeight;
    bar.style.width = (m > 0 ? (h.scrollTop / m * 100) : 0) + "%";
  }
  window.addEventListener("scroll", prog, { passive: true });
  prog();

  /* ---- staggered scroll-reveal ---- */
  var sel = ".feature,.section>h2,.section>.section-sub,.plan,.support-card,.faq details," +
    ".post-card,.blog-head,.toc," +
    ".article-body h2,.article-body h3,.article-body p,.article-body ul,.article-body ol," +
    ".article-body .figure,.article-body .callout,.article-body .cta-box,.article-body .ctable," +
    ".related-list a,.author";
  var nodes = [].slice.call(document.querySelectorAll(sel));
  nodes.forEach(function (el) { el.classList.add("reveal"); });
  if (!("IntersectionObserver" in window)) {
    nodes.forEach(function (el) { el.classList.add("show"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        var sibs = [].slice.call(el.parentNode.children).filter(function (c) { return c.classList.contains("reveal"); });
        el.style.transitionDelay = (Math.min(sibs.indexOf(el), 5) * 70) + "ms";
        el.classList.add("show");
        if (!reduce && el.matches && el.matches(".section > h2, .blog-head h1, .article-head h1")) scrambleEl(el);
        io.unobserve(el);
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -6% 0px" });
    nodes.forEach(function (el) { io.observe(el); });
  }

  /* ---- live hero demo (landing page only) ---- */
  heroDemo();
  async function heroDemo() {
    var mock = byId("heroMock");
    if (!mock) return;
    var typeEl = byId("heroType"), picker = byId("heroPicker"), query = byId("heroQuery");
    var rows = [].slice.call(mock.querySelectorAll(".picker-row"));
    var data = [
      { q: "reschedule", idx: 0, text: "Hi Alex, something's come up and I need to reschedule our meeting. Could we move it to a time that works better for you?" },
      { q: "thanks",     idx: 1, text: "Hi Alex, thanks so much for applying. We've received your application and will be in touch about next steps soon." },
      { q: "follow up",  idx: 2, text: "Hi Alex, just following up on my note below — happy to answer any questions. Looking forward to hearing from you." }
    ];
    function select(i) { rows.forEach(function (r, j) { r.classList.toggle("sel", i === j); }); }
    function type(el, txt, sp) {
      return new Promise(function (res) {
        var k = 0;
        (function step() { if (k <= txt.length) { el.textContent = txt.slice(0, k++); setTimeout(step, sp); } else res(); })();
      });
    }
    if (reduce) { select(0); typeEl.textContent = data[0].text; return; }

    var n = 0;
    /* eslint-disable no-constant-condition */
    while (true) {
      if (document.hidden) { await sleep(700); continue; }   // pause when tab not visible
      var d = data[n % data.length];
      picker.classList.remove("gone");
      query.textContent = "Search templates…"; query.classList.add("ph");
      typeEl.textContent = "";
      await sleep(750);
      query.classList.remove("ph");
      await type(query, d.q, 95);     // type a search
      select(d.idx);                  // highlight the match
      await sleep(720);
      picker.classList.add("gone");   // "Enter" → insert
      await sleep(340);
      await type(typeEl, d.text, 22); // template types into the compose box
      await sleep(2500);
      n++;
    }
  }

  /* ============ PEAK: live playground · ⌘K palette · hero tilt ============ */
  var TEMPLATES = [
    { t: "Meeting reschedule", s: "Move a call to a new time", body: "Hi {first_name}, something's come up and I need to reschedule our meeting. Could we move it to a time that works better for you? Apologies for the short notice." },
    { t: "Thanks for applying", s: "Acknowledge an application", body: "Hi {first_name}, thanks for applying to {company}. We've received your application and will be in touch about next steps soon." },
    { t: "Quick follow-up", s: "Bump a previous note", body: "Hi {first_name}, just following up on my note below — happy to answer any questions. Looking forward to hearing from you." },
    { t: "Intro / first touch", s: "Open a conversation", body: "Hi {first_name}, great connecting earlier. Wanted to drop a quick line about {company} — would love to find time to chat." },
    { t: "Polite decline", s: "Say no, kindly", body: "Hi {first_name}, thanks so much for thinking of us. It's not the right fit right now, but I really appreciate you reaching out." },
    { t: "Schedule a call", s: "Share your availability", body: "Hi {first_name}, here are a few times that work this week — happy to grab 20 minutes whenever suits you best." }
  ];

  tryPlayground();
  cmdPalette();
  heroTilt();
  spotlightCards();
  tocSpy();
  copyTemplates();
  varCycle();
  magnetic();
  smoothFaq();
  specSheet();
  timeCalc();
  articleFx();

  function esc(s){ return s.replace(/[&<>]/g, function(c){ return { "&":"&amp;","<":"&lt;",">":"&gt;" }[c]; }); }

  function tryPlayground(){
    [].forEach.call(document.querySelectorAll(".try-compose"), initPlayground);
  }
  function initPlayground(root){
    var body = root.querySelector(".tc-body"), picker = root.querySelector(".try-picker"),
        search = root.querySelector(".tp-search"), list = root.querySelector(".tp-list"),
        insertBtn = root.querySelector(".tc-actions .btn"), status = root.querySelector(".tc-status");
    if (!body || !picker || !search || !list) return;
    var wrap = root.closest(".try-wrap") || root.parentNode;
    var nameI = wrap.querySelector(".tv-name"), coI = wrap.querySelector(".tv-co");
    var idx = 0, filtered = TEMPLATES.slice(), savedRange = null;

    function open(){ saveCaret(); picker.hidden = false; search.value = ""; renderRows(TEMPLATES); idx = 0; hl();
      setTimeout(function(){ search.focus(); }, 0); }
    function close(){ picker.hidden = true; body.focus(); restoreCaret(); }
    function renderRows(items){
      filtered = items; list.innerHTML = "";
      items.forEach(function(tp, i){
        var li = document.createElement("li");
        li.innerHTML = "<b></b><small></small>";
        li.querySelector("b").textContent = tp.t; li.querySelector("small").textContent = tp.s;
        li.addEventListener("mousemove", function(){ idx = i; hl(); });
        li.addEventListener("mousedown", function(e){ e.preventDefault(); choose(i); });
        list.appendChild(li);
      });
      if (!items.length){ var li = document.createElement("li"); li.innerHTML = "<small>No matches</small>"; list.appendChild(li); }
    }
    function hl(){ [].forEach.call(list.children, function(li, i){ li.classList.toggle("sel", i === idx); });
      var el = list.children[idx]; if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" }); }
    function filter(q){ q = q.trim().toLowerCase();
      var items = !q ? TEMPLATES : TEMPLATES.filter(function(tp){ return (tp.t + " " + tp.body).toLowerCase().indexOf(q) >= 0; });
      idx = 0; renderRows(items); }
    function choose(i){ var tp = filtered[i]; if (!tp) return; insertTpl(tp.body); close();
      if (status){ status.textContent = "Inserted ✓"; setTimeout(function(){ status.textContent = ""; }, 1700); }
      var br = body.getBoundingClientRect(); burst(br.left + br.width / 2, br.top + 28); }
    function tokenHTML(text){
      return esc(text)
        .replace(/\{first_name\}/g, '<span class="vtok" data-var="first_name"></span>')
        .replace(/\{company\}/g, '<span class="vtok" data-var="company"></span>');
    }
    function insertTpl(text){
      body.focus();
      var wrap = document.createElement("span"); wrap.className = "flash";
      wrap.appendChild(document.createRange().createContextualFragment(tokenHTML(text)));
      var sel = window.getSelection(), range;
      if (savedRange) range = savedRange;
      else if (sel.rangeCount && body.contains(sel.anchorNode)) range = sel.getRangeAt(0);
      else { range = document.createRange(); range.selectNodeContents(body); range.collapse(false); }
      range.deleteContents(); range.insertNode(wrap);
      range.setStartAfter(wrap); range.collapse(true);
      sel.removeAllRanges(); sel.addRange(range); savedRange = range.cloneRange();
      syncVars();
    }
    function syncVars(){
      var name = ((nameI && nameI.value) || "").trim(), co = ((coI && coI.value) || "").trim();
      [].forEach.call(body.querySelectorAll(".vtok"), function(sp){
        var k = sp.getAttribute("data-var"), val = k === "first_name" ? name : co;
        sp.textContent = val || ("{" + k + "}"); sp.classList.toggle("filled", !!val);
      });
    }
    function saveCaret(){ var sel = window.getSelection(); if (sel.rangeCount && body.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange(); }
    function restoreCaret(){ if (savedRange){ var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(savedRange); } }

    if (insertBtn) insertBtn.addEventListener("click", function(){ picker.hidden ? open() : close(); });
    body.addEventListener("keydown", function(e){
      if (e.altKey && (e.key === "a" || e.key === "A" || e.code === "KeyA")){ e.preventDefault(); open(); }
    });
    body.addEventListener("mouseup", saveCaret);
    body.addEventListener("keyup", saveCaret);
    search.addEventListener("input", function(){ filter(search.value); });
    search.addEventListener("keydown", function(e){
      if (e.key === "ArrowDown"){ e.preventDefault(); idx = Math.min(idx + 1, filtered.length - 1); hl(); }
      else if (e.key === "ArrowUp"){ e.preventDefault(); idx = Math.max(idx - 1, 0); hl(); }
      else if (e.key === "Enter"){ e.preventDefault(); choose(idx); }
      else if (e.key === "Escape"){ e.preventDefault(); close(); }
    });
    if (nameI) nameI.addEventListener("input", syncVars);
    if (coI) coI.addEventListener("input", syncVars);
    document.addEventListener("mousedown", function(e){
      if (!picker.hidden && !root.contains(e.target)) close();
    });
  }

  function cmdPalette(){
    var inBlog = location.pathname.indexOf("/blog/") >= 0, pre = inBlog ? "../" : "";
    var CWS = "https://chromewebstore.google.com/detail/email-templates-canned-re/amhocmgofedeoapkokhjpiklnphpafcl";
    var cmds = [
      { i: "↓", t: "Add to Chrome — Free", s: "Install the extension", run: function(){ window.open(CWS, "_blank", "noopener"); } },
      { i: "▸", t: "Try the live demo", s: "Use it on this page", run: function(){ go(pre + "index.html#try"); } },
      { i: "✦", t: "Features", s: "What it does", run: function(){ go(pre + "index.html#features"); } },
      { i: "✎", t: "Read the blog", s: "Guides & tips", run: function(){ go(pre + "blog/index.html"); } },
      { i: "?", t: "FAQ", s: "Common questions", run: function(){ go(pre + "index.html#faq"); } },
      { i: "◆", t: "Privacy", s: "How your data is handled", run: function(){ go(pre + "privacy.html"); } },
      { i: "⌂", t: "Home", s: "Back to the top", run: function(){ go(pre + "index.html"); } }
    ];
    function go(url){
      close();
      var h = url.indexOf("#");
      if (h >= 0){
        var base = url.slice(0, h) || "index.html", id = url.slice(h + 1);
        var cur = location.pathname.split("/").pop() || "index.html";
        if (base === cur){ var el = document.getElementById(id); if (el){ el.scrollIntoView({ behavior: "smooth" }); return; } }
      }
      location.href = url;
    }
    var ov = document.createElement("div"); ov.className = "cmdk-overlay"; ov.hidden = true;
    ov.innerHTML = '<div class="cmdk"><input class="cmdk-input" placeholder="Type a command…  (try “demo”)" autocomplete="off"><ul class="cmdk-list"></ul><div class="cmdk-foot"><span>↑↓ navigate</span><span>↵ select</span><span>esc close</span></div></div>';
    document.body.appendChild(ov);
    var input = ov.querySelector(".cmdk-input"), list = ov.querySelector(".cmdk-list");
    var idx = 0, filt = cmds.slice();
    function render(items){
      filt = items; list.innerHTML = "";
      items.forEach(function(c, i){
        var li = document.createElement("li");
        li.innerHTML = '<span class="ci"></span><span><b></b><small></small></span>';
        li.querySelector(".ci").textContent = c.i; li.querySelector("b").textContent = c.t; li.querySelector("small").textContent = c.s;
        li.addEventListener("mousemove", function(){ idx = i; hl(); });
        li.addEventListener("click", function(){ c.run(); });
        list.appendChild(li);
      });
      hl();
    }
    function hl(){ [].forEach.call(list.children, function(li, i){ li.classList.toggle("sel", i === idx); }); }
    function filter(q){ q = q.trim().toLowerCase();
      var items = !q ? cmds : cmds.filter(function(c){ return (c.t + " " + c.s).toLowerCase().indexOf(q) >= 0; });
      idx = 0; render(items); }
    function open(){ ov.hidden = false; input.value = ""; render(cmds); idx = 0; setTimeout(function(){ input.focus(); }, 0); }
    function close(){ ov.hidden = true; }
    input.addEventListener("input", function(){ filter(input.value); });
    input.addEventListener("keydown", function(e){
      if (e.key === "ArrowDown"){ e.preventDefault(); idx = Math.min(idx + 1, filt.length - 1); hl(); }
      else if (e.key === "ArrowUp"){ e.preventDefault(); idx = Math.max(idx - 1, 0); hl(); }
      else if (e.key === "Enter"){ e.preventDefault(); if (filt[idx]) filt[idx].run(); }
      else if (e.key === "Escape"){ e.preventDefault(); close(); }
    });
    ov.addEventListener("mousedown", function(e){ if (e.target === ov) close(); });
    document.addEventListener("keydown", function(e){
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")){ e.preventDefault(); ov.hidden ? open() : close(); }
    });
    var hint = document.createElement("button"); hint.className = "cmdk-hint"; hint.type = "button";
    hint.innerHTML = "<kbd>⌘</kbd><kbd>K</kbd> Quick nav";
    hint.addEventListener("click", open);
    document.body.appendChild(hint);
  }

  function heroTilt(){
    if (reduce) return;
    var vis = document.querySelector(".hero-visual"), mock = byId("heroMock");
    if (!vis || !mock) return;
    vis.addEventListener("mousemove", function(e){
      var r = vis.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      mock.style.transform = "rotateY(" + (px * 7) + "deg) rotateX(" + (-py * 7) + "deg)";
    });
    vis.addEventListener("mouseleave", function(){ mock.style.transform = ""; });
  }

  function spotlightCards(){
    var cards = document.querySelectorAll(".feature, .post-card");
    if (!cards.length) return;
    [].forEach.call(cards, function(card){
      var amt = card.classList.contains("featured") ? 3 : 5.5;   // gentler tilt on the wide featured card
      card.addEventListener("mousemove", function(e){
        var r = card.getBoundingClientRect();
        var x = e.clientX - r.left, y = e.clientY - r.top;
        card.style.setProperty("--mx", x + "px");
        card.style.setProperty("--my", y + "px");
        if (reduce) return;
        var px = x / r.width - 0.5, py = y / r.height - 0.5;
        card.style.transform = "rotateY(" + (px * amt) + "deg) rotateX(" + (-py * amt) + "deg) translateY(-4px)";
      });
      card.addEventListener("mouseleave", function(){ card.style.transform = ""; });
    });
  }

  /* scroll-spy: highlight the table-of-contents entry you're reading */
  function tocSpy(){
    var links = document.querySelectorAll('.toc a[href^="#"]');
    if (!links.length) return;
    var items = [];
    [].forEach.call(links, function(a){
      var el = document.getElementById(a.getAttribute("href").slice(1));
      if (el) items.push({ a: a, el: el });
    });
    function onScroll(){
      var y = (window.scrollY || window.pageYOffset) + 130, cur = items[0];
      items.forEach(function(m){ if (m.el.getBoundingClientRect().top + window.scrollY <= y) cur = m; });
      [].forEach.call(links, function(a){ a.classList.remove("active"); });
      if (cur) cur.a.classList.add("active");
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* one-click copy for any list marked .copy-list */
  function copyTemplates(){
    var lis = document.querySelectorAll(".copy-list li");
    if (!lis.length) return;
    function quote(li){ var t = li.textContent || ""; var m = t.match(/[“"]([^”"]+)[”"]/); return (m ? m[1] : t).trim(); }
    function copy(t){
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
      return new Promise(function(res){ var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); res(); });
    }
    [].forEach.call(lis, function(li){
      var btn = document.createElement("button");
      btn.type = "button"; btn.className = "copy-btn"; btn.textContent = "Copy";
      btn.addEventListener("click", function(){
        copy(quote(li)).then(function(){
          btn.textContent = "Copied!"; btn.classList.add("done");
          var r = btn.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2);
          setTimeout(function(){ btn.textContent = "Copy"; btn.classList.remove("done"); }, 1400);
        });
      });
      li.appendChild(btn);
    });
  }

  /* live-cycling variables in the article "variables" figure */
  function varCycle(){
    var name = byId("vbName"), co = byId("vbCo");
    if (!name || !co) return;
    if (reduce){ name.textContent = "Alex"; name.classList.add("val"); co.textContent = "Acme"; co.classList.add("val"); return; }
    var names = ["{first_name}", "Alex", "Sam", "Priya", "Jordan", "Maya"];
    var cos = ["{company}", "Acme", "Globex", "Umbrella", "Initech", "Hooli"];
    var i = 0;
    function setChip(el, val){
      el.classList.remove("flip"); void el.offsetWidth; el.classList.add("flip");
      setTimeout(function(){ el.textContent = val; el.classList.toggle("val", val.charAt(0) !== "{"); }, 200);
    }
    function tick(){ setChip(name, names[i % names.length]); setChip(co, cos[i % cos.length]); i++; }
    tick();
    setInterval(tick, 2000);
  }

  /* a heading that "decodes" into place — called once from the reveal observer */
  function scrambleEl(el){
    if (el.getAttribute("data-scrambled")) return;
    el.setAttribute("data-scrambled", "1");
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%&*<>/?";
    var html = el.innerHTML, text = el.textContent, len = text.length;
    var ends = [];
    for (var i = 0; i < len; i++) ends.push(6 + Math.floor(Math.random() * (len + 8)));
    el.style.minHeight = el.offsetHeight + "px";
    var frame = 0;
    var id = setInterval(function(){
      var out = "", done = 0;
      for (var j = 0; j < len; j++){
        var c = text[j];
        if (c === " " || c === "\n"){ out += c; done++; }
        else if (frame >= ends[j]){ out += c; done++; }
        else out += chars[Math.floor(Math.random() * chars.length)];
      }
      el.textContent = out; frame++;
      if (done === len){ clearInterval(id); el.innerHTML = html; el.style.minHeight = ""; }
    }, 30);
  }

  /* magnetic buttons — they lean toward the cursor */
  function magnetic(){
    if (reduce) return;
    [].forEach.call(document.querySelectorAll(".btn.primary, .magnetic"), function(el){
      el.classList.add("magnetic");
      el.addEventListener("mousemove", function(e){
        var r = el.getBoundingClientRect();
        var x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
        el.style.transform = "translate(" + (x * 0.4) + "px," + (y * 0.45) + "px)";
      });
      el.addEventListener("mouseleave", function(){ el.style.transform = ""; });
    });
  }

  /* a small celebratory burst at (x,y) */
  function burst(x, y){
    if (reduce) return;
    var colors = ["#2f5bff", "#7c3aed", "#0d9488", "#f5a623", "#e11d48"];
    for (var i = 0; i < 16; i++){
      var p = document.createElement("div");
      p.className = "cfx";
      p.style.background = colors[i % colors.length];
      p.style.left = x + "px"; p.style.top = y + "px";
      document.body.appendChild(p);
      var ang = Math.random() * Math.PI * 2, dist = 45 + Math.random() * 80;
      var dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 50;
      var a = p.animate([
        { transform: "translate(0,0) rotate(0) scale(1)", opacity: 1 },
        { transform: "translate(" + dx + "px," + (dy + 110) + "px) rotate(" + (Math.random() * 540) + "deg) scale(.5)", opacity: 0 }
      ], { duration: 750 + Math.random() * 450, easing: "cubic-bezier(.2,.7,.3,1)" });
      a.onfinish = function(){ this.effect.target.remove(); };
    }
  }

  /* buttery-smooth FAQ accordion */
  function smoothFaq(){
    [].forEach.call(document.querySelectorAll(".faq details"), function(d){
      var sum = d.querySelector("summary"), ans = sum && sum.nextElementSibling;
      if (!sum || !ans) return;
      sum.addEventListener("click", function(e){
        if (reduce){ return; }
        e.preventDefault();
        if (d.open){
          var h = ans.scrollHeight; ans.style.overflow = "hidden";
          var a = ans.animate([{ height: h + "px" }, { height: "0px" }], { duration: 260, easing: "ease" });
          a.onfinish = function(){ d.open = false; ans.style.overflow = ""; ans.style.height = ""; };
        } else {
          d.open = true;
          var h2 = ans.scrollHeight; ans.style.overflow = "hidden";
          ans.animate([{ height: "0px" }, { height: h2 + "px" }], { duration: 320, easing: "cubic-bezier(.2,.7,.2,1)" })
            .onfinish = function(){ ans.style.overflow = ""; ans.style.height = ""; };
        }
      });
    });
  }

  /* THE SPEC SHEET — draw-on-reveal rules, count-up numerals, keyboard inspect */
  function pad2(n){ n = n || 0; return (n < 10 ? "0" : "") + n; }
  function countUp(el, n){
    if (reduce || isNaN(n)){ el.textContent = pad2(n); return; }
    var start = null;
    function step(ts){
      if (start === null) start = ts;
      var p = Math.min((ts - start) / 520, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = pad2(Math.round(e * n));
      if (p < 1) requestAnimationFrame(step); else el.textContent = pad2(n);
    }
    requestAnimationFrame(step);
  }
  function specSheet(){
    var drawables = [].slice.call(document.querySelectorAll(".ledger .lrow, .toc-lead, .toc .tocrow"));
    function activate(el){
      if (el.getAttribute("data-on")) return;
      el.setAttribute("data-on", "1");
      el.classList.add("drawn");
      var num = el.querySelector(".lnum");
      if (num) countUp(num, parseInt(num.getAttribute("data-n"), 10));
      var cap = el.querySelector(".lcap");
      if (cap && !reduce) setTimeout(function(){ scrambleEl(cap); }, 220);
    }
    if (reduce || !("IntersectionObserver" in window)) {
      drawables.forEach(activate);
    } else {
      var io = new IntersectionObserver(function(es){
        es.forEach(function(en){ if (en.isIntersecting){ activate(en.target); io.unobserve(en.target); } });
      }, { threshold: 0.3, rootMargin: "0px 0px -8% 0px" });
      drawables.forEach(function(el){ io.observe(el); });
    }

    // keyboard "inspect" on the features ledger (mirrors the app picker)
    var ledger = document.querySelector(".ledger");
    if (!ledger) return;
    var rows = [].slice.call(ledger.querySelectorAll(".lrow"));
    var idx = -1;
    function setActive(i){
      rows.forEach(function(r, j){ r.classList.toggle("active", i === j); });
      idx = i; if (rows[i]) rows[i].scrollIntoView({ block: "nearest" });
    }
    function pressRow(r){
      var kc = r.querySelector(".kc");
      if (kc && !reduce){ kc.classList.remove("press"); void kc.offsetWidth; kc.classList.add("press"); }
      if (!reduce){ var b = r.getBoundingClientRect(); burst(b.left + Math.min(b.width * 0.72, b.width - 40), b.top + b.height / 2); }
    }
    ledger.addEventListener("keydown", function(e){
      if (e.key === "ArrowDown"){ e.preventDefault(); setActive(Math.min(idx + 1, rows.length - 1)); }
      else if (e.key === "ArrowUp"){ e.preventDefault(); setActive(idx <= 0 ? 0 : idx - 1); }
      else if (e.key === "Enter" && rows[idx]){ e.preventDefault(); pressRow(rows[idx]); }
    });
    rows.forEach(function(r){ r.addEventListener("click", function(){ setActive(rows.indexOf(r)); pressRow(r); }); });
  }

  /* interactive "time saved" calculator */
  function timeCalc(){
    var range = byId("calcRange"); if (!range) return;
    var nEl = byId("calcN"), hrsEl = byId("calcHrs"), daysEl = byId("calcDays"), bar = byId("calcBar");
    function tween(el, target, dec){
      if (reduce){ el.textContent = target.toFixed(dec); return; }
      var from = parseFloat(el.textContent) || 0, start = null;
      function step(ts){
        if (start === null) start = ts;
        var p = Math.min((ts - start) / 360, 1), e = 1 - Math.pow(1 - p, 3);
        el.textContent = (from + (target - from) * e).toFixed(dec);
        if (p < 1) requestAnimationFrame(step); else el.textContent = target.toFixed(dec);
      }
      requestAnimationFrame(step);
    }
    function render(animate){
      var v = +range.value;
      nEl.textContent = v;
      var perWeekHr = v * 50 / 60 * 5 / 60;     // ~50s saved per reply, 5 days/wk
      var perYearDays = perWeekHr * 52 / 8;      // 8-hour work-days
      if (animate){ tween(hrsEl, perWeekHr, 1); tween(daysEl, perYearDays, 0); }
      else { hrsEl.textContent = perWeekHr.toFixed(1); daysEl.textContent = perYearDays.toFixed(0); }
      bar.style.width = Math.min(100, (v / 120) * 100) + "%";
    }
    range.addEventListener("input", function(){ render(false); });
    render(false);
    if (!reduce && "IntersectionObserver" in window){
      var io = new IntersectionObserver(function(es){
        es.forEach(function(en){ if (en.isIntersecting){ render(true); io.disconnect(); } });
      }, { threshold: 0.4 });
      io.observe(range.closest(".calc"));
    }
  }

  /* article reading enhancements: rail · highlight sweep · stat counters · table */
  function articleFx(){
    var body = document.querySelector(".article-body");
    if (!body) return;

    // once-in-view helper
    function inView(els, cb, threshold){
      if (reduce || !("IntersectionObserver" in window)){ [].forEach.call(els, cb); return; }
      var io = new IntersectionObserver(function(es){
        es.forEach(function(en){ if (en.isIntersecting){ cb(en.target); io.unobserve(en.target); } });
      }, { threshold: threshold || 0.5, rootMargin: "0px 0px -8% 0px" });
      [].forEach.call(els, function(el){ io.observe(el); });
    }

    // highlighter sweep
    inView(document.querySelectorAll("mark.hl"), function(el){ el.classList.add("lit"); }, 0.9);

    // animated stat counters
    inView(document.querySelectorAll(".stat2 b[data-to]"), function(el){
      var to = parseFloat(el.getAttribute("data-to")) || 0;
      if (reduce){ el.textContent = String(to); return; }
      var start = null;
      (function step(ts){
        if (start === null) start = ts;
        var p = Math.min((ts - start) / 900, 1), e = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(to * e));
        if (p < 1) requestAnimationFrame(step); else el.textContent = String(to);
      })();
    }, 0.6);

    // comparison table reveal (marks pop + winner glow)
    inView(document.querySelectorAll(".ctable"), function(el){ el.classList.add("lit"); }, 0.25);

    // sticky reading rail built from the section headings
    var heads = [].slice.call(body.querySelectorAll("h2[id]"));
    if (!heads.length) return;
    var rail = document.createElement("nav");
    rail.className = "reading-rail";
    rail.setAttribute("aria-hidden", "true");
    heads.forEach(function(h){
      var a = document.createElement("a");
      a.href = "#" + h.id;
      var label = (h.textContent || "").replace(/§\s*\d+\s*/, "").trim();
      a.innerHTML = "<span></span>";
      a.querySelector("span").textContent = label;
      a.addEventListener("click", function(e){ e.preventDefault(); h.scrollIntoView({ behavior: "smooth", block: "start" }); });
      rail.appendChild(a);
    });
    document.body.appendChild(rail);
    var dots = [].slice.call(rail.children);
    var article = document.querySelector(".article");
    function onScroll(){
      var r = article.getBoundingClientRect();
      rail.classList.toggle("on", r.top < window.innerHeight * 0.5 && r.bottom > window.innerHeight * 0.4);
      var y = window.scrollY + 140, cur = 0;
      heads.forEach(function(h, i){ if (h.getBoundingClientRect().top + window.scrollY <= y) cur = i; });
      dots.forEach(function(d, i){ d.classList.toggle("done", i < cur); d.classList.toggle("active", i === cur); });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
})();

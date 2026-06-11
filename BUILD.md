# Canned Responses & Email Templates — Full Build / Handoff

> Hand this file to Claude to continue the project. It captures the whole build:
> architecture, every file, features, monetization, security, gotchas, and what's left.

---

## 1. What it is
A **Manifest V3 Chrome extension**: keyboard-first **email templates / canned responses** with
reliable rich-text insertion in **Gmail + LinkedIn**. Local-first, no account. Ships with a
**marketing website** and a **Buy-Me-a-Coffee donation** model.

**Current monetization stance:** EVERYTHING is free (beta) to drive adoption + feedback; donations
now; a clawback-safe paywall is **pre-wired** for later (see §5).

---

## 2. Architecture
- **Buildless** (no bundler/deps). All modules attach to a shared **`globalThis.CR`** namespace and
  load as plain scripts — works in content scripts (ordered `js[]` array), the service worker
  (`importScripts`), and extension pages (`<script>`). Unobfuscated → simple Web Store review.
- **The moat = `core/inserter.js`** — UI-agnostic; operates ONLY on the focused editable via the
  **Selection/Range API**, never on Gmail/LinkedIn DOM structure. This is why Gmail redesigns can't
  break insertion.
- Thin **surface adapters** (`content/surfaces/*.js`) hold the only site-specific glue (the injected
  buttons), isolated and **non-load-bearing**: if they break, Alt+A still works.

---

## 3. File map
```
manifest.json            MV3; permissions: storage, contextMenus; host: mail.google.com + www.linkedin.com;
                         command Alt+A; action(popup); options_ui(open_in_tab); icons
icons/                   icon16/32/48/128.png  (generated)
tools/generate-icons.js  dev tool: zlib PNG encoder (no deps) → blue rounded-square + white bubble

background/
  service-worker.js      stateless: on install seed 3 samples + open welcome tab; run migrations;
                         relay chrome.commands(Alt+A)->OPEN_PICKER; OPEN_OPTIONS; context menu "Save selection"

core/  (shared; globalThis.CR)
  sanitize.js            HTML allowlist. FREE mode = text + formatting; PRO mode (opts.images) = + tables/
                         <img>/background images. DROPS script/style/iframe/object/embed/svg/etc. Strips
                         event handlers; validates href (https/mailto/tel) + img src (https/data:image);
                         filters inline CSS to a safe set (blocks expression/javascript:/unsafe url()).
                         detectMedia(html) flags images/tables (for the upsell).
  model.js               Template schema {id(uuid), title, shortcut, body(HTML), folderId, tags, favorite,
                         sortIndex, createdAt, updatedAt, deletedAt}. defaultSettings (hotkey Alt+A, plan free,
                         theme system, backup fields, earlyAccess:true). sampleTemplates. migrate() runner (SCHEMA_VERSION=1).
  store.js               chrome.storage.local blob "cr.db" + in-memory cache. CRUD; getAll()=favorites-first;
                         soft-delete; reorder; updateSettings; subscribe (onChanged live sync); 150-cap chokepoint
                         in create/bulkInsert; atLimit/templateLimit/count; try/catch ctx-invalidation guards.
  entitlements.js        SINGLE source of truth: plan()/can(feature)/getLimit(name). PLANS free/pro/team.
                         BETA_ALL_FREE=true -> can()=true + getLimit=Infinity for everyone. earlyAccess() grandfathering.
  theme.js               resolve("system"|"light"|"dark") -> "light"/"dark"; applyToDocument (sets <html data-theme>).
  inserter.js            captureContext() (deep activeElement, shadow DOM, CLONED Range BEFORE focus loss);
                         insert(ctx,html,opts): CE via Range+DocumentFragment + dispatch input inputType:"insertText"
                         (NEVER insertFromPaste); inputs via NATIVE value setter; preferPlainText degrade;
                         sanitizes with {images: entitlements.can('images')}.

content/  (per-frame, all_frames:true)
  surfaces/gmail.js      surface policy (rich ok) + TOP-BAR button (anchored to Support/Help/Settings aria-labels;
                         MutationObserver + setInterval(2s) self-heal; floating fallback cr-gmail-fab if anchor
                         not found) + per-message "Copy email" button in the Reply/Forward row (inlines computed
                         styles onto a clone, execCommand copy -> full HTML/CSS/images to clipboard). Toast w/ "Open editor".
  surfaces/linkedin.js   surface policy (degrade->plain) + nav "Templates" button (anchored to /notifications|/messaging
                         href; self-heal interval). Click -> manage panel.
  picker.js              Alt+A command palette (Shadow DOM): search, up/down/enter/esc, per-row edit/delete,
                         "+ New template", draggable + remembered pos (settings.pickerPos), non-modal, .cr-dark theme,
                         inline variable fill (also reused by expander via NS.picker.fill).
  manager.js             in-page manage panel (Shadow DOM): list+search, add/edit/delete/favorite, PLAIN-text editor +
                         variable chips + shortcut field, "Full editor" link, draggable + remembered pos (settings.panelPos),
                         non-modal, cascades off the picker, .cr-dark theme, 150-cap inline notice (dormant).
  expander.js            abbreviation-expand: ";shortcut" + Tab -> finds template by shortcut -> inline fill via
                         picker.fill -> insert. "✓ Inserted" cue.
  capture.js             floating "Save as template" pill on text selection + right-click relay. Rich capture
                         (sanitize with {images: can('images')}); FREE strips images + toast "images are a Pro feature"
                         (dormant while BETA_ALL_FREE). Toast has "Edit" -> options focusTemplateId.
  content.js             orchestrator. Hotkey: Route 1 page keydown (parseHotkey from settings.hotkey) + Route 2
                         chrome.commands relay. NS.app {open/openPanel/newTemplate/editTemplate/openManager}. NS.ui.cue
                         ("✓ Inserted"/"✓ Copied"). Handles OPEN_PICKER + SAVE_SELECTION. alive() ctx-invalidation guards.

ui/
  options/  (full manager, opens in a tab)   two-pane list + RICH editor (B/I/U/strike, color, highlight, font,
            size, align, lists, link, +Variable; styleWithCSS; selection preserved across toolbar focus);
            drag-reorder; favorites; search; custom-hotkey RECORDER; Export/Import JSON; Theme toggle (System/Light/Dark);
            "X/150" count + cap handling (dormant); backup-nudge banner (>=12 templates, dismissible, weekly opt-in);
            "☕ Support" link. Dark mode via [data-theme].
  popup/    launcher: template list (favorites-first), click-to-COPY, Export backup, Manage, "☕ Buy me a coffee".
  welcome/  onboarding tab (opens on install): Alt+A tip, 4 feature cards, live starter-template list,
            Theme picker (System/Light/Dark) — but the welcome PAGE itself always stays LIGHT.

website/
  index.html   landing: hero + CSS picker mockup, eyebrow pill, 6 feature cards (custom line-icons in colored chips),
               Support section (Buy-Me-a-Coffee), FAQ + JSON-LD FAQPage schema. (Pricing section removed.)
  privacy.html CWS-ready privacy policy (local-only; never reads/transmits email; perms justified).
  styles.css   Plus Jakarta Sans (headings) + Inter (body) via @import; polished, responsive; coffee button.
  script.js    placeholders note only.

spike/         throwaway Phase-0 proof-of-concept (kept for reference; NOT production).
```

---

## 4. Features (all working)
- **Insertion (moat):** Alt+A picker -> search -> insert at caret. Gmail (new/reply/inline-reply, /u/0 & /u/1,
  survives Send + SPA nav) and LinkedIn (messaging/comments). "✓ Inserted" cue. Bold/links survive.
- **Abbreviation-expand:** `;shortcut` + Tab.
- **Variables:** `{first_name}` etc. with inline fill (picker + expander).
- **Capture:** selection pill + right-click "Save as template" (rich). **Copy email** button -> full HTML/CSS/images to clipboard.
- **Manage:** in-page panel + full options editor (rich toolbar); favorites-to-top; search; drag-reorder; export/import JSON; backup nudge.
- **Surfaces:** Gmail top-bar button + LinkedIn nav button (self-healing) + popup.
- **Custom hotkey** (default Alt+A). **Light/Dark/System theme** across all surfaces.
- **Onboarding** welcome tab with starter templates.

---

## 5. Monetization & data
- **Now:** `BETA_ALL_FREE = true` in entitlements.js -> every feature free (images, HTML-email templates, unlimited).
  Revenue = **Buy Me a Coffee** donations (links in website + popup + options; replace `yourhandle`).
- **Later, clawback-safe:** build NEW Pro features (cloud sync / team libraries / advanced variables) ->
  set `BETA_ALL_FREE=false` + set model `earlyAccess` default to `false`. Beta users (earlyAccess:true) are
  grandfathered (keep everything free); new users get Free vs Pro. The image upsell + 150-cap code is dormant
  scaffolding that re-activates automatically. NEVER paywall an existing free feature.
- **Data:** local `chrome.storage.local` only. Sync-ready model (UUID, timestamps, soft-delete, schemaVersion +
  migration runner) so v1.1 cloud sync is a transport layer, not a rewrite. No backend, no telemetry, no account.
- **Data safety:** Export/Import (surfaced in options + popup) + a gentle backup nudge. Uninstall clears local data
  (export to back up). storage.sync intentionally NOT used (quota + it's the paid hook).

---

## 6. Security
DROPs script/style/iframe/object/embed/svg/etc entirely; strips event handlers; validates URLs
(href https/mailto/tel, img src https/data:image, css url() https/data:image); filters inline CSS to a safe set;
context-invalidation hardened (orphaned content scripts fail silently). Dependency-free (no DOMPurify; could vendor later).

---

## 7. Key decisions / gotchas (already handled — don't regress)
- **`inputType:"insertText"`, NEVER `insertFromPaste`** — the latter trips Gmail's link-normalizer and rewrites anchor text.
- **Default hotkey `Alt+A`** — `Ctrl+J` is browser-reserved (Downloads) and page JS can't claim it.
- **Non-modal floating windows** — picker + manage panel coexist, cascade off each other, click-to-front (shared z-index). No blocking backdrop.
- **Self-healing injected buttons** — Gmail/LinkedIn re-render their headers; a 2s `setInterval` re-injects + Gmail has a floating fallback. Buttons are NON-LOAD-BEARING (Alt+A always works).
- **Dev workflow:** after reloading the unpacked extension you MUST refresh the Gmail/LinkedIn tab (orphaned content script otherwise — guarded to fail silently, but the new code only loads on refresh).
- **Gmail link display-text** can be rewritten by Chrome autofill in Gmail's link-editor popup — a known caveat; production fix = create links via execCommand("insertHTML") (not yet done).

---

## 8. Status & what's left
**DONE & verified on real accounts:** build, insertion, picker, both manage surfaces, popup, capture, copy-email,
themes, icons, onboarding, security hardening, data-safety, everything-free beta + grandfather scaffolding,
marketing website, privacy policy, donations.

**Remaining = submission admin only:**
1. **Chrome Web Store listing copy** (title, short + detailed description, screenshot captions, permission justifications).
2. **Screenshots / demo GIF** of the real extension (Alt+A insert, manager, picker).
3. **Fill placeholders:**
   - `data-cws` links -> your Chrome Web Store URL (after publishing).
   - `yourhandle` in Buy-Me-a-Coffee links -> your handle (website/index.html, ui/popup/popup.html, ui/options/options.html).
   - ~~`hello@example.com` -> your real email (website index/privacy).~~ DONE — set to boxai5115@gmail.com sitewide.
   - canonical/OG domain in website/index.html.
4. Final reliability pass on your Gmail/LinkedIn.

## 9. How to run / test
- **Load:** chrome://extensions -> Developer mode -> Load unpacked -> select the project ROOT (not `spike/`).
- **After any code change:** reload the extension (↻) AND refresh the Gmail/LinkedIn tab.
- **Welcome tab** only opens on a fresh install (remove + re-add to preview), or open `chrome-extension://<id>/ui/welcome/welcome.html`.
- **Website:** open `website/index.html` (fonts need internet; falls back to system fonts offline).
- **Syntax check:** `node --check <file.js>` (the whole codebase is plain JS; sanitize/inserter need a DOM, so only syntax-checkable in Node).

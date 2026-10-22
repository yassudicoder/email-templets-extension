# Canned Responses & Email Templates

A keyboard-first Chrome (MV3) extension for **Gmail** and **LinkedIn**: save reusable
templates / canned responses and insert any of them at your cursor in one keystroke.
Local-first, no account, free export.

- **Insert anywhere** — press `Alt+A` (rebindable) in any compose/reply, pick a template, it lands at the caret.
- **In-compose button** — a small button inside every Gmail compose window (popup, full-screen, inline reply).
- **`;shortcut`+Tab expander** and **`{variables}`** with inline fill.
- **Local-first store** over `chrome.storage.local`; optional accountless cross-device **sync**.
- **Free JSON export/import** from the options page and popup.
- **7 languages** (en, de, es, fr, hi, ja, pt-BR).

Your templates and messages never leave your device. Optional, anonymous, content-free
usage analytics are described in the [privacy policy](https://email-templets-extension.vercel.app/privacy).

## Develop

- Load unpacked: `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
- Locales are bundled for the in-app language picker: after editing any
  `_locales/<lang>/messages.json`, regenerate the bundle with
  `node tools/build-locales.js`.

## Changelog

### 0.7.0 — Gmail injection fix & upgrade
- **Fix (P0): our button no longer opens Google tools.** Every element we inject
  into Gmail (top-bar button, floating fallback, compose button, Copy pill) is now
  fully event-isolated — capture-phase `stopImmediatePropagation` across
  pointer/mouse/keyboard events — so a click can never reach Gmail's delegated
  handlers.
- **New: in-compose button** — the primary, locale-independent entry point.
  Detected purely via `div[contenteditable="true"][role="textbox"]`, so it appears
  in popup, full-screen, and inline-reply composes (and multiple at once). It sits
  inline in the compose **bottom action bar** alongside attach / link / emoji
  (falling back to a floating overlay on the card if the toolbar can't be located).
  Clicking it opens the picker targeting that compose's caret.
- **Demoted the top-bar button** — inserted as a sibling before the whole
  right-side icon cluster (never inside the Google-apps wrapper), and made opt-out
  via a new **"Show the button in Gmail's top bar"** setting (default on). The
  in-compose button and `Alt+A` are the durable entry points.
- **Locale-proofed text anchors** — Reply/Forward matching and the header
  aria-label anchors now use per-locale word lists (bundled in `_locales`), matched
  case-insensitively against the union of all shipped languages, so they work
  outside English.

### 0.6.0
- Anonymous opt-out analytics, accountless cross-device sync, smart tokens, feedback fixes.

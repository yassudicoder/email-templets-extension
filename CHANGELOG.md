# Changelog

## 0.5.0 — 2026-06-15

### Added
- **In-app feedback** — a non-intrusive "💬 Feedback" button in the options header
  opens a form to report a bug or request an improvement without leaving the
  extension. Type + required message + optional reply email, with a visible,
  user-controlled diagnostics line (extension version, browser, OS, locale)
  attached only when the default-on "Include this info" box is checked. Submits
  straight to a form service (Web3Forms) — no backend, no new permissions, and
  nothing is sent unless you click Send. A secondary "email directly" mailto is
  always available as a fallback. Fully localized across all 7 languages.
- **Uninstall survey** — when the extension is removed, Chrome opens a short
  one-question "What made you uninstall?" page so churned users can tell us why.

### Privacy
- Updated the privacy policy with a "Feedback" section describing exactly what a
  feedback submission sends and that it is strictly user-initiated. No background
  telemetry; template and message content are never included.

### Notes
- The Web3Forms access key and the uninstall-survey URL are clearly-marked TODO
  constants in one place (`core/feedback-config.js`) — fill them in before
  publishing. Same file carries the reminder to update the Web Store "Data
  safety" disclosure (User-provided content + optional Email).

## 0.4.0 — 2026-06-11

### Added
- **Full internationalization (i18n)** via `chrome.i18n`. Every user-facing surface is
  now localized: the popup, the options page (category sidebar, template cards, rich
  editor, menus, dialogs, toasts), the in-page Alt+A picker and manage panel, the
  save-from-email flow, content-script cues/toasts, the right-click context menu, the
  injected Gmail/LinkedIn buttons, and the manifest name + description.
- **7 languages:** English, Spanish, Brazilian Portuguese, German, French, Hindi, Japanese.
  All strings live in `_locales/<lang>/messages.json` (192 keys) with proper placeholder
  substitution and `_one`/`_other` plural forms — no string concatenation.
- **In-app Language picker** (options header) to switch the display language at runtime,
  independent of the browser language. The choice is stored in settings and applied live
  across the popup, options page, and the in-page picker/manager. Because `chrome.i18n`
  can't be overridden per-extension, messages resolve from a bundled `core/locales.js`
  (auto-generated from `_locales/`); the default `"auto"` follows the browser.
- **Localized Chrome Web Store listing** (title ≤45, short description ≤132, and full
  description) for all 7 languages under `store-listing/<lang>/`.

### Changed
- Seeded category names are now **localized to the browser's language on first install**.
  Existing users' category names are user data and are never touched on update; the
  v1→v2 migration keeps the English defaults. Template content is never translated.

### Notes
- No new permissions. Everything stays local-first — `chrome.i18n` reads bundled
  `_locales/` only; there are no network calls or external translation services.

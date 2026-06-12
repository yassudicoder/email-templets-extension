# Changelog

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

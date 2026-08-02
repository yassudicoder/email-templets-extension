# Canned Responses — marketing site

Static site for the **Canned Responses** Chrome extension (email templates for
Gmail + LinkedIn). Plain HTML/CSS/JS — **no build step**; publish directory =
this folder.

## The landing page — "TYPE IT ONCE"

`index.html` is a single continuous experience about the absurdity of typing
the same email twice:

- **THE TYPIST** — a scroll-scrubbed sticky scene: the scroll wheel types a
  187-keystroke email (keystroke + time counters climbing), the same reply
  stacks up ×23, giant ALT+A keycaps press, the words collapse into a
  `;followup` chip, the picker opens, and the email re-inserts in 3 keypresses.
- **THE DESK** — a real interactive demo: the page listens for the actual
  **Alt+A** keypress (buttons as fallback), opens a working picker
  (search, ↑↓, ↵, Esc), inserts at the real caret, resolves `{first_name}` /
  `{company}` / `{date}` / `{time}` / `{day}` live, and expands a really-typed
  `;intro` + **Tab** in place — mirroring the extension's true behavior.
- Scripted vignettes: abbreviation expansion, the repetition wall
  (24 duplicate emails compress into 6 command cards), save-from-selection
  capture, Gmail ⇄ LinkedIn portability (rich vs plain-text, honestly), the
  local-first trust diagram, a features ledger, FAQ, and a finale where
  ALT+A morphs into the install key.

| Path | What |
|---|---|
| `index.html` | The landing experience |
| `once.css`, `once.js` | Its design system + behavior (self-contained, zero dependencies) |
| `fonts/` | Self-hosted woff2 — Fraunces + Inter (variable) + JetBrains Mono; Plus Jakarta Sans remains for legacy pages |
| `blog/` | Blog hub + 6 articles (legacy "field notes" system: `styles.css`, `spec-sheet.css`, `dark.css`, `creative.css`, `motion(.min).js`, `creative.js`, `theme.js`) |
| `privacy.html`, `404.html` | Legacy-styled standalone pages |
| `og/` | Open Graph covers (`cover.html` is the source for `cover.png`, render at 1200×630) |
| `analytics.js` | Site analytics — **off by default** (no key set → no requests) |
| `_redirects`, `_headers`, `vercel.json`, `robots.txt`, `sitemap.xml` | Hosting + SEO config |

All product claims in the landing copy were verified against the extension
source (picker/expander/capture behavior, variables, storage, permissions,
languages, analytics opt-out). Keep it that way when editing.

## Local preview

```bash
python -m http.server 8000
# open http://localhost:8000
```

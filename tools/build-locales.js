#!/usr/bin/env node
/* Regenerate core/locales.js from _locales/.
 *
 * The in-app Language picker can't use chrome.i18n (which only follows the browser
 * UI language and can't be overridden per-extension), so every locale is bundled
 * into globalThis.CR.LOCALES and resolved at runtime by core/i18n.js.
 *
 * Run this after editing ANY _locales/<lang>/messages.json:
 *   node tools/build-locales.js
 *
 * Output keeps only { message, placeholders? } per key (descriptions are dropped
 * to keep the bundle small) — exactly what core/i18n.js reads.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const locDir = path.join(root, "_locales");
const langs = fs.readdirSync(locDir)
  .filter((d) => fs.statSync(path.join(locDir, d)).isDirectory())
  .sort();

const out = {};
let firstLang = null, firstCount = null;
for (const lang of langs) {
  const msgs = JSON.parse(fs.readFileSync(path.join(locDir, lang, "messages.json"), "utf8"));
  const slim = {};
  for (const key of Object.keys(msgs)) {
    const e = msgs[key];
    slim[key] = e.placeholders ? { message: e.message, placeholders: e.placeholders } : { message: e.message };
  }
  out[lang] = slim;
  const n = Object.keys(slim).length;
  if (firstCount === null) { firstCount = n; firstLang = lang; }
  else if (n !== firstCount) console.warn(`! ${lang} has ${n} keys, but ${firstLang} has ${firstCount} — locales are out of sync`);
}

const code =
  "/* AUTO-GENERATED from _locales/ by tools/build-locales.js — do not edit by hand. */\n" +
  "globalThis.CR = globalThis.CR || {};\n" +
  "globalThis.CR.LOCALES = " + JSON.stringify(out) + ";\n";
fs.writeFileSync(path.join(root, "core", "locales.js"), code, "utf8");
console.log(`Wrote core/locales.js — ${langs.length} locales (${langs.join(", ")}), ${firstCount} keys each.`);

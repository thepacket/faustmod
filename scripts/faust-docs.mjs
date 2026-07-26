// Faust standard-library documentation, read out of the libfaust bundle.
//
// The .lib sources are packed verbatim inside
// node_modules/@grame/faustwasm/libfaust-wasm/libfaust-wasm.data, so the docs come
// from the exact compiler that builds our factories — they cannot drift out of sync,
// and there is no vendored copy to refresh. Same text as
// https://faustlibraries.grame.fr/libs/, which is generated from these comments.
//
// A documented entry looks like:
//
//   //----------`(os.)polyblep_saw`----------
//   // Sawtooth oscillator with suppressed aliasing (using `polyblep`).
//   //
//   // #### Usage
//   // ```
//   // polyblep_saw(freq) : _
//   // ```
//   // Where:
//   // * `freq`: frequency in Hz

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, "../node_modules/@grame/faustwasm/libfaust-wasm/libfaust-wasm.data");

/** Prefixes whose functions are plumbing rather than the point of a block. */
const HELPER_PREFIXES = new Set(["ma", "ba", "si", "ro", "it", "pl"]);

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/**
 * @returns {Map<string, {desc: string, usage: string, params: {name: string, text: string}[],
 *                        license?: string, lib?: string}>} keyed by "os.polyblep_saw"
 */
export function loadFaustDocs() {
  const blob = readFileSync(DATA, "latin1");

  // prefix -> library file, from stdfaust.lib (`os = library("oscillators.lib");`)
  const libOf = new Map();
  for (const m of blob.matchAll(/^\s*([a-z]{2,3})\s*=\s*library\("([^"]+)"\);/gm)) {
    if (!libOf.has(m[1])) libOf.set(m[1], m[2]);
  }

  // function -> declared license (`declare osc license "MIT-style STK-4.3 license";`)
  const licenseOf = new Map();
  for (const m of blob.matchAll(/declare\s+([A-Za-z_][A-Za-z0-9_]*)\s+license\s+"([^"]+)"/g)) {
    licenseOf.set(m[1], m[2]);
  }

  const docs = new Map();
  // A header names one function, or several that share a description:
  //   //---`(de.)fdelaylti` and `(de.)fdelayltv`---
  //   //---`(fi.)tf21`, `(fi.)tf22`, `(fi.)tf22t` and `(fi.)tf21t`---
  // Ten headers in the library are of the second kind; registering only the first
  // name leaves the siblings looking undocumented.
  // (A few headers put a space before the trailing dashes — `(ma.)unwrap` ------.)
  const header = /^\/\/-+(`\([a-z]{2,3}\.\)[A-Za-z_][A-Za-z0-9_]*`(?:[^\n`]*`\([a-z]{2,3}\.\)[A-Za-z_][A-Za-z0-9_]*`)*)\s*-+.*$/gm;
  for (const m of blob.matchAll(header)) {
    const names = [...m[1].matchAll(/`\(([a-z]{2,3})\.\)([A-Za-z_][A-Za-z0-9_]*)`/g)]
      .map((n) => [`${n[1]}.${n[2]}`, n[1], n[2]]);
    if (!names.length || names.every(([key]) => docs.has(key))) continue;

    // The comment block runs from the header to the first non-comment line.
    const body = [];
    for (const line of blob.slice(m.index + m[0].length).split("\n").slice(1)) {
      if (!line.startsWith("//")) break;
      body.push(line.replace(/^\/\/\s?/, ""));
      if (body.length > 120) break;
    }

    // Description: the prose before the first "####" section, minus the ``` fences.
    const descLines = [];
    for (const l of body) {
      if (/^####/.test(l) || /^-{4,}/.test(l)) break;
      if (l.trim()) descLines.push(l.trim());
    }

    // Usage: the fenced lines after "#### Usage" — one per function when a header
    // documents several, so each sibling can be given the line that names it.
    const usages = [];
    const uIdx = body.findIndex((l) => /^####\s*Usage/i.test(l));
    if (uIdx >= 0) {
      let inFence = false;
      for (const l of body.slice(uIdx + 1)) {
        if (/^```/.test(l)) {
          if (inFence) break;
          inFence = true;
          continue;
        }
        if (inFence && l.trim()) usages.push(l.trim());
      }
    }

    const params = [];
    for (const p of body.join("\n").matchAll(/^\* `([^`]+)`:?\s*(.*)$/gm)) {
      const text = p[2].trim();
      if (params.length < 12 && text) params.push({ name: p[1], text: clip(text, 110) });
    }

    for (const [key, prefix, name] of names) {
      if (docs.has(key)) continue;
      docs.set(key, {
        desc: clip(descLines.join(" "), 320),
        // A shared description usually shows one usage line per function; prefer the
        // one that names this function, and fall back to the first.
        usage: usages.find((u) => u.includes(name)) ?? usages[0] ?? "",
        params,
        license: licenseOf.get(name),
        lib: libOf.get(prefix),
      });
    }
  }
  return docs;
}

/** Every documented function a Faust expression calls, in order of appearance. */
export function functionsIn(body, docs) {
  const seen = [];
  for (const m of body.matchAll(/\b([a-z]{2,3})\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const key = `${m[1]}.${m[2]}`;
    if (docs.has(key) && !seen.includes(key)) seen.push(key);
  }
  return seen;
}

/**
 * The function a block is *about*. A body like `x * drive : aa.tanh1 * ma.PI` names two
 * documented functions; the block is about the saturator, not about pi — so helper
 * libraries only win when there is nothing else.
 */
export function primaryFunction(keys) {
  return keys.find((k) => !HELPER_PREFIXES.has(k.split(".")[0])) ?? keys[0];
}

/** The hover text for one block: what it does, how it is called, what its arguments mean. */
export function composeDoc(key, doc) {
  const out = [];
  if (doc.desc) out.push(doc.desc);
  if (doc.usage) out.push(`Usage: ${doc.usage}`);
  for (const p of doc.params) out.push(`  ${p.name}: ${p.text}`);
  out.push([key, doc.lib, doc.license].filter(Boolean).join(" · "));
  return out.join("\n");
}

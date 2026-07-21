// Build step: port the GRAME Faust example programs into FaustMod modules.
// Fetches each .dsp from the Faust repo (cached under .examples-cache/, gitignored),
// compiles it once with libfaust, and emits a WASM factory + metadata like the core
// catalog. Each example's Faust UI params (hslider/nentry/button…) become CONTROL
// INPUTS driving the worklet's AudioParams; its audio channels become signal ports.
//
// Nothing from the Faust repo is committed — the .dsp cache, the factories and
// src/generated/examples.json are all generated (gitignored), matching the core
// catalog's generated-not-committed posture. Run automatically by predev/prebuild.

import {
  instantiateFaustModuleFromFile,
  LibFaust,
  FaustCompiler,
  FaustMonoDspGenerator,
} from "@grame/faustwasm/dist/esm/index.js";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { mkdir, writeFile, readFile, stat, readdir } from "fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const factoryDir = resolve(root, "public/factories");
const genDir = resolve(root, "src/generated");
const cacheDir = resolve(root, ".examples-cache");
const outFile = resolve(genDir, "examples.json");

const REPO = "grame-cncm/faust";
const REF = "master-dev";
// Curated musical categories (sound-making); hardware/mobile/research dirs excluded.
const CATEGORIES = new Set([
  "filtering", "reverb", "delayEcho", "dynamic", "phasing", "physicalModeling",
  "generator", "spat", "ambisonics", "misc", "analysis", "quantizing",
  "pitchShifting", "psychoacoustic",
]);
const MAX_PARAMS = 24; // skip absurdly large control surfaces (e.g. the 64-param matrix)

const num = (v) => (typeof v === "number" ? v : parseFloat(v));
const unitOf = (it) => it.meta?.find?.((m) => "unit" in m)?.unit;

/** Pretty category label from a directory name: physicalModeling → "Physical Modeling". */
const prettyCat = (d) =>
  d.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/** Flatten the Faust UI tree into control-input specs (skip bargraphs = outputs). */
function flattenParams(items, out = []) {
  for (const it of items || []) {
    if (it.items) {
      flattenParams(it.items, out);
      continue;
    }
    const t = it.type;
    if (t === "hslider" || t === "vslider" || t === "nentry") {
      out.push({ label: it.label, paramPath: it.address, default: num(it.init), min: num(it.min), max: num(it.max), unit: unitOf(it) });
    } else if (t === "button" || t === "checkbox") {
      out.push({ label: it.label, paramPath: it.address, default: num(it.init) || 0, min: 0, max: 1 });
    }
  }
  return out;
}

function audioInputs(n) {
  if (n === 1) return [{ label: "in" }];
  if (n === 2) return [{ label: "L" }, { label: "R" }];
  return Array.from({ length: n }, (_, i) => ({ label: `in ${i}` }));
}
function audioOutputs(n) {
  if (n === 1) return [{ label: "out" }];
  if (n === 2) return [{ label: "L" }, { label: "R" }];
  return Array.from({ length: n }, (_, i) => ({ label: `out ${i}` }));
}

const sanitize = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
}

/** All example .dsp paths in the curated categories, via the recursive git tree. */
async function listExamplePaths() {
  const tree = JSON.parse(await fetchText(`https://api.github.com/repos/${REPO}/git/trees/${REF}?recursive=1`));
  if (!tree.tree) throw new Error("could not read repo tree (rate-limited?)");
  return tree.tree
    .map((t) => t.path)
    .filter((p) => p.startsWith("examples/") && p.endsWith(".dsp") && CATEGORIES.has(p.split("/")[1]));
}

/** Read a .dsp from the local cache, fetching + caching it on a miss. */
async function loadSource(path) {
  const cached = resolve(cacheDir, path);
  try {
    return await readFile(cached, "utf8");
  } catch {
    const src = await fetchText(`https://raw.githubusercontent.com/${REPO}/${REF}/${path}`);
    await mkdir(dirname(cached), { recursive: true });
    await writeFile(cached, src);
    return src;
  }
}

async function isFresh() {
  if (process.argv.includes("--force")) return false;
  try {
    const [out, scr, facs] = await Promise.all([
      stat(outFile),
      stat(resolve(here, "build-examples.mjs")),
      readdir(factoryDir).catch(() => []),
    ]);
    // Not fresh if the core catalog build wiped our factories (no ex-* files present).
    const haveFactories = facs.some((f) => f.startsWith("ex-") && f.endsWith(".wasm"));
    return haveFactories && out.mtimeMs >= scr.mtimeMs;
  } catch {
    return false;
  }
}

async function main() {
  if (await isFresh()) {
    console.log("✓ examples up to date (use --force to rebuild)");
    return;
  }
  await mkdir(factoryDir, { recursive: true });
  await mkdir(genDir, { recursive: true });

  let paths;
  try {
    paths = await listExamplePaths();
  } catch (err) {
    console.warn(`⚠ examples: ${err.message} — writing empty examples.json`);
    // Keep any existing file; only create an empty one if none exists yet.
    try {
      await stat(outFile);
    } catch {
      await writeFile(outFile, "[]");
    }
    return;
  }

  const jsPath = resolve(root, "node_modules/@grame/faustwasm/libfaust-wasm/libfaust-wasm.js");
  const compiler = new FaustCompiler(new LibFaust(await instantiateFaustModuleFromFile(jsPath)));

  const modules = [];
  const failures = [];
  let totalWasm = 0;

  for (const path of paths) {
    const rel = path.slice("examples/".length); // e.g. filtering/APF.dsp
    const cat = rel.split("/")[0];
    const id = `ex-${sanitize(rel.replace(/\.dsp$/, ""))}`;
    try {
      const src = await loadSource(path);
      const gen = new FaustMonoDspGenerator();
      const ok = await gen.compile(compiler, id, src, "");
      if (!ok) throw new Error("compile returned null");

      const meta = JSON.parse(gen.getJSON());
      if (meta.outputs < 1) throw new Error("no audio outputs");
      const params = flattenParams(meta.ui);
      if (params.length > MAX_PARAMS) throw new Error(`too many params (${params.length})`);

      const nameMatch = src.match(/declare\s+name\s+"([^"]+)"/);
      const title = (nameMatch ? nameMatch[1] : rel.split("/").pop().replace(/\.dsp$/, "")).trim();

      const wasm = gen.factory.code;
      totalWasm += wasm.length;
      await writeFile(resolve(factoryDir, `${id}.wasm`), Buffer.from(wasm));
      await writeFile(resolve(factoryDir, `${id}.json`), gen.getJSON());

      modules.push({
        id,
        title,
        category: prettyCat(cat),
        kind: "module",
        inputs: [
          ...audioInputs(meta.inputs),
          ...params.map((p) => ({
            label: p.label,
            paramPath: p.paramPath,
            ...(Number.isFinite(p.default) ? { default: p.default } : {}),
            ...(Number.isFinite(p.min) ? { min: p.min } : {}),
            ...(Number.isFinite(p.max) ? { max: p.max } : {}),
            ...(p.unit ? { unit: p.unit } : {}),
          })),
        ],
        outputs: audioOutputs(meta.outputs),
      });
    } catch (err) {
      failures.push({ id, error: String(err.message || err).split("\n")[0].slice(0, 90) });
    }
  }

  modules.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  await writeFile(outFile, JSON.stringify(modules, null, 0));

  console.log(`\n✓ ${modules.length} example modules compiled → factories + examples.json`);
  console.log(`  total wasm: ${(totalWasm / 1024).toFixed(0)} KB`);
  if (failures.length) {
    console.log(`\n✗ ${failures.length} pruned:`);
    for (const f of failures) console.log(`  - ${f.id}: ${f.error}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

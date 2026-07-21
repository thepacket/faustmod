// Build step: compile every candidate DSP block once with libfaust (in Node),
// emit a per-block WASM factory (public/factories/<id>.wasm + <id>.json) and a
// single metadata catalog (src/generated/catalog.json). Blocks that fail to
// compile — or whose real I/O count doesn't match the declared ports — are
// pruned, so the shipped catalog is always valid and needs no runtime compiler.

import {
  instantiateFaustModuleFromFile,
  LibFaust,
  FaustCompiler,
  FaustMonoDspGenerator,
} from "@grame/faustwasm/dist/esm/index.js";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { mkdir, writeFile, rm, stat, readdir } from "fs/promises";
import blocks from "./blocks.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const factoryDir = resolve(root, "public/factories");
const genDir = resolve(root, "src/generated");
const catalogFile = resolve(genDir, "catalog.json");

/** Skip the (slow) compile when outputs already exist and are newer than sources. */
async function isFresh() {
  if (process.argv.includes("--force")) return false;
  try {
    const [cat, blk, bld, facs] = await Promise.all([
      stat(catalogFile),
      stat(resolve(here, "blocks.mjs")),
      stat(resolve(here, "build-catalog.mjs")),
      readdir(factoryDir).catch(() => []),
    ]);
    return facs.length > 0 && cat.mtimeMs >= blk.mtimeMs && cat.mtimeMs >= bld.mtimeMs;
  } catch {
    return false;
  }
}

function outputsFor(n) {
  if (n === 1) return [{ label: "out" }];
  if (n === 2) return [{ label: "L" }, { label: "R" }];
  return Array.from({ length: n }, (_, i) => ({ label: `out ${i}` }));
}

function source(block) {
  const argList = block.args.map((a) => a.name).join(", ");
  const head = argList ? `process(${argList})` : "process";
  return `import("stdfaust.lib");\n${head} = ${block.body};`;
}

async function main() {
  if (await isFresh()) {
    console.log("✓ catalog up to date (use --force to rebuild)");
    return;
  }
  await rm(factoryDir, { recursive: true, force: true });
  await mkdir(factoryDir, { recursive: true });
  await mkdir(genDir, { recursive: true });

  const jsPath = resolve(root, "node_modules/@grame/faustwasm/libfaust-wasm/libfaust-wasm.js");
  const faustModule = await instantiateFaustModuleFromFile(jsPath);
  const compiler = new FaustCompiler(new LibFaust(faustModule));

  const catalog = [];
  const failures = [];
  let totalWasm = 0;

  for (const block of blocks) {
    const code = source(block);
    try {
      const gen = new FaustMonoDspGenerator();
      const ok = await gen.compile(compiler, block.id, code, "");
      if (!ok) throw new Error("compile returned null");

      const meta = JSON.parse(gen.getJSON());
      if (meta.inputs !== block.args.length) {
        throw new Error(`declared ${block.args.length} inputs, DSP has ${meta.inputs}`);
      }
      if (meta.outputs < 1) throw new Error("no outputs");

      const wasm = gen.factory.code; // Uint8Array
      totalWasm += wasm.length;
      await writeFile(resolve(factoryDir, `${block.id}.wasm`), Buffer.from(wasm));
      await writeFile(resolve(factoryDir, `${block.id}.json`), gen.getJSON());

      catalog.push({
        id: block.id,
        title: block.title,
        category: block.category,
        kind: "faust",
        inputs: block.args.map((a) => ({
          label: a.label,
          ...(a.default !== undefined ? { default: a.default } : {}),
          ...(a.min !== undefined ? { min: a.min } : {}),
          ...(a.max !== undefined ? { max: a.max } : {}),
          ...(a.unit ? { unit: a.unit } : {}),
        })),
        outputs: outputsFor(meta.outputs),
      });
    } catch (err) {
      failures.push({ id: block.id, error: String(err.message || err) });
    }
  }

  catalog.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  await writeFile(resolve(genDir, "catalog.json"), JSON.stringify(catalog, null, 0));

  console.log(`\n✓ ${catalog.length} blocks compiled → factories + catalog`);
  console.log(`  total wasm: ${(totalWasm / 1024).toFixed(0)} KB (avg ${(totalWasm / 1024 / (catalog.length || 1)).toFixed(1)} KB)`);
  if (failures.length) {
    console.log(`\n✗ ${failures.length} pruned:`);
    for (const f of failures) console.log(`  - ${f.id}: ${f.error}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

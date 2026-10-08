import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(root, "docs", "qa", "phase303-job-lock");
const phase302BaselinePath = path.join(root, "docs", "qa", "phase302-jobmark-correction", "production-source-before.json");
const snapshotRoot = path.join(root, "tmp", "phase303-baseline-source");
const phase302Baseline = JSON.parse(await readFile(phase302BaselinePath, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function ensureWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Path escaped its intended root: ${candidate}`);
  }
}

async function walkFiles(base, relative = "") {
  const absolute = path.join(base, relative);
  const result = [];
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    const child = path.posix.join(relative.replaceAll("\\", "/"), entry.name);
    if (entry.isDirectory()) result.push(...await walkFiles(base, child));
    else if (entry.isFile()) result.push(child);
    else if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in locked source tree: ${path.join(absolute, entry.name)}`);
  }
  return result;
}

async function inspectFile(filePath) {
  const info = await lstat(filePath);
  if (info.isSymbolicLink()) throw new Error(`Unexpected symlink in production lock scope: ${filePath}`);
  const bytes = await readFile(filePath);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

if (!Array.isArray(phase302Baseline.files) || phase302Baseline.files.length !== phase302Baseline.fileCount) {
  throw new Error("Phase302 source baseline is incomplete; cannot establish Phase303 source-before.");
}

const sourcePaths = (await walkFiles(path.join(snapshotRoot, "src"))).map((relative) => `src/${relative}`);
const publicPaths = (await walkFiles(path.join(root, "public"))).map((relative) => `public/${relative}`);
const licensePaths = (await walkFiles(path.join(root, "licenses"))).map((relative) => `licenses/${relative}`);
const configPaths = phase302Baseline.scope
  .filter((entry) => !entry.endsWith("/**"))
  .filter((entry) => entry !== "src" && entry !== "public" && entry !== "licenses");
const actualPaths = [...new Set([...sourcePaths, ...publicPaths, ...licensePaths, ...await Promise.all(configPaths)])].sort();
const phase302ByPath = new Map(phase302Baseline.files.map((entry) => [entry.path, entry]));
const entries = [];
for (const relative of actualPaths) {
  const sourceBase = relative.startsWith("src/") ? snapshotRoot : root;
  const sourcePath = path.resolve(sourceBase, ...relative.split("/"));
  const frozenPath = path.resolve(snapshotRoot, ...relative.split("/"));
  ensureWithin(sourceBase, sourcePath);
  ensureWithin(snapshotRoot, frozenPath);
  const actual = await inspectFile(sourcePath);
  if (!relative.startsWith("src/")) {
    await mkdir(path.dirname(frozenPath), { recursive: true });
    try {
      const frozenExisting = await inspectFile(frozenPath);
      if (frozenExisting.bytes !== actual.bytes || frozenExisting.sha256 !== actual.sha256) {
        throw new Error(`Existing Phase303 baseline copy differs from the captured public/config file: ${relative}`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await copyFile(sourcePath, frozenPath);
    }
  }
  const frozen = await inspectFile(frozenPath);
  if (frozen.bytes !== actual.bytes || frozen.sha256 !== actual.sha256) {
    throw new Error(`Phase303 baseline snapshot verification failed: ${relative}`);
  }
  entries.push({ path: relative, type: "file", bytes: frozen.bytes, sha256: frozen.sha256 });
}

const actualByPath = new Map(entries.map((entry) => [entry.path, entry]));
const missingFromPhase302 = phase302Baseline.files.filter((entry) => !actualByPath.has(entry.path)).map((entry) => entry.path);
const addedSincePhase302 = entries.filter((entry) => !phase302ByPath.has(entry.path)).map((entry) => entry.path);
const changedSincePhase302 = entries.filter((entry) => {
  const expected = phase302ByPath.get(entry.path);
  return expected && (entry.bytes !== expected.bytes || entry.sha256 !== expected.sha256);
}).map((entry) => entry.path);

await mkdir(evidenceRoot, { recursive: true });
const manifest = {
  schema: "phase303-production-source-freeze-v1",
  capturedAt: new Date().toISOString(),
  stage: "before",
  sourceSnapshot: "tmp/phase303-baseline-source",
  verifiedAgainst: "docs/qa/phase302-jobmark-correction/production-source-before.json",
  excluded: [".env.local and other environment files", "node_modules", ".next", "docs/qa", "tools/phase303-qa-*.mjs"],
  scope: phase302Baseline.scope,
  fileCount: entries.length,
  totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
  phase302ReferenceFileCount: phase302Baseline.fileCount,
  missingFromPhase302,
  addedSincePhase302,
  changedSincePhase302,
  files: entries,
};
const output = path.join(evidenceRoot, "production-source-before.json");
await writeFile(output, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ manifest: path.relative(root, output), snapshot: path.relative(root, snapshotRoot), fileCount: manifest.fileCount, totalBytes: manifest.totalBytes, missingFromPhase302, addedSincePhase302, changedSincePhase302 }, null, 2));

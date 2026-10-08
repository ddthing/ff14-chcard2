import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(root, "docs", "qa", "phase302-jobmark-correction");
const stage = process.argv.find((arg) => arg.startsWith("--stage="))?.split("=")[1] ?? "before";
if (!new Set(["before", "after"]).has(stage)) throw new Error("Use --stage=before or --stage=after.");
const files = new Set([
  "package.json", "package-lock.json", "next.config.ts", "next-env.d.ts", "tsconfig.json",
  "postcss.config.mjs", "eslint.config.mjs",
]);

async function walk(relative) {
  const absolute = path.join(root, relative);
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    const child = path.posix.join(relative.replaceAll("\\", "/"), entry.name);
    if (entry.isDirectory()) await walk(child);
    else if (entry.isFile()) files.add(child);
    else if (entry.isSymbolicLink()) files.add(child);
  }
}

for (const directory of ["src", "public", "licenses"]) {
  await walk(directory).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const entries = [];
for (const relative of [...files].sort()) {
  const absolute = path.join(root, relative);
  const info = await lstat(absolute);
  if (info.isSymbolicLink()) {
    const target = await readlink(absolute);
    entries.push({ path: relative.replaceAll("\\", "/"), type: "symlink", target, sha256: sha256(Buffer.from(target)) });
  } else {
    const bytes = await readFile(absolute);
    entries.push({ path: relative.replaceAll("\\", "/"), type: "file", bytes: bytes.length, sha256: sha256(bytes) });
  }
}

const current = {
  schema: "phase302-production-source-freeze-v1",
  capturedAt: new Date().toISOString(),
  stage,
  excluded: [".env.local and other environment files (may contain secrets)", "node_modules", ".next", "tmp/phase302-lab and other QA-only worktrees", "docs/qa", "tools/phase302-qa-*.mjs and tools/phase302-board*.mjs"],
  scope: ["src/**", "public/**", "licenses/**", ...[...files].filter((file) => !/^(src|public|licenses)\//.test(file)).sort()],
  fileCount: entries.length,
  totalBytes: entries.reduce((total, entry) => total + (entry.bytes ?? 0), 0),
  files: entries,
};

const currentPath = path.join(evidenceRoot, `production-source-${stage}.json`);
await writeFile(currentPath, JSON.stringify(current, null, 2) + "\n");
let comparison = null;
if (stage === "after") {
  const before = JSON.parse(await readFile(path.join(evidenceRoot, "production-source-before.json"), "utf8"));
  const beforeMap = new Map(before.files.map((entry) => [entry.path, entry.sha256]));
  const afterMap = new Map(entries.map((entry) => [entry.path, entry.sha256]));
  const added = [...afterMap.keys()].filter((file) => !beforeMap.has(file));
  const removed = [...beforeMap.keys()].filter((file) => !afterMap.has(file));
  const changed = [...afterMap.keys()].filter((file) => beforeMap.has(file) && afterMap.get(file) !== beforeMap.get(file));
  comparison = { exactMatch: added.length === 0 && removed.length === 0 && changed.length === 0, beforeFileCount: before.files.length, afterFileCount: entries.length, added, removed, changed };
  await writeFile(path.join(evidenceRoot, "production-source-freeze-report.json"), JSON.stringify({ schema: "phase302-production-source-freeze-report-v1", capturedAt: current.capturedAt, ...comparison }, null, 2) + "\n");
}

console.log(JSON.stringify({ manifest: path.relative(root, currentPath), fileCount: current.fileCount, totalBytes: current.totalBytes, comparison }, null, 2));
if (stage === "after" && !comparison.exactMatch) process.exitCode = 1;

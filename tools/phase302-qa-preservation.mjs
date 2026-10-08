import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(root, "docs", "qa", "phase302-jobmark-correction");
const baselinePath = path.join(evidenceRoot, "phase301-baseline-before.json");
const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const actual = [];

for (const baselineEntry of baseline.files) {
  const absolute = path.join(root, baselineEntry.path);
  try {
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) {
      const target = await readlink(absolute);
      actual.push({ path: baselineEntry.path, type: "symlink", bytes: Buffer.byteLength(target), sha256: sha256(Buffer.from(target)) });
    } else {
      const bytes = await readFile(absolute);
      actual.push({ path: baselineEntry.path, type: "file", bytes: bytes.length, sha256: sha256(bytes) });
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    actual.push({ path: baselineEntry.path, type: "missing", bytes: null, sha256: null });
  }
}

async function walkFiles(relative) {
  const files = [];
  const absolute = path.join(root, relative);
  for (const entry of await readdir(absolute, { withFileTypes: true }).catch((error) => error?.code === "ENOENT" ? [] : Promise.reject(error))) {
    const child = path.posix.join(relative.replaceAll("\\", "/"), entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(child));
    else if (entry.isFile() || entry.isSymbolicLink()) files.push(child);
  }
  return files;
}

const baselinePhase301 = baseline.files.map((entry) => entry.path).filter((file) => file.startsWith("docs/qa/phase301-card-type-job/"));
const currentPhase301 = await walkFiles("docs/qa/phase301-card-type-job");
const baselinePaths = new Set(baseline.files.map((entry) => entry.path));
const currentPaths = new Set(actual.filter((entry) => entry.type !== "missing").map((entry) => entry.path));
const baselineByPath = new Map(baseline.files.map((entry) => [entry.path, entry]));
const currentByPath = new Map(actual.map((entry) => [entry.path, entry]));
const added = [...currentPhase301].filter((file) => !baselinePhase301.includes(file));
const removed = baselinePhase301.filter((file) => !currentPhase301.includes(file));
const missing = [...baselinePaths].filter((file) => !currentPaths.has(file));
const changed = [...baselinePaths].filter((file) => {
  const expected = baselineByPath.get(file);
  const observed = currentByPath.get(file);
  return observed?.bytes !== expected.bytes || observed?.sha256 !== expected.sha256;
});
const report = {
  schema: "phase302-phase301-preservation-report-v1",
  capturedAt: new Date().toISOString(),
  baselinePath: "phase301-baseline-before.json",
  baselineFileCount: baseline.fileCount,
  checkedFileCount: actual.length,
  checkedPhase301EvidenceFileCount: currentPhase301.length,
  exactMatch: added.length === 0 && removed.length === 0 && missing.length === 0 && changed.length === 0,
  addedPhase301EvidenceFiles: added,
  removedPhase301EvidenceFiles: removed,
  missingBaselineFiles: missing,
  changedFiles: changed,
};
await writeFile(path.join(evidenceRoot, "phase301-preservation-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ report: "docs/qa/phase302-jobmark-correction/phase301-preservation-report.json", ...report }, null, 2));
if (!report.exactMatch) process.exitCode = 1;

import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const qaRoot = path.join(root, "docs", "qa", "phase300");
const baselinePath = path.join(qaRoot, "before-source.json");
const before = JSON.parse(await readFile(baselinePath, "utf8"));
const protectedRoots = [
  "src/app/editor",
  "src/components/editor",
  "src/store",
  "src/components/cards",
  "src/components/app-header.tsx",
  "src/components/app-header.module.css",
  "src/components/theme-provider.tsx",
  "src/components/ffxiv",
  "src/data/fonts",
  "src/data/ffxiv",
  "src/data/samples/coner.ts",
  "src/lib/card-export",
  "src/lib/card-graphics",
  "src/lib/card-art-tokens.ts",
  "src/lib/card-materials.ts",
  "src/lib/ffxiv-assets",
  "src/lib/app-appearance.ts",
  "src/lib/job-themes.ts",
  "src/lib/job-motif-tokens.ts",
  "src/lib/typography-presets.ts",
  "src/app/app-theme.css",
];
const authorizedMarketingRoots = [
  "src/components/home",
  "src/components/marketing",
  "src/components/site-header.tsx",
  "src/components/site-header.module.css",
  "src/components/app-shell.tsx",
  "src/components/app-shell.module.css",
  "src/app/templates",
  "src/app/create",
  "src/app/export",
  "src/app/page.tsx",
];
const authorizedBugFixRoots = ["src/lib/image-processing.ts"];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function walk(relative) {
  const absolute = path.join(root, relative);
  const info = await stat(absolute).catch(() => null);
  if (!info) return [];
  if (info.isFile()) return [relative.replaceAll("\\", "/")];
  if (!info.isDirectory()) return [];
  const rows = [];
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    const child = path.posix.join(relative.replaceAll("\\", "/"), entry.name);
    if (entry.isDirectory()) rows.push(...await walk(child));
    else if (entry.isFile()) rows.push(child);
  }
  return rows;
}

function isProtected(file) {
  return protectedRoots.some((base) => file === base || file.startsWith(base + "/"));
}

function isAuthorizedMarketing(file) {
  return authorizedMarketingRoots.some((base) => file === base || file.startsWith(base + "/"));
}

function isAuthorizedBugFix(file) {
  return authorizedBugFixRoots.some((base) => file === base || file.startsWith(base + "/"));
}

function isClassified(file) {
  return isProtected(file) || isAuthorizedMarketing(file) || isAuthorizedBugFix(file);
}

const currentFiles = (await walk("src")).sort();
const currentRows = [];
for (const file of currentFiles) {
  const bytes = await readFile(path.join(root, file));
  currentRows.push({ path: file, bytes: bytes.length, sha256: sha256(bytes) });
}

const beforeByPath = new Map(before.files.map((row) => [row.path, row]));
const afterByPath = new Map(currentRows.map((row) => [row.path, row]));
const changed = [...afterByPath].flatMap(([file, row]) => {
  const old = beforeByPath.get(file);
  return old && old.sha256 !== row.sha256 ? [{ path: file, before: old.sha256, after: row.sha256 }] : [];
});
const added = [...afterByPath.keys()].filter((file) => !beforeByPath.has(file)).sort();
const removed = [...beforeByPath.keys()].filter((file) => !afterByPath.has(file)).sort();
const protectedChanged = changed.filter((row) => isProtected(row.path));
const protectedAdded = added.filter(isProtected);
const protectedRemoved = removed.filter(isProtected);
const unchangedProtectedBaseline = [...beforeByPath.keys()].filter((file) => isProtected(file) && afterByPath.get(file)?.sha256 === beforeByPath.get(file)?.sha256).length;
const protectedBaselineCount = [...beforeByPath.keys()].filter(isProtected).length;

const afterSource = {
  schema: "phase300-source-freeze-v1",
  generatedAt: new Date().toISOString(),
  stage: "after",
  sourceRoot: "src",
  fileCount: currentRows.length,
  files: currentRows,
  protectedRoots,
  authorizedMarketingRoots,
  authorizedBugFixRoots,
  protectedFileCount: currentRows.filter((row) => isProtected(row.path)).length,
};
const diff = {
  schema: "phase300-source-freeze-diff-v1",
  generatedAt: new Date().toISOString(),
  baseline: "docs/qa/phase300/before-source.json",
  protectedRoots,
  authorizedMarketingRoots,
  authorizedBugFixRoots,
  coverage: {
    beforeSourceFiles: before.files.length,
    afterSourceFiles: currentRows.length,
    protectedBaselineFiles: protectedBaselineCount,
    protectedUnchangedBaselineFiles: unchangedProtectedBaseline,
  },
  exactProtected: protectedChanged.length === 0 && protectedAdded.length === 0 && protectedRemoved.length === 0,
  completeBaselineCoverage: protectedChanged.length + protectedRemoved.length === 0,
  protectedChanges: protectedChanged,
  protectedAdded,
  protectedRemoved,
  authorizedMarketingChanges: changed.filter((row) => isAuthorizedMarketing(row.path)),
  authorizedMarketingAdded: added.filter(isAuthorizedMarketing),
  authorizedMarketingRemoved: removed.filter(isAuthorizedMarketing),
  authorizedBugFixes: changed.filter((row) => isAuthorizedBugFix(row.path)),
  authorizedBugFixAdded: added.filter(isAuthorizedBugFix),
  authorizedBugFixRemoved: removed.filter(isAuthorizedBugFix),
  unclassifiedChanges: changed.filter((row) => !isClassified(row.path)),
  unclassifiedAdded: added.filter((file) => !isClassified(file)),
  unclassifiedRemoved: removed.filter((file) => !isClassified(file)),
};
await writeFile(path.join(qaRoot, "after-source.json"), JSON.stringify(afterSource, null, 2) + "\n");
await writeFile(path.join(qaRoot, "source-freeze-diff.json"), JSON.stringify(diff, null, 2) + "\n");
console.log(JSON.stringify({
  afterSource: "docs/qa/phase300/after-source.json",
  diff: "docs/qa/phase300/source-freeze-diff.json",
  exactProtected: diff.exactProtected,
  completeBaselineCoverage: diff.completeBaselineCoverage,
  protectedChanged: protectedChanged.length,
  protectedAdded: protectedAdded.length,
  protectedRemoved: protectedRemoved.length,
  authorizedBugFixes: diff.authorizedBugFixes.map((row) => row.path),
  unclassifiedChanged: diff.unclassifiedChanges.length,
  unclassifiedAdded: diff.unclassifiedAdded.length,
}, null, 2));
if (!diff.exactProtected) process.exitCode = 1;

import { cp, mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const qaRoot = path.join(root, "docs", "qa", "phase300");
const baselineRoot = path.resolve(qaRoot, "baseline-build");
const manifest = JSON.parse(await readFile(path.join(qaRoot, "before-source.json"), "utf8"));
const configRoot = path.join(qaRoot, "before-build-config");
const withinRoot = baselineRoot.startsWith(root + path.sep);
if (!withinRoot) throw new Error("Refusing to restore baseline outside the QA workspace: " + baselineRoot);
await mkdir(baselineRoot, { recursive: true });

const verified = [];
for (const entry of manifest.files) {
  const destination = path.join(baselineRoot, entry.path);
  let source = path.join(root, entry.snapshotPath);
  if (entry.path === "src/app/export/export.module.css") source = path.join(configRoot, "export.module.css-compiled.txt");
  const contents = await readFile(source);
  if (entry.path !== "src/app/export/export.module.css") {
    const sha256 = createHash("sha256").update(contents).digest("hex");
    if (sha256 !== entry.sha256) throw new Error("Archived source hash mismatch: " + entry.path);
    verified.push(entry.path);
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, contents);
}

const configFiles = ["package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs", "next-env.d.ts"];
for (const name of configFiles) {
  const source = path.join(configRoot, name + ".txt");
  const destination = path.join(baselineRoot, name);
  await writeFile(destination, await readFile(source));
}

const publicRoot = path.join(root, "public");
await cp(publicRoot, path.join(baselineRoot, "public"), { recursive: true, force: true });
const modulesLink = path.join(baselineRoot, "node_modules");
const modulesTarget = path.join(root, "node_modules");
const existingLink = await stat(modulesLink).then((stats) => stats.isDirectory()).catch(() => false);
if (!existingLink) await symlink(modulesTarget, modulesLink, "junction");

const result = {
  schema: "phase300-baseline-restoration-v1",
  restoredAt: new Date().toISOString(),
  baselineRoot: path.relative(root, baselineRoot).replaceAll("\\", "/"),
  archivedSourceCount: manifest.files.length,
  verifiedArchiveHashCount: verified.length,
  temporaryExportCssAdjustment: "The archived compiler-ready Export CSS Module snapshot removes only the two print-media pure-global selectors; the original source remains in before-src and hash verification excludes this compiler workaround.",
  publicAssetSource: "current public/ copied into the frozen app tree; pre-change public assets were not part of the src source manifest.",
  nodeModulesJunctionTarget: path.relative(root, modulesTarget).replaceAll("\\", "/"),
};
await writeFile(path.join(qaRoot, "baseline-restoration.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));

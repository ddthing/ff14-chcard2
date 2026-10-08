import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetArg = process.argv.find((argument) => argument.startsWith("--target="))?.slice("--target=".length) ?? "tmp/phase303-baseline-source";
const force = process.argv.includes("--force");
const targetRoot = path.resolve(root, targetArg);
const officialAssetsKey = "NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED";
const rootEnv = await readFile(path.join(root, ".env.local"), "utf8");
const officialAssetsLine = rootEnv.split(/\r?\n/).find((line) => new RegExp(`^\\s*${officialAssetsKey}\\s*=`).test(line));
const officialAssetsValue = officialAssetsLine?.split("=").slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
if (officialAssetsValue !== "true" && officialAssetsValue !== "false") {
  throw new Error(`Missing or invalid ${officialAssetsKey} boolean in the root environment file.`);
}
const relativeRoot = path.relative(root, targetRoot);
if (relativeRoot === ".." || relativeRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeRoot)) {
  throw new Error(`Phase303 QA target must remain inside this workspace: ${targetRoot}`);
}

const routeRoot = path.join(targetRoot, "src", "app", "phase303-qa");
const files = [
  { source: path.join(root, "tools", "phase303-qa-lab", "page.tsx.txt"), target: path.join(routeRoot, "page.tsx") },
  { source: path.join(root, "tools", "phase303-qa-lab", "page.module.css.txt"), target: path.join(routeRoot, "page.module.css") },
];

await mkdir(routeRoot, { recursive: true });
for (const file of files) {
  const contents = await readFile(file.source, "utf8");
  try {
    const existing = await readFile(file.target, "utf8");
    if (existing !== contents && !force) throw new Error(`Refusing to overwrite a different QA route file: ${path.relative(root, file.target)} (pass --force for the owned temporary QA route)`);
    if (existing !== contents && force) await writeFile(file.target, contents);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await writeFile(file.target, contents);
  }
}

const targetEnvPath = path.join(targetRoot, ".env.local");
const targetEnvContents = `${officialAssetsKey}=${officialAssetsValue}\n`;
try {
  const existingEnv = await readFile(targetEnvPath, "utf8");
  if (existingEnv !== targetEnvContents && !force) {
    throw new Error("Refusing to overwrite a different temporary baseline .env.local without --force.");
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
await writeFile(targetEnvPath, targetEnvContents);

console.log(JSON.stringify({
  target: path.relative(root, routeRoot).replaceAll("\\", "/"),
  files: files.map((file) => path.relative(root, file.target).replaceAll("\\", "/")),
  api: "window.__PHASE303_QA__ v1 (apply/render/readBlob/releaseBlob/snapshot)",
  publicAssetFlag: `${officialAssetsKey}=${officialAssetsValue}`,
}, null, 2));

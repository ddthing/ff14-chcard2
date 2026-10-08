import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REPOSITORY = "xivapi/classjob-icons";
const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
const API_URL = `https://api.github.com/repos/${REPOSITORY}`;
const RAW_URL = `https://raw.githubusercontent.com/${REPOSITORY}`;
const UPSTREAM_COMMIT = "766cb47831435a83f04d904146bd3472501564c5";
const LOCAL_BASE = "public/assets/ffxiv/jobs/xivapi";
const AUDIT_PATH = "docs/qa/phase216-job-icons/source-audit.json";
const CAPTURE_BASE = "docs/qa/phase216-job-icons/upstream";
const MANIFEST_PATH = "src/lib/ffxiv-assets/xivapi-job-icon-manifest.json";
const OFFICIAL_MANIFEST_PATH = "src/lib/ffxiv-assets/fan-kit-source-manifest.json";

const JOBS = [
  ["paladin", 19, "paladin"],
  ["warrior", 21, "warrior"],
  ["dark-knight", 32, "darkknight"],
  ["gunbreaker", 37, "gunbreaker"],
  ["white-mage", 24, "whitemage"],
  ["scholar", 28, "scholar"],
  ["astrologian", 33, "astrologian"],
  ["sage", 40, "sage"],
  ["monk", 20, "monk"],
  ["dragoon", 22, "dragoon"],
  ["ninja", 30, "ninja"],
  ["samurai", 34, "samurai"],
  ["reaper", 39, "reaper"],
  ["viper", 41, "viper"],
  ["bard", 23, "bard"],
  ["machinist", 31, "machinist"],
  ["dancer", 38, "dancer"],
  ["black-mage", 25, "blackmage"],
  ["summoner", 27, "summoner"],
  ["red-mage", 35, "redmage"],
  ["pictomancer", 42, "pictomancer"],
  ["blue-mage", 36, "bluemage"],
  ["carpenter", 8, "carpenter"],
  ["blacksmith", 9, "blacksmith"],
  ["armorer", 10, "armorer"],
  ["goldsmith", 11, "goldsmith"],
  ["leatherworker", 12, "leatherworker"],
  ["weaver", 13, "weaver"],
  ["alchemist", 14, "alchemist"],
  ["culinarian", 15, "culinarian"],
  ["miner", 16, "miner"],
  ["botanist", 17, "botanist"],
  ["fisher", 18, "fisher"],
  ["beastmaster", null, null],
].map(([jobId, svgIndex, fileBase]) => ({ jobId, svgIndex, fileBase }));

const PROVIDERS = ["svg", "icons", "companion", "risingstones"];
const OVERRIDES = {
  svg: {},
  icons: {},
  companion: {
    pictomancer: "pct.png",
    viper: "vpr.png",
  },
  risingstones: {
    pictomancer: null,
    viper: null,
  },
};
const ABSENCE_REASON = {
  pictomancer: {
    risingstones: "No Pictomancer file appears in the pinned risingstones directory.",
  },
  viper: {
    risingstones: "No Viper file appears in the pinned risingstones directory.",
  },
  beastmaster: Object.fromEntries(PROVIDERS.map((provider) => [
    provider,
    "Beastmaster is absent from the entire pinned xivapi/classjob-icons tree.",
  ])),
};

function upstreamPath(provider, job) {
  if (!job.fileBase || job.svgIndex === null) return null;
  if (Object.hasOwn(OVERRIDES[provider], job.jobId)) {
    const file = OVERRIDES[provider][job.jobId];
    if (file === null) return null;
    return `${provider}/${file}`;
  }

  if (provider === "svg") {
    return `svg/class_job_${String(job.svgIndex).padStart(3, "0")}.svg`;
  }

  return `${provider}/${job.fileBase}.png`;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function atomicWrite(output, contents) {
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, contents);
  await rename(temporary, output);
}

async function atomicJson(root, relativePath, value) {
  await atomicWrite(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

function gitBlobSha(bytes) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

function pngDimensions(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) {
    throw new Error("Downloaded raster is not a PNG file");
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function svgDimensions(bytes) {
  const text = bytes.toString("utf8");
  if (!/<svg\b/i.test(text)) throw new Error("Downloaded vector is not an SVG file");
  const viewBox = text.match(/\bviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
  const dimension = (name) => {
    const match = text.match(new RegExp(`\\b${name}\\s*=\\s*["']([\\d.]+)(?:px)?["']`, "i"));
    return match ? Number(match[1]) : null;
  };
  const width = dimension("width");
  const height = dimension("height");
  if (width && height) return { width, height };
  throw new Error("Could not read the SVG viewBox or intrinsic dimensions");
}

function sourceInfo(provider, job, file, treeEntry, bytes) {
  const isSvg = provider === "svg";
  const dimensions = isSvg ? svgDimensions(bytes) : pngDimensions(bytes);
  const localPath = `${CAPTURE_BASE}/${provider}/${job.jobId}.${isSvg ? "svg" : "png"}`;
  return {
    provider,
    sourcePath: file,
    downloadUrl: `${RAW_URL}/${UPSTREAM_COMMIT}/${file}`,
    localPath,
    upstreamGitBlobSha: treeEntry.sha,
    sha256: sha256(bytes),
    bytes: bytes.length,
    ...dimensions,
  };
}

function dateInSeoul() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "ff14-adventurer-card-xivapi-asset-sync",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${url}`);
  return response.json();
}

async function downloadSource(provider, job, file, treeEntry, root) {
  const url = `${RAW_URL}/${UPSTREAM_COMMIT}/${file}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "ff14-adventurer-card-xivapi-asset-sync" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`GitHub raw ${response.status} for ${file}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actualBlobSha = gitBlobSha(bytes);
  if (actualBlobSha !== treeEntry.sha) {
    throw new Error(`Git blob hash mismatch for ${file}: ${actualBlobSha} != ${treeEntry.sha}`);
  }
  const source = sourceInfo(provider, job, file, treeEntry, bytes);
  const output = path.join(root, source.localPath);
  await atomicWrite(output, bytes);
  return source;
}

async function pool(items, worker, size = 8) {
  const results = [];
  for (let index = 0; index < items.length; index += size) {
    results.push(...await Promise.all(items.slice(index, index + size).map(worker)));
  }
  return results;
}

async function checkExisting(root) {
  const audit = JSON.parse(await readFile(path.join(root, AUDIT_PATH), "utf8"));
  let checked = 0;
  for (const entry of Object.values(audit.entries)) {
    for (const source of Object.values(entry.sources)) {
      if (!source || source.status === "absent-upstream") continue;
      const bytes = await readFile(path.join(root, source.localPath));
      if (sha256(bytes) !== source.sha256) throw new Error(`SHA-256 mismatch for ${source.localPath}`);
      const dimensions = source.provider === "svg" ? svgDimensions(bytes) : pngDimensions(bytes);
      if (dimensions.width !== source.width || dimensions.height !== source.height) {
        throw new Error(`Dimension mismatch for ${source.localPath}`);
      }
      if (gitBlobSha(bytes) !== source.upstreamGitBlobSha) {
        throw new Error(`Upstream Git blob mismatch for ${source.localPath}`);
      }
      checked += 1;
    }
  }
  const manifest = JSON.parse(await readFile(path.join(root, MANIFEST_PATH), "utf8"));
  let published = 0;
  for (const [jobId, entry] of Object.entries(manifest.entries)) {
    for (const candidate of [entry.svg, entry.raster]) {
      if (!candidate?.src) continue;
      if (!candidate.verified) {
        throw new Error(`Unverified XIVAPI source is published for ${jobId}`);
      }
      if (!candidate.integrityVerified || !candidate.sha256) {
        throw new Error(`Published XIVAPI source lacks checksum provenance for ${jobId}`);
      }
      const publicPath = candidate.src.replace(/^\//, "");
      if (!publicPath.startsWith("assets/ffxiv/jobs/xivapi/")) {
        throw new Error(`Unexpected XIVAPI runtime path for ${jobId}: ${candidate.src}`);
      }
      const bytes = await readFile(path.join(root, "public", publicPath));
      if (sha256(bytes) !== candidate.sha256) throw new Error(`Published SHA-256 mismatch for ${candidate.src}`);
      const dimensions = candidate.provider === "svg" ? svgDimensions(bytes) : pngDimensions(bytes);
      if (dimensions.width !== candidate.width || dimensions.height !== candidate.height) {
        throw new Error(`Published dimensions mismatch for ${candidate.src}`);
      }
      published += 1;
    }
  }
  console.log(`Verified ${checked} retained comparison assets and ${published} visually approved runtime assets against checksums and dimensions.`);
}

async function removePreviousGeneratedPublicFiles(root) {
  try {
    const previousAudit = JSON.parse(await readFile(path.join(root, AUDIT_PATH), "utf8"));
    for (const entry of Object.values(previousAudit.entries ?? {})) {
      for (const source of Object.values(entry.sources ?? {})) {
        if (!source?.localPath?.startsWith(`${LOCAL_BASE}/`)) continue;
        const output = path.resolve(root, source.localPath);
        const expectedPrefix = `${path.resolve(root, LOCAL_BASE)}${path.sep}`;
        if (!output.startsWith(expectedPrefix)) throw new Error(`Refusing to clean path outside XIVAPI folder: ${output}`);
        const bytes = await readFile(output);
        if (sha256(bytes) !== source.sha256) {
          throw new Error(`Refusing to delete changed prior candidate: ${source.localPath}`);
        }
        await unlink(output);
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function publishVerified(root) {
  const previousManifest = JSON.parse(await readFile(path.join(root, MANIFEST_PATH), "utf8"));
  const audit = JSON.parse(await readFile(path.join(root, AUDIT_PATH), "utf8"));

  const localDate = audit.retrievedAtLocalDate;
  const entries = Object.fromEntries(JOBS.map(({ jobId }) => [jobId, { svg: null, raster: null }]));
  const selectionCounts = { svg: 0, icons: 0, companion: 0, risingstones: 0 };
  const selectedOutputs = new Set();
  let copied = 0;

  for (const [jobId, previousEntry] of Object.entries(previousManifest.entries ?? {})) {
    if (!Object.hasOwn(entries, jobId)) throw new Error(`Manifest contains noncanonical job id: ${jobId}`);
    for (const key of ["svg", "raster"]) {
      const selection = previousEntry[key];
      if (!selection?.verified || !selection.integrityVerified || !Array.isArray(selection.verifiedUsages)) continue;
      const provider = selection.provider;
      if (!PROVIDERS.includes(provider)) throw new Error(`Unsupported XIVAPI provider for ${jobId}: ${provider}`);
      const auditSource = audit.entries[jobId]?.sources?.[provider];
      if (
        !auditSource?.localPath || auditSource.status === "absent-upstream" ||
        auditSource.sourcePath !== selection.sourcePath || auditSource.sha256 !== selection.sha256
      ) {
        throw new Error(`Manifest selects an unverified ${provider} source for ${jobId}`);
      }
      const sourceBytes = await readFile(path.join(root, auditSource.localPath));
      if (sha256(sourceBytes) !== auditSource.sha256) throw new Error(`Source changed before publication: ${auditSource.sourcePath}`);
      if (gitBlobSha(sourceBytes) !== auditSource.upstreamGitBlobSha) {
        throw new Error(`Upstream Git blob mismatch before publication: ${auditSource.sourcePath}`);
      }

      const extension = key === "svg" ? "svg" : "png";
      const publicPath = `${LOCAL_BASE}/${provider}/${jobId}.${extension}`;
      const publicUrl = `/${publicPath.replace(/^public[\\/]/, "").replaceAll(path.sep, "/")}`;
      const output = path.join(root, publicPath);
      const expectedPrefix = `${path.resolve(root, LOCAL_BASE)}${path.sep}`;
      if (!path.resolve(output).startsWith(expectedPrefix)) throw new Error(`Refusing path outside XIVAPI folder: ${output}`);
      await atomicWrite(output, sourceBytes);
      entries[jobId][key] = { ...selection, src: publicUrl, width: auditSource.width, height: auditSource.height };
      selectedOutputs.add(path.resolve(output));
      selectionCounts[provider] += 1;
      copied += 1;
    }
  }

  const manifest = {
    schemaVersion: 1,
    provider: audit.provider,
    repository: REPOSITORY_URL,
    upstreamCommit: UPSTREAM_COMMIT,
    retrievedAtLocalDate: localDate,
    repositoryDeclaredLicense: audit.repositoryDeclaredLicense,
    artworkRightsNote: "Repository MIT terms cover its code, not FINAL FANTASY XIV artwork; see docs/design/job-icon-sources.md.",
    currentJobCount: JOBS.length,
    coverage: {
      sourceAvailable: audit.coverage,
      reviewedJobs: previousManifest.coverage?.reviewedJobs ?? JOBS.length,
      publishedSources: selectionCounts,
    },
    entries,
  };

  // Remove only prior script-published files whose names are no longer selected
  // and whose bytes still match the previously reviewed checksum.
  for (const entry of Object.values(previousManifest.entries)) {
    for (const source of [entry.svg, entry.raster]) {
      if (!source?.src) continue;
      const publicPath = source.src.replace(/^\//, "");
      if (!publicPath.startsWith("assets/ffxiv/jobs/xivapi/")) continue;
      const output = path.resolve(root, "public", publicPath);
      if (selectedOutputs.has(output)) continue;
      const expectedPrefix = `${path.resolve(root, LOCAL_BASE)}${path.sep}`;
      if (!output.startsWith(expectedPrefix)) throw new Error(`Refusing to clean path outside XIVAPI folder: ${output}`);
      try {
        const bytes = await readFile(output);
        if (sha256(bytes) !== source.sha256) throw new Error(`Refusing to delete changed published file: ${publicPath}`);
        await unlink(output);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }

  await atomicJson(root, MANIFEST_PATH, manifest);
  await writeFile(path.join(root, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Republished ${copied} manifest-approved pinned XIVAPI originals locally; no derived assets were produced.`);
}

async function sync(root) {
  await removePreviousGeneratedPublicFiles(root);
  const previousManifest = await readFile(path.join(root, MANIFEST_PATH), "utf8")
    .then((text) => JSON.parse(text))
    .catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  const officialManifest = JSON.parse(await readFile(path.join(root, OFFICIAL_MANIFEST_PATH), "utf8"));
  const expectedIds = [...Object.keys(officialManifest.entries), "beastmaster"].sort();
  const actualIds = JOBS.map(({ jobId }) => jobId).sort();
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
    throw new Error("The XIVAPI allowlist does not cover exactly the current Fan Kit IDs plus Beastmaster");
  }
  const repository = await getJson(API_URL);
  const commit = await getJson(`${API_URL}/commits/${UPSTREAM_COMMIT}`);
  if (commit.sha !== UPSTREAM_COMMIT) throw new Error("Pinned commit does not resolve to the requested SHA");
  const treeResult = await getJson(`${API_URL}/git/trees/${UPSTREAM_COMMIT}?recursive=1`);
  if (treeResult.truncated) throw new Error("GitHub returned a truncated source tree; refusing incomplete allowlist validation");
  const tree = new Map(treeResult.tree.map((entry) => [entry.path, entry]));
  const allowed = [];
  const entries = {};

  for (const job of JOBS) {
    const sources = {};
    for (const provider of PROVIDERS) {
      const file = upstreamPath(provider, job);
      if (!file) {
        sources[provider] = {
          status: "absent-upstream",
          reason: ABSENCE_REASON[job.jobId]?.[provider] ?? "No allowlisted upstream file is mapped for this job.",
        };
        continue;
      }
      const treeEntry = tree.get(file);
      if (!treeEntry || treeEntry.type !== "blob") {
        throw new Error(`Allowlisted path is absent from pinned upstream tree: ${file}`);
      }
      allowed.push({ provider, job, file, treeEntry });
      sources[provider] = { status: "pending-download", sourcePath: file };
    }
    entries[job.jobId] = { sources };
  }

  const downloaded = await pool(allowed, async (asset) => {
    const source = await downloadSource(asset.provider, asset.job, asset.file, asset.treeEntry, root);
    return { ...asset, source };
  });

  for (const asset of downloaded) {
    entries[asset.job.jobId].sources[asset.provider] = asset.source;
  }

  const coverage = Object.fromEntries(PROVIDERS.map((provider) => [
    provider,
    Object.values(entries).filter((entry) => (
      entry.sources[provider] && entry.sources[provider].status !== "absent-upstream"
    )).length,
  ]));

  const date = dateInSeoul();
  const retrievedDate = `${date.year}-${date.month}-${date.day}`;
  const upstreamLicense = repository.license?.spdx_id ?? "NOASSERTION";
  const audit = {
    schemaVersion: 1,
    provider: "XIVAPI classjob-icons",
    repository: REPOSITORY_URL,
    defaultBranchAtAudit: repository.default_branch,
    upstreamCommit: UPSTREAM_COMMIT,
    retrievedAtLocalDate: retrievedDate,
    timezone: "Asia/Seoul",
    repositoryDeclaredLicense: upstreamLicense,
    gameArtworkRights: "Unresolved by the repository MIT declaration; FINAL FANTASY XIV artwork remains subject to Square Enix rights and applicable materials terms.",
    allowlistedSourceCount: downloaded.length,
    allowlistedFolders: PROVIDERS,
    canonicalJobIds: JOBS.map(({ jobId }) => jobId),
    coverage,
    entries,
  };
  await mkdir(path.dirname(path.join(root, AUDIT_PATH)), { recursive: true });
  await atomicJson(root, AUDIT_PATH, audit);

  const registryEntries = Object.fromEntries(JOBS.map(({ jobId }) => [jobId, { svg: null, raster: null }]));
  if (previousManifest?.upstreamCommit === UPSTREAM_COMMIT) {
    for (const [jobId, previous] of Object.entries(previousManifest.entries ?? {})) {
      const current = registryEntries[jobId];
      if (!current) continue;
      for (const key of ["svg", "raster"]) {
        const source = previous[key];
        const auditSource = source?.provider && entries[jobId]?.sources[source.provider];
        if (source?.src && source.sha256 && auditSource?.sha256 === source.sha256) current[key] = source;
      }
    }
  }
  const manifest = {
    schemaVersion: 1,
    provider: "XIVAPI classjob-icons",
    repository: REPOSITORY_URL,
    upstreamCommit: UPSTREAM_COMMIT,
    retrievedAtLocalDate: retrievedDate,
    repositoryDeclaredLicense: upstreamLicense,
    artworkRightsNote: "The repository MIT declaration does not relicense FINAL FANTASY XIV artwork; see docs/design/job-icon-sources.md.",
    currentJobCount: JOBS.length,
    coverage: {
      sourceAvailable: coverage,
      publishedSources: Object.fromEntries(PROVIDERS.map((provider) => [
        provider,
        Object.values(registryEntries).filter((entry) => entry.svg?.provider === provider || entry.raster?.provider === provider).length,
      ])),
    },
    entries: registryEntries,
  };
  await atomicJson(root, MANIFEST_PATH, manifest);
  console.log(`Downloaded ${downloaded.length} allowlisted assets from ${UPSTREAM_COMMIT}.`);
  console.log(`Provider coverage across the 34 registry IDs: ${JSON.stringify(coverage)}.`);
  console.log(`Audit: ${AUDIT_PATH}`);
  console.log(`Compact runtime manifest: ${MANIFEST_PATH}`);
}

const root = process.cwd();
if (process.argv.includes("--check")) {
  await checkExisting(root);
} else if (process.argv.includes("--sync")) {
  await sync(root);
} else if (process.argv.includes("--publish")) {
  await publishVerified(root);
} else {
  console.error("Use --sync to fetch the pinned allowlist, --publish to publish reviewed sources, or --check to verify local copies.");
  process.exitCode = 2;
}

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qa = path.join(root, 'docs', 'qa', 'phase217');
const rendered = path.join(qa, 'rendered');
const metadataPattern = /^qa217-card-before-(?:dark|light|system-dark|system-light)-(?:cinematic|editorial|id-card)-(?:png|webp)-r[1-3]-2x\.(?:png|webp)\.json$/;
const stylePattern = /^qa217-style-before-(?:dark|light|system-dark|system-light)-(?:cinematic|editorial|id-card)\.json$/;
const repaired = [];
const alreadyCorrect = [];
const stateHashesRepaired = [];
const styleStateHashesRepaired = [];
const failures = [];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function repairStateHash(report, label) {
  const oldStateHash = report.stateHash;
  if (typeof oldStateHash !== 'string' || oldStateHash.length <= 64 || oldStateHash.length > 1_000_000 || !/^[a-f0-9]+$/i.test(oldStateHash)) {
    if (typeof oldStateHash === 'string' && /^[a-f0-9]{64}$/i.test(oldStateHash)) return null;
    throw new Error(`${label}: old state fingerprint is not a bounded hex-encoded UTF-8 JSON source.`);
  }
  if (oldStateHash.length % 2 !== 0) throw new Error(`${label}: old state fingerprint has an odd hex length.`);
  const sourceBytes = Buffer.from(oldStateHash, 'hex');
  if (sourceBytes.toString('hex') !== oldStateHash.toLowerCase()) throw new Error(`${label}: old state fingerprint did not decode as exact hex bytes.`);
  const sourceText = sourceBytes.toString('utf8');
  let parsed;
  try { parsed = JSON.parse(sourceText); }
  catch { throw new Error(`${label}: old state bytes did not decode to JSON.`); }
  if (JSON.stringify(parsed) !== sourceText) throw new Error(`${label}: decoded state JSON is not canonical JSON.stringify output.`);
  if (report.stage !== 'before' || parsed?.design?.template !== report.family || parsed?.design?.ratio !== '4:5') {
    throw new Error(`${label}: decoded card source does not match the before Coner ${report.family}/4:5 metadata.`);
  }
  const corrected = sha256(sourceBytes);
  report.stateHash = corrected;
  report.stateHashRepair = {
    schema: 'phase217-state-hash-repair-v1',
    source: 'decoded old stateHash hex bytes, verified as canonical UTF-8 JSON card data',
    oldHexCharacterCount: oldStateHash.length,
    decodedJsonByteCount: sourceBytes.byteLength,
    decodedFamily: parsed?.design?.template ?? parsed?.family ?? null,
    decodedRatio: parsed?.design?.ratio ?? null,
    correctedStateSha256: corrected,
    note: 'The old helper returned the hex encoding of serialized card JSON rather than a digest. Its bytes were decoded and canonical-JSON-verified before computing SHA-256; no card data or raster was changed.',
  };
  return { label, family: parsed.design.template, ratio: parsed.design.ratio, oldHexCharacterCount: oldStateHash.length, decodedJsonByteCount: sourceBytes.byteLength, sha256: corrected };
}

for (const name of (await readdir(rendered)).filter(candidate => metadataPattern.test(candidate)).sort()) {
  const metadataPath = path.join(rendered, name);
  const binaryName = name.slice(0, -'.json'.length);
  try {
    const [metadataBytes, binary] = await Promise.all([
      readFile(metadataPath),
      readFile(path.join(rendered, binaryName)),
    ]);
    const metadata = JSON.parse(metadataBytes.toString('utf8'));
    const actualHash = sha256(binary);
    const stateRepair = repairStateHash(metadata, name);
    if (stateRepair) stateHashesRepaired.push(stateRepair);
    if (metadata.sha256 === actualHash) {
      if (stateRepair) await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
      alreadyCorrect.push({ metadata: name, sha256: actualHash, stateHashRepaired: Boolean(stateRepair) });
      continue;
    }
    const oldHex = typeof metadata.sha256 === 'string' ? metadata.sha256 : '';
    metadata.sha256 = actualHash;
    metadata.bytes = binary.byteLength;
    metadata.sha256Repair = {
      schema: 'phase217-export-hash-repair-v1',
      repairedAt: new Date().toISOString(),
      sourceBinary: binaryName,
      oldHexCharacterCount: oldHex.length,
      note: 'The original QA fixture hex-encoded every raw export byte instead of computing SHA-256. This metadata-only repair recalculates the digest from the retained binary; the captured raster was not regenerated or modified.',
    };
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    repaired.push({ metadata: name, sourceBinary: binaryName, oldHexCharacterCount: oldHex.length, sha256: actualHash, bytes: binary.byteLength, stateHashRepaired: Boolean(stateRepair) });
  } catch (error) {
    failures.push({ metadata: name, error: error instanceof Error ? error.message : String(error) });
  }
}

for (const name of (await readdir(rendered)).filter(candidate => stylePattern.test(candidate)).sort()) {
  const reportPath = path.join(rendered, name);
  try {
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    const stateRepair = repairStateHash(report, name);
    if (stateRepair) {
      styleStateHashesRepaired.push(stateRepair);
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }
  } catch (error) {
    failures.push({ metadata: name, error: error instanceof Error ? error.message : String(error) });
  }
}

const report = {
  schema: 'phase217-before-metadata-hash-repair-v1',
  generatedAt: new Date().toISOString(),
  protocol: 'Metadata only. Existing before PNG/WebP files are read as the source of truth; binary SHA-256 is recalculated with Node crypto. The old stateHash hex bytes are decoded, validated as canonical UTF-8 JSON card data, then hashed before being replaced. The prior hex character counts and repair notes are retained. No rendered image is modified or regenerated.',
  repairedCount: repaired.length,
  alreadyCorrectCount: alreadyCorrect.length,
  stateHashesRepairedCount: stateHashesRepaired.length,
  styleStateHashesRepairedCount: styleStateHashesRepaired.length,
  failureCount: failures.length,
  repaired,
  alreadyCorrect,
  stateHashesRepaired,
  styleStateHashesRepaired,
  failures,
};
const reportPath = path.join(qa, 'before-metadata-hash-repair.json');
const priorReport = await readFile(reportPath, 'utf8').then(JSON.parse).catch(() => null);
const hasNewRepairs = repaired.length > 0 || stateHashesRepaired.length > 0 || styleStateHashesRepaired.length > 0;
const savedReport = !hasNewRepairs && priorReport?.schema === 'phase217-before-metadata-hash-repair-v1' && priorReport.repairedCount > 0
  ? {
      ...priorReport,
      lastVerifiedAt: new Date().toISOString(),
      lastVerification: { alreadyCorrectCount: alreadyCorrect.length, failureCount: failures.length, failures },
    }
  : { ...report, lastVerifiedAt: report.generatedAt };
await writeFile(reportPath, `${JSON.stringify(savedReport, null, 2)}\n`);
console.log(JSON.stringify({ report: path.relative(root, reportPath), repairedCount: savedReport.repairedCount, alreadyCorrectCount: alreadyCorrect.length, stateHashesRepairedCount: savedReport.stateHashesRepairedCount, styleStateHashesRepairedCount: savedReport.styleStateHashesRepairedCount, failureCount: failures.length, oldBinaryShaHexCharacterCounts: savedReport.repaired.map(row => row.oldHexCharacterCount), oldStateHexCharacterCounts: [...savedReport.stateHashesRepaired, ...savedReport.styleStateHashesRepaired].map(row => row.oldHexCharacterCount), preservedPriorRepairEvidence: Boolean(!hasNewRepairs && savedReport.lastVerification) }, null, 2));
if (failures.length) process.exitCode = 1;

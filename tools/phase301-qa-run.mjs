import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCombinedShortlistCases,
  buildJobMarkSourceCases,
  buildMetadataFallbackCases,
  buildMetadataComparisonCases,
  buildP0ReferenceCases,
  buildStage2JobMarkCases,
  buildStage1Cases,
  assertForeground,
  captureCase,
  connectLab,
  navigateAndAssert,
  setViewportAndMedia,
  waitForLabApi,
  writeCaseReport,
} from "./phase301-qa-cdp.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(root, "docs", "qa", "phase301-card-type-job");
const rawRoot = path.join(evidenceRoot, "raw");
const arg = (name, fallback) => process.argv.find((value) => value.startsWith(name + "="))?.slice(name.length + 1) ?? fallback;
const debugPort = Number(arg("--debug-port", arg("--port", "9327")));
const baseUrl = arg("--base-url", "http://127.0.0.1:3330").replace(/\/$/, "");
const caseManifest = arg("--cases", "docs/qa/phase301-card-type-job/qa-cases-stage1.json");
const outputName = arg("--output", "browser-qa-results.json");
const cardSelector = arg("--card-selector", "article[data-card-render-scope][data-master-id]");
const casesPath = path.isAbsolute(caseManifest) ? caseManifest : path.join(root, caseManifest);
const manifest = JSON.parse(await readFile(casesPath, "utf8"));
const viewport = {
  width: Number(arg("--width", String(manifest.viewport?.width ?? 1440))),
  height: Number(arg("--height", String(manifest.viewport?.height ?? 1120))),
  deviceScaleFactor: Number(manifest.viewport?.deviceScaleFactor ?? 1),
  mobile: Boolean(manifest.viewport?.mobile ?? false),
};
const cases = Array.isArray(manifest.cases)
  ? manifest.cases
  : manifest.stage === "stage1-font" ? buildStage1Cases({ fontSetMetadata: manifest.fontSetMetadata ?? {} })
    : manifest.stage === "p0-production-reference" ? buildP0ReferenceCases()
      : manifest.stage === "metadata-fallback" ? buildMetadataFallbackCases()
        : manifest.stage === "p0-jobmark-abc" ? buildStage2JobMarkCases()
        : manifest.stage === "p0-source-tier" ? buildJobMarkSourceCases()
          : manifest.stage === "combined-shortlist" ? buildCombinedShortlistCases()
            : manifest.stage === "metadata-comparison" ? buildMetadataComparisonCases() : [];
if (cases.length === 0) throw new Error(`No cases in ${caseManifest}.`);
const fontManifestPath = path.join(evidenceRoot, "fonts", "font-manifest.json");
const fontManifest = JSON.parse(await readFile(fontManifestPath, "utf8"));
const expandCaseFontRefs = (caseInput) => {
  const resolveRef = (reference) => {
    const ref = typeof reference === "string" ? { fontId: reference } : reference;
    const font = fontManifest.fonts?.[ref.fontId];
    if (!font) throw new Error(`Font manifest has no face entry for ${ref.fontId}`);
    const aliases = fontManifest.aliases?.[ref.fontId] ?? {};
    const selectedAliases = ref.script ? [aliases[ref.script]].filter(Boolean) : Object.values(aliases);
    const faceFiles = (font.files ?? []).filter((file) => !ref.script || file.script === ref.script);
    const fileNames = faceFiles.flatMap((file) => [file.family, file.internalFamily, file.postScriptName]);
    return [font.family, font.internalFamily, font.postScriptName, ...selectedAliases, ...fileNames].filter(Boolean);
  };
  const expectedRefs = caseInput.expectedFaceRefsByRole;
  const expectedFacesByRole = expectedRefs
    ? Object.fromEntries(Object.entries(expectedRefs).map(([role, references]) => [role, [...new Set((Array.isArray(references) ? references : [references]).flatMap(resolveRef))]]))
    : caseInput.expectedFacesByRole;
  const familyGenreByName = {};
  for (const [fontId, font] of Object.entries(fontManifest.fonts ?? {})) {
    const fileNames = (font.files ?? []).flatMap((file) => [file.family, file.internalFamily, file.postScriptName]);
    const names = [font.family, font.internalFamily, font.postScriptName, ...Object.values(fontManifest.aliases?.[fontId] ?? {}), ...fileNames].filter(Boolean);
    for (const name of names) familyGenreByName[name] = font.genre;
  }
  const defaultAllowedFontIds = [caseInput.fontSet, caseInput.metadataSet]
    .flatMap((setId) => Object.values(fontManifest.sets?.[setId] ?? {}));
  const allowedCustomFaces = [...new Set([
    ...(caseInput.allowedCustomFaces ?? []),
    ...[...(caseInput.allowedFontIds ?? []), ...defaultAllowedFontIds].flatMap((fontId) => resolveRef(fontId)),
  ])];
  return {
    ...caseInput,
    ...(expectedFacesByRole ? { expectedFacesByRole } : {}),
    ...(caseInput.expectedFaceRefsByRole ? { expectedFaceSource: "font-assets-manifest" } : {}),
    familyGenreByName: { ...familyGenreByName, ...(caseInput.familyGenreByName ?? {}) },
    allowedCustomFaces,
  };
};
const expandedCases = cases.map(expandCaseFontRefs);

const { client, version } = await connectLab(debugPort);
let foregroundAssertions = 0;
const runStarted = new Date().toISOString();
try {
  await setViewportAndMedia(client, { ...viewport, colorScheme: manifest.colorScheme ?? "dark", reducedMotion: "no-preference" });
  const initialForeground = await navigateAndAssert(client, baseUrl + (manifest.route ?? "/"), viewport);
  foregroundAssertions += 1;
  const api = await waitForLabApi(client);
  const results = [];
  for (const caseInput of expandedCases) {
    const itemStartedAt = new Date().toISOString();
    try {
      let caseForCapture = caseInput;
      if (caseInput.p0ReferenceCaseId) {
        const referencePath = path.join(rawRoot, `${caseInput.p0ReferenceCaseId}.json`);
        const reference = JSON.parse(await readFile(referencePath, "utf8"));
        if (!reference.actualFontEvidence?.runs?.length) throw new Error(`P0 reference face rows missing: ${caseInput.p0ReferenceCaseId}`);
        caseForCapture = { ...caseInput, p0ReferenceActualFontRuns: reference.actualFontEvidence.runs, p0ReferenceRawPath: path.relative(evidenceRoot, referencePath).replaceAll("\\", "/") };
      }
      const captured = await captureCase(client, caseForCapture, {
        cardSelector,
        screenshot: caseInput.preview !== false,
        fontEvidence: caseInput.fontEvidence !== false,
        exports: caseInput.exports ?? [],
        fontManifest,
      });
      const foreground = await assertForeground(client, viewport);
      foregroundAssertions += 1;
      const smokeRows = caseInput.smokeGateRoles?.length
        ? (captured.actualFontEvidence?.runs ?? []).filter((fontRun) => caseInput.smokeGateRoles.includes(fontRun.role))
        : [];
      const smokeGate = caseInput.smokeGateRoles?.length ? {
        roles: caseInput.smokeGateRoles,
        matchedRunCount: smokeRows.length,
        pass: smokeRows.length > 0 && smokeRows.every((fontRun) => fontRun.expectedFaceSource === "font-assets-manifest" && fontRun.faceMatchPass && !fontRun.systemFallback && !fontRun.genreMismatch && !fontRun.genreUnclassified),
        runs: smokeRows.map((fontRun) => ({ field: fontRun.field, role: fontRun.role, text: fontRun.text, intendedFamilies: fontRun.intendedFamilies, actualPlatformFonts: fontRun.actualPlatformFonts, faceMatchPass: fontRun.faceMatchPass, systemFallback: fontRun.systemFallback, expectedGenre: fontRun.expectedGenre, actualGenres: fontRun.actualGenres, genreMismatch: fontRun.genreMismatch })),
      } : null;
      const row = {
        ...captured,
        foreground,
        startedAt: itemStartedAt,
        smokeGate,
        checks: {
          cardRendered: captured.card.found && captured.card.visible,
          foregroundAndViewport: true,
          jobDataMatchesRequestedId: captured.jobSourceEvidence?.jobDataPass ?? true,
          resolverMatchesExpectedSource: captured.jobSourceEvidence?.resolverPass ?? true,
          allPaintedRoleTextHasPlatformFace: (captured.actualFontEvidence?.missingPlatformFontRunCount ?? 0) === 0 && (captured.actualFontEvidence?.nonPaintedTextAnomalyCount ?? 0) === 0,
          ...(caseInput.candidatePassApplicable === false || caseInput.stage === "p0-production-reference" ? {} : {
            independentExpectedFaceMapPresent: (captured.actualFontEvidence?.independentExpectedFaceMapRunCount ?? 0) > 0 &&
              (captured.actualFontEvidence?.independentExpectedFaceMapMissingRunCount ?? 0) === 0 &&
              (captured.actualFontEvidence?.missingExpectedFaceRunCount ?? 0) === 0,
            independentExpectedGenreMapPresent: (captured.actualFontEvidence?.expectedGenreMappedRunCount ?? 0) > 0 &&
              (captured.actualFontEvidence?.independentExpectedGenreMapMissingRunCount ?? 0) === 0,
            allActualFacesMatchIntent: captured.actualFontEvidence?.actualFaceMismatchRunCount === 0,
            allRequestedFacePlansMatchManifest: (captured.actualFontEvidence?.roleRequestMismatchRunCount ?? 0) === 0,
            allRequestedFaceWeightsMatchManifest: (captured.actualFontEvidence?.requestWeightMismatchRunCount ?? 0) === 0,
            allP0ExceptionsMatchExactReference: captured.actualFontEvidence?.roleP0ExceptionFailureCount === 0,
            noUnexpectedSystemFallback: (captured.actualFontEvidence?.unexpectedSystemFallbackRunCount ?? 0) === 0,
            noUnintendedCustomFace: (captured.actualFontEvidence?.unexpectedCustomFaceRunCount ?? 0) === 0,
            noRoleGenreMismatch: (captured.actualFontEvidence?.unexpectedGenreMismatchRunCount ?? 0) === 0,
            everyRoleGenreClassified: (captured.actualFontEvidence?.unexpectedGenreUnclassifiedRunCount ?? 0) === 0,
          }),
        },
        referenceOnly: caseInput.candidatePassApplicable === false || caseInput.stage === "p0-production-reference",
        referenceFindings: caseInput.candidatePassApplicable === false || caseInput.stage === "p0-production-reference" ? {
          systemFallbackRunCount: captured.actualFontEvidence?.systemFallbackRunCount ?? null,
          unexpectedSystemFallbackRunCount: captured.actualFontEvidence?.unexpectedSystemFallbackRunCount ?? null,
          expectedP0SystemFallbackRunCount: captured.actualFontEvidence?.expectedP0SystemFallbackRunCount ?? null,
          unexpectedCustomFaceRunCount: captured.actualFontEvidence?.unexpectedCustomFaceRunCount ?? null,
          genreMismatchRunCount: captured.actualFontEvidence?.genreMismatchRunCount ?? null,
          genreUnclassifiedRunCount: captured.actualFontEvidence?.genreUnclassifiedRunCount ?? null,
          roleP0ExceptionRunCount: captured.actualFontEvidence?.roleP0ExceptionRunCount ?? null,
          roleP0ExceptionFailureCount: captured.actualFontEvidence?.roleP0ExceptionFailureCount ?? null,
          candidatePass: "not applicable; untouched production reference only",
        } : null,
      };
      row.capturePass = row.checks.cardRendered && row.checks.foregroundAndViewport && row.checks.jobDataMatchesRequestedId && row.checks.resolverMatchesExpectedSource && row.checks.allPaintedRoleTextHasPlatformFace;
      row.pass = row.referenceOnly ? null : Object.values(row.checks).every(Boolean);
      row.reportPath = await writeCaseReport(caseInput.id, row);
      results.push(row);
    } catch (error) {
      const row = {
        schema: "phase301-card-case-v1",
        capturedAt: new Date().toISOString(),
        startedAt: itemStartedAt,
        case: caseInput,
        pass: false,
        checks: { caseCompleted: false },
        error: error instanceof Error ? error.message : String(error),
      };
      row.reportPath = await writeCaseReport(caseInput.id, row);
      results.push(row);
    }
  }
  const comparisonGroups = new Map();
  for (const row of results) {
    const groupSpecs = row.case?.comparisonGroups ?? (row.case?.comparisonGroup && row.case?.comparisonInvariant
      ? [{ group: row.case.comparisonGroup, invariant: row.case.comparisonInvariant }]
      : []);
    for (const spec of groupSpecs) {
      const groupName = spec.group;
      const invariant = spec.invariant;
      if (!groupName || !invariant) continue;
      const apiResult = row.apiResult ?? {};
      const value = apiResult[invariant] ?? apiResult.fixture?.[invariant] ?? null;
      row.comparisonInvariantValues ??= {};
      row.comparisonInvariantValues[groupName] = value;
      const group = comparisonGroups.get(groupName) ?? { group: groupName, invariant, members: [] };
      group.members.push(row);
      comparisonGroups.set(groupName, group);
    }
  }
  const comparisonResults = [];
  for (const group of comparisonGroups.values()) {
    const values = group.members.map((row) => row.comparisonInvariantValues?.[group.group] ?? null);
    group.pass = group.members.length >= 2 && values.every((value) => typeof value === "string" && value.length > 0) && new Set(values).size === 1;
    comparisonResults.push({ group: group.group, invariant: group.invariant, memberCount: group.members.length, values: [...new Set(values)], pass: group.pass });
    for (const row of group.members) {
      row.comparisonInvariantPass ??= {};
      row.comparisonInvariantPass[group.group] = group.pass;
      if (row.referenceOnly) {
        row.referenceFindings.fixtureInvariantPass = group.pass;
      } else {
        row.checks.comparisonInvariantConsistent = group.pass;
        row.pass = Object.values(row.checks).every(Boolean);
      }
    }
  }
  // Comparison pass flags are added after the initial capture write. Persist
  // the final per-case status so raw evidence agrees with the aggregate run.
  for (const row of results) {
    if (row.case?.id) row.reportPath = await writeCaseReport(row.case.id, row);
  }
  const failedCases = results.filter((row) => row.pass === false);
  const report = {
    schema: "phase301-browser-qa-run-v1",
    startedAt: runStarted,
    completedAt: new Date().toISOString(),
    application: { baseUrl, labRunId: manifest.labRunId ?? null, route: manifest.route ?? "/", buildId: manifest.buildId ?? null },
    browser: version.Browser,
    debugPort,
    viewport,
    foregroundProtocol: { initial: initialForeground, assertedCaseCount: foregroundAssertions },
    api,
    caseManifest: path.relative(evidenceRoot, casesPath).replaceAll("\\", "/"),
    caseCount: results.length,
    passCount: results.filter((row) => row.pass === true).length,
    failCount: failedCases.length,
    captureFailureCount: results.filter((row) => row.capturePass === false || row.error).length,
    referenceOnlyCount: results.filter((row) => row.referenceOnly).length,
    jobDataMismatchCount: results.filter((row) => row.jobSourceEvidence?.jobDataPass === false).length,
    jobResolverMismatchCount: results.filter((row) => row.jobSourceEvidence?.resolverPass === false).length,
    comparisonGroups: comparisonResults,
    smokePassCount: results.filter((row) => row.smokeGate?.pass === true).length,
    smokeFailCount: results.filter((row) => row.smokeGate && !row.smokeGate.pass).length,
    systemFallbackRunCount: results.reduce((sum, row) => sum + (row.actualFontEvidence?.systemFallbackRunCount ?? 0), 0),
    candidateUnexpectedSystemFallbackRunCount: results.filter((row) => !row.referenceOnly).reduce((sum, row) => sum + (row.actualFontEvidence?.unexpectedSystemFallbackRunCount ?? 0), 0),
    referenceSystemFallbackRunCount: results.filter((row) => row.referenceOnly).reduce((sum, row) => sum + (row.actualFontEvidence?.systemFallbackRunCount ?? 0), 0),
    candidateExpectedP0SystemFallbackRunCount: results.filter((row) => !row.referenceOnly).reduce((sum, row) => sum + (row.actualFontEvidence?.expectedP0SystemFallbackRunCount ?? 0), 0),
    candidateActualFaceMismatchRunCount: results.filter((row) => !row.referenceOnly).reduce((sum, row) => sum + (row.actualFontEvidence?.actualFaceMismatchRunCount ?? 0), 0),
    candidateRequestedFacePlanMismatchRunCount: results.filter((row) => !row.referenceOnly).reduce((sum, row) => sum + (row.actualFontEvidence?.roleRequestMismatchRunCount ?? 0), 0),
    candidateRequestedFaceWeightMismatchRunCount: results.filter((row) => !row.referenceOnly).reduce((sum, row) => sum + (row.actualFontEvidence?.requestWeightMismatchRunCount ?? 0), 0),
    candidateExpectedFaceMissingRunCount: results.filter((row) => !row.referenceOnly).reduce((sum, row) => sum + (row.actualFontEvidence?.missingExpectedFaceRunCount ?? 0), 0),
    candidateExpectedGenreMissingRunCount: results.filter((row) => !row.referenceOnly).reduce((sum, row) => sum + (row.actualFontEvidence?.independentExpectedGenreMapMissingRunCount ?? 0), 0),
    candidateP0ExceptionFailureCount: results.filter((row) => !row.referenceOnly).reduce((sum, row) => sum + (row.actualFontEvidence?.roleP0ExceptionFailureCount ?? 0), 0),
    candidateGenreMismatchRunCount: results.filter((row) => !row.referenceOnly).reduce((sum, row) => sum + (row.actualFontEvidence?.unexpectedGenreMismatchRunCount ?? 0), 0),
    referenceGenreMismatchRunCount: results.filter((row) => row.referenceOnly).reduce((sum, row) => sum + (row.actualFontEvidence?.genreMismatchRunCount ?? 0), 0),
    candidateGenreUnclassifiedRunCount: results.filter((row) => !row.referenceOnly).reduce((sum, row) => sum + (row.actualFontEvidence?.unexpectedGenreUnclassifiedRunCount ?? 0), 0),
    referenceGenreUnclassifiedRunCount: results.filter((row) => row.referenceOnly).reduce((sum, row) => sum + (row.actualFontEvidence?.genreUnclassifiedRunCount ?? 0), 0),
    domFontStabilityMismatchCount: results.reduce((sum, row) => sum + (row.domFontStabilityMismatchCount ?? 0), 0),
    limitation: "Pre/post-render CSS.getPlatformFontsForNode is a DOM font-state check only; image-level Preview versus PNG/WebP fidelity is reported separately.",
    missingPlatformFontRunCount: results.reduce((sum, row) => sum + (row.actualFontEvidence?.missingPlatformFontRunCount ?? 0), 0),
    cases: results.map((row) => ({ id: row.case?.id, stage: row.case?.stage, master: row.case?.master, fontSet: row.case?.fontSet, name: row.case?.name, nameLang: row.case?.nameLang, jobMark: row.case?.jobMark, pass: row.pass, reportPath: row.reportPath, error: row.error ?? null })),
  };
  await writeFile(path.join(evidenceRoot, outputName), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ report: path.relative(root, path.join(evidenceRoot, outputName)), browser: version.Browser, caseCount: report.caseCount, passCount: report.passCount, failCount: report.failCount, systemFallbackRunCount: report.systemFallbackRunCount, missingPlatformFontRunCount: report.missingPlatformFontRunCount }, null, 2));
  if (failedCases.length) process.exitCode = 1;
} finally {
  client.close();
}

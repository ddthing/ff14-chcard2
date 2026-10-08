import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPhase302JobMarkCases,
  buildPhase302NameAlternativeCases,
  buildPhase302OpacityCases,
  buildPhase302PlacementCases,
  buildPhase302SizeSweepCases,
} from "./phase302-qa-cdp.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(root, "docs", "qa", "phase302-jobmark-correction");
await mkdir(evidenceRoot, { recursive: true });

const plans = [
  {
    file: "qa-cases-job-matrix.json",
    schema: "phase302-jobmark-matrix-plan-v1",
    stage: "phase302-jobmark-matrix",
    purpose: "Required eight-job × three-master × A/B/C comparison. Same canonical name, card data, image crop, and ratio within each job/master variant triplet.",
    cases: buildPhase302JobMarkCases(),
  },
  {
    file: "qa-cases-family-strength.json",
    schema: "phase302-family-strength-plan-v1",
    stage: "phase302-family-strength",
    purpose: "Full-card RDM family-strength controls at 100/75/60/45 percent. These are QA comparisons; no production strength is selected.",
    cases: buildPhase302OpacityCases(),
  },
  {
    file: "qa-cases-fankit-size-sweep.json",
    schema: "phase302-fankit-size-sweep-plan-v1",
    stage: "phase302-fankit-size-sweep",
    purpose: "AST 76px Fan Kit full-icon PNG2x sweep at 6/8/10/12/14/16/18 logical px plus the registry's 15.2px safe ceiling, measuring edge quality and the largest clean tested size.",
    cases: buildPhase302SizeSweepCases(),
  },
  {
    file: "qa-cases-retained-name-alternatives.json",
    schema: "phase302-retained-name-alternatives-plan-v1",
    stage: "phase302-retained-name-alternative",
    purpose: "Supplementary retained-serif name variants only: C2 S3 and E2 S4, each across A/B/C, with Phase302 common S1 body typography unchanged. This six-case retention comparison is not a new font rescreen or winner selection.",
    cases: buildPhase302NameAlternativeCases(),
  },
  {
    file: "qa-cases-e2-placement.json",
    schema: "phase302-e2-placement-plan-v1",
    stage: "phase302-placement-comparison",
    purpose: "Paired E2 placement references for B/C: unique job-row baseline references and RDM-neighbor/offset cases. Each variant shares fixture and image-crop comparison groups across both placements.",
    cases: buildPhase302PlacementCases(),
  },
];

for (const plan of plans) {
  const manifest = {
    schema: plan.schema,
    stage: plan.stage,
    route: "/",
    colorScheme: "dark",
    viewport: { width: 1440, height: 1120, deviceScaleFactor: 1 },
    purpose: plan.purpose,
    caseCount: plan.cases.length,
    cases: plan.cases,
  };
  await writeFile(path.join(evidenceRoot, plan.file), JSON.stringify(manifest, null, 2) + "\n");
}

console.log(JSON.stringify({
  evidenceRoot: path.relative(root, evidenceRoot),
  plans: plans.map(({ file, stage, cases }) => ({ file, stage, caseCount: cases.length })),
  totalCases: plans.reduce((sum, plan) => sum + plan.cases.length, 0),
}, null, 2));

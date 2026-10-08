import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const dir = 'docs/qa/phase303-job-lock';
const readJson = async name => JSON.parse(await readFile(`${dir}/${name}`, 'utf8'));
const rows = [];
for (const name of await readdir(`${dir}/raw`)) {
  if (!name.endsWith('.json')) continue;
  const row = await readJson(`raw/${name}`);
  if (row.schema === 'phase303-production-card-case-v1') rows.push(row);
}
const exports = rows.flatMap(row => row.exports);
const errors = [];
for (const asset of [...rows.map(row => row.preview), ...exports]) {
  const bytes = await readFile(`${dir}/${asset.path}`);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== asset.sha256) errors.push(`hash: ${asset.path}`);
  const info = await sharp(bytes).metadata();
  const expected = asset.pixelDimensions ?? asset.dimensions;
  if (info.width !== expected.width || info.height !== expected.height) errors.push(`dimensions: ${asset.path}`);
}
const performance = await readJson('performance-final.json');
const baseline = await readJson('performance-baseline.json');
const geometry = await readJson('geometry-audit.json');
const boundaries = await readJson('protected-boundary-report.json');
const explorations = await readJson('explorations-after.json');
const viewer = await readJson('viewer-responsive-qa.json');
const bundleHits = [];
let bundleFiles = 0;
async function scan(dirPath) {
  for (const entry of await readdir(dirPath, { withFileTypes: true })) {
    const file = `${dirPath}/${entry.name}`;
    if (entry.isDirectory()) await scan(file);
    else if (/\.(js|css|html)$/.test(file)) {
      bundleFiles++;
      if (/__PHASE303_QA__|phase303-qa|QAFont-/u.test(await readFile(file, 'utf8'))) bundleHits.push(file);
    }
  }
}
await scan('.next/static'); await scan('.next/server/app');
const verification = {
  recordedAt: new Date().toISOString(), productionBuildId: (await readFile('.next/BUILD_ID', 'utf8')).trim(),
  commands: { typecheck: 'PASS', lint: 'PASS, 0 warnings', test: '233/233 PASS', build: 'PASS' },
  captureCount: rows.length, passingCaptureCount: rows.filter(row => row.checks.pass).length,
  exports: exports.length, verifiedAssetCount: rows.length + exports.length, assetErrors: errors,
  strictGeometry: { pass: geometry.passCount, fail: geometry.failCount },
  geometryDisposition: geometry.geometryDispositionSummary,
  protectedBoundaryPass: boundaries.protectedBoundaryPass, previousExplorationsUnchanged: explorations.comparison.exactMatch,
  viewerPass: viewer.pass, bundleScan: { files: bundleFiles, qaMarkerHits: bundleHits },
  jobAssetUrlsAdded: performance.newJobAssetUrls,
  performance: performance.comparison,
};
await writeFile(`${dir}/production-verification.json`, JSON.stringify(verification, null, 2));
const perfRows = Object.keys(performance.summary).map(f => {
  const b = baseline.summary[f], p = performance.summary[f], delta = performance.comparison[f];
  return `| ${f} | ${b.png2xMedianMs.toFixed(1)} → ${p.png2xMedianMs.toFixed(1)} ms | ${delta.png2xChangePercent.toFixed(1)}% | ${b.previewMedianMs.toFixed(1)} → ${p.previewMedianMs.toFixed(1)} ms | ${delta.previewChangePercent.toFixed(1)}% |`;
}).join('\n');
const report = `# Phase 3.0.3 — Job Identity production lock

Production 적용 완료: **C2 = C 발전 / E2 = B 발전 / I3 = C 발전**. Typography winner는 선택하지 않았다. 현재 production typography mapping과 기존 Phase301/302 후보 자료를 보존했다.

[최종 Master 보드](14-final-master-board.png) · [반응형 비교 뷰어](comparison.html) · [원본 크기 상세 보드](15-source-detail.png)

## 적용 결과

| 항목 | 결과 |
|---|---|
| C2 | 상단 Job mark를 제거하고, 하단 첫 정보 항목에 열린 brass seal + 전체 Job 이름 + 약어를 묶었다. 기존 약어의 display font/weight/tracking을 유지했다. 새 구분선은 추가하지 않았다. |
| E2 | 대형 약어의 위치·크기·잉크 재질을 유지했다. 종이 정보 열의 Job 이름 옆에 얇은 인쇄형 프레임과 완전한 아이콘을 배치했다. 작은 약어를 반복하지 않는다. |
| I3 | 문양만 담는 옅은 배지를 전체 Job 이름/약어 옆에 배치했다. 최종 검토 후 배지 여백을 줄이고 문양을 warm ink로 선명하게 했다. Level은 독립 열이다. |
| Glyph / container | Glyph는 중앙 optics metadata의 ratio별 source 예산을 사용한다. 외부 seal/frame/badge 크기는 각 Master CSS에서 독립 관리한다. source 종류에 따라 외부 레이아웃을 바꾸지 않는다. |
| 숨김 / fallback | 기존 Job 표시 설정을 유지한다. I3 아이콘을 숨기면 빈 배지나 빈 열이 남지 않는다. BST의 실제 generic L을 같은 컨테이너 안에 작게 표시하고 이름/약어가 의미를 보완한다. |

## Job / source 검증

| Job | 실제 source | 결과 |
|---|---|---|
| RDM | XIVAPI SVG | 세 Master에서 전체 문양, 이름, 약어 확인 |
| DRG | XIVAPI SVG | 세로형 문양의 전체 실루엣과 동일 컨테이너 확인 |
| GNB | XIVAPI SVG | 밀도 높은 문양 및 Alexander/EN·KO·JA 긴 이름 확인 |
| WHM | XIVAPI SVG | 가느다란 문양을 늘리거나 왜곡하지 않고 유지 |
| BLM | XIVAPI SVG | 조밀한 문양이 같은 크기 규칙 안에서 동작 |
| AST | 76px Fan Kit | 세 Master × 다섯 비율 × PNG 1x/2x/4x 확인 |
| RPR | HQ raster | 동일 외부 구조, PNG 세 배율과 WebP 2x 확인 |
| BST | Generic fallback | 실제 L + 전체 이름/약어, 동일 외부 구조 확인 |

63개 고유 production 카드 캡처와 99개 export를 생성했다. 마지막 I3 보정 이후 해당 21개 카드/33개 export를 재생성했다. 현재 파일 162개(preview 63 + export 99)의 SHA-256과 실제 이미지 크기를 다시 검증했다.

5개 비율: 1:1, 4:5, 3:4, 9:16, 16:9. EN/KO/JA canonical Job 이름을 사용한다. C2의 긴 일본어 ガンブレイカー는 두 줄, GNB는 그 아래에 배치된다. 정보 누락·겹침·잘림은 없으며 한 줄로 줄이기 위한 font 변경은 하지 않았다.

## Export / source 제한

같은 ratio의 logical composition은 Preview/PNG 1x·2x·4x/WebP 2x에서 유지된다. Glyph 경로, stroke, 원본 파일, resolver 우선순위는 변경하지 않았다. 프레임은 CSS이고 추가 이미지 요청을 만들지 않는다.

| Ratio | 요청 4x의 실제 출력 | Glyph logical slot 상한 |
|---|---:|---:|
| 1:1 | 4320 × 4320 | 7.60px |
| 4:5 | 4195 × 5243 | 7.82px |
| 3:4 | 4062 × 5416 | 8.08px |
| 9:16 | 3517 × 6252 | 9.33px |
| 16:9 | 6253 × 3517 | 7.77px |

기존 export 엔진의 22MP 상한 때문에 1:1을 제외한 4x 요청은 제한된다. 15.2px를 production 상수로 사용하지 않았다. 76px 원본 예산을 실제 출력 배율로 나누고, 반응형 cqi로 변환한다. 실제 export 함수와의 일치 여부를 테스트한다.

51개의 원본 픽셀 crop을 담은 15번 보드에서 SVG/HQ raster/Fan Kit/generic 및 AST의 5개 비율 4x를 비교했다. 문양은 잘리지 않으며, AST에 확대 때문에 생기는 뚜렷한 흐림/계단 증폭은 보이지 않는다. 다만 작은 preview에서 미세한 문양 자체의 판독성은 제한된다. 컨테이너·직업명·약어가 식별을 보완한다. 고해상도 Fan Kit 업그레이드는 여전히 source debt다. 전체 34개 Job의 source 목록은 조사했으나 이번 실제 카드 검증은 지정된 8개 Job 범위다. 자세한 계산은 [SOURCE-QUALITY.md](SOURCE-QUALITY.md)에 있다.

## Geometry 판정

새 Job Identity block/문양/직업명의 containment는 63개 모두 통과했다. 전체 typography까지 검사한 엄격한 원시 결과는 61 PASS / 2 FAIL이며 이를 숨기지 않았다. 두 건은 **E2 16:9의 기존 대형 RDM/AST 장식 약어** line box가 기존 motif overflow 영역을 넘는 경우다. 수정 전 frozen source 렌더에서도 정확히 같은 18.406px crop을 확인했다. 새 아이콘 clipping과 구분하며 production 대형 typography는 보호했다. 근거: [geometry-audit.json](geometry-audit.json), [baseline-decoration-proof.json](baseline-decoration-proof.json).

## 성능

같은 Chrome/production QA route에서 family별 warm-up 1회 후 5회 측정한 중앙값이다. 템플릿을 매번 바꾸고 font/image/optical readiness까지 기다린다. 실행 간 차이는 측정 변동을 포함하며 성능 향상을 보장하는 수치로 해석하지 않는다.

| Family | PNG 2x 전 → 후 | 변화 | Preview 전환 전 → 후 | 변화 |
|---|---:|---:|---:|---:|
${perfRows}

지속 15% 회귀 없음. RDM family 전환에서 새 Job asset URL 요청 0개. 원시 측정은 performance-baseline.json / performance-final.json.

## 최종 검사 / 보호 범위

- npm run typecheck: PASS
- npm run lint: PASS, 경고 0
- npm test: **233 / 233 PASS** (기존 231 + 추가 2)
- npm run build: PASS. Production route에 QA 페이지 없음.
- Production JS/CSS/HTML ${bundleFiles}개에서 QA API/route/font marker 0개.
- 이전 Phase301/302 파일·도구 **3,515개 byte-identical**.
- source 변경은 Master TSX/CSS 6개 + optics module 1개다. Typography resolver, crop, material, export architecture, store, icon resolver, Editor와 marketing layout/motion은 그대로다.
- 사용자 추가 승인으로 누락된 옛 샘플 사진 3개를 새로 제작해 기존 URL을 복구했다. 원본 복원이 아닌 대체 이미지다. [기록](LEGACY-ASSET-REPLACEMENTS.md). 현재 Coner 사진은 그대로다.
- 반응형 비교 뷰어: 실제 661px/390px viewport에서 가로 넘침 없음, 카드 표시 폭 612px/345px, 실제 이미지 로드 확인.

## 보드

01–03 family별 최종 카드, 04–08 RDM/DRG/GNB/WHM/BLM, 09 source classes, 10 ratios, 11 export scales, 12 KO/EN/JA, 13 Before/After, 14 최종 Master, 15 source detail.

13번 보드는 보존된 Phase302 QA 후보와 새 production을 비교한다. Phase302 후보 typography/혼합 이름과 현재 production typography/이름 차이는 caption에 명시했다. Job Identity만 같은 데이터로 비교한 실험으로 오인하지 않도록 구분한다.

Typography 최종 선택과 marketing snapshot/live presentation 갱신은 다음 Phase에 남긴다.
`;
await writeFile(`${dir}/REPORT.md`, report);
console.log(JSON.stringify({ cases: rows.length, exports: exports.length, assetErrors: errors, bundleFiles, bundleHits }));
if (errors.length || bundleHits.length || rows.some(row => !row.checks.pass)) process.exitCode = 1;

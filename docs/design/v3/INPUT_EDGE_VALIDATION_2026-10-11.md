# 사진·입력 경계 순차 검증

검증 시작 2026-10-11, 최종 확인 2026-10-12. 사용자가 요청한 항목별 수정 → 빌드 → 실제 화면·파일 → 독립 검토 순서를 따른다. 앱 UI 기준은 루트 `DESIGN.md`, 카드 작품은 V3 계약이다. 설치 Stone 테마 원본과 데이터·단일 렌더/출력 경로를 유지한다. 사용자 origin 4322의 초안·보관함은 건드리지 않고 별도 4324 origin의 QA 프로젝트로 실행했다.

## 1. 사진 업로드·복원

저장소의 예시 사진으로 만든 JPEG 2160×3840, 1,037,733 bytes를 실제 파일 선택 UI로 업로드했다. 앱이 정규화한 JPEG는 1440×2560, 489,344 bytes다. 새로고침과 `QA Uploaded JPEG 2026-10-11` 프로젝트 다시 열기에서 사진의 전체 해시·치수·파일명 표시와 카드 필드·locale·appearance가 유지됐다. 원본과 정규화 사진 모두 Sharp 전체 decode를 통과했다.

처음에는 도구가 긴 data URL을 200,000자에서 잘랐는데 이를 실제 사진으로 잘못 비교했다. 이 판단을 철회하고 `truncated-tool-transfer*`/`truncated-transfer*` 파일은 실패한 전송 증거로 보존했다. DOM의 전체 길이 652,483자를 100,000자씩 나누어 읽어 다시 합친 결과, 길이·정규 base64·전체 decode·해시가 일치했다. 마스크가 사진 URL을 바꾼다는 판단도 철회했다.

- JPEG binary SHA-256: `af98cc2802931f3a022a6ff52e7a202df1c870a76dd84c3a767aae041269d079`
- 전체 data URL text SHA-256: `60f5b1b36e8d13212449526a5f7fccdd71d57c0aa754ad6fc1e14a6ec24cbef9`
- 근거: `tmp/input-validation-2026-10-11/verified-photo-proof.json`, `verified-normalized-upload.jpg`, `verified-upload-reload.json`, `verified-upload-project-restore.json`.

파일 선택 도구 호출에 643초가 걸렸다. 앱 이미지 처리 시간으로 해석하지 않는다. 실제 파일 선택 검증은 JPEG 한 건이며, PNG·WebP·EXIF 방향·24MiB 경계·손상/빈/미지원 파일 fixture는 준비했지만 실제 선택으로 실행하지 못했다. 해당 처리·오류·취소·정리 경로의 synthetic `image-processing`/`upload-session` 테스트는 21개 통과했다. 이 결과를 실제 기기 파일 선택 통과로 확대하지 않는다. 사진 검토와 정정은 `tmp/persistence-validation-2026-10-11/independent-review.md`에 기록했다.

## 2. 자유부대 이름 48자

JA 48자 입력에서 Editorial 4:5 값 box가 약 91px로 늘어나 약 29px 행과 다음 구획선을 침범했다. `fc-48-before.json`/`fc-48-before.jpg`에 수정 전 상태를 보관했다.

FC 값에만 실측 fitter를 적용했다. 원문을 보존하고 기존 CSS의 최대 크기부터 최소 크기까지 가장 큰 적합 크기를 찾는다. 기존 최소값 `.84cqi`/가로형 `.5cqi`를 사용하며 새로운 색·반경·서체 토큰을 만들지 않았다. 폰트 로드, 행 크기, locale·비율·타입 preset·FC 원문, 다른 정보의 폰트 선택 입력과 이름의 display script 변화에 재측정한다. 측정 준비 marker를 기존 export readiness 경로에서 기다린다.

- 화면 50조건: KO/EN/JA × 5비율 × 한자48/Latin W48/짧은 `Ember Bloom`의 45조건과 KO 한글48의 5조건. 모두 준비 완료·행 안 포함·기존 최소/최대 안의 크기를 확인했다. 짧은 값 15조건은 기존 authored 크기를 유지했다.
- 실제 출력 9개: JA 한자48 PNG 1× 5비율, JA 4:5 PNG/WebP 4×, EN W48 16:9 PNG 1×, EN 짧은 FC 4:5 PNG 1×. 원본 전체 decode·형식·치수·bytes·SHA-256와 선택한 원본의 글자/구획선 분리를 확인했다. 4× 4:5는 상한에 맞춘 4195×5243이다.
- 같은 mounted 화면에서 긴 값→짧은 값은 기존 최대 크기로 복귀하고, 빈 값은 FC 행/marker를 제거했다.
- JA 총사령부를 지우고 되돌리면 같은 FC 원문·행 크기에서 정보 font family와 fitted size가 바뀌고 다시 복귀했다.
- EN 정보에서 이름 Latin→Japanese→Latin은 fallback family가 바뀌고 복귀했다. W는 공통 첫 DM Sans face를 사용하므로 실제 크기는 같았다. glyph metrics 변화가 있었다고 주장하지 않는다.
- 일반 빌드에서도 W48 PNG 1× 결과가 1080×1350으로 완료했고 console warning/error가 없었다.

근거는 `tmp/input-validation-2026-10-11/fc-fit-runs.json`, `fc-export-runs.json`, `fc-captures/manifest.jsonl`, `fc-edit-transitions.json`, `fc-font-context-transition.json`, `fc-latin-fallback-transition.json`, `fc-normal-export-smoke.json`이다. 독립 검토 `independent-fc-review.md`는 UI 허용 48자 범위에서 통과 판정했다. 48자를 넘는 imported/API 값은 최소 크기에도 넘칠 수 있어 통과 범위에 넣지 않는다.

## 3. 프로젝트 이름

저장 API는 80 Unicode code points를 허용하지만 세 입력창은 native `maxLength=80`으로 UTF-16 code units를 제한했다. 이모지 41개를 실제로 타이핑하면 40개만 남는 결함을 확인했다. 근거는 `project-emoji-limit-before.json`이다. 공통 80-code-point 입력 제한을 저장 검증과 함께 사용하도록 수정하며 저장 스키마·정규화 정책은 유지한다.

세 입력창의 native UTF-16 제한을 제거하고 공통 `limitProjectName`을 적용했다. 실제 타이핑에서 이모지 41개·80개가 유지되고 81번째는 추가되지 않았다. 80개 이름으로 저장한 프로젝트는 새로고침 후 80 code points/160 code units 그대로였다. BMP 80개에서 추가 입력은 제한됐고, ASCII40+이모지41 혼합 값은 80 code points/120 code units로 제한됐다. 최초 ASCII 타이핑 호출은 도구 deadline에 걸려 실제 80개 상태를 확인한 뒤 추가 한 글자를 다시 입력해 제한을 확인했다.

이름 변경 입력도 이모지 80개에 추가 입력이 제한됐다. 혼합 80자 이름으로 변경·저장 후 새로고침에서도 원문을 유지했다. 세 번째 ‘저장 후 열기’ 입력은 이모지81→80 제한을 확인하고 취소했다. 해당 폼의 저장 제출까지 실행했다고 주장하지 않는다. 검수 프로젝트는 `QA Unicode Boundary 2026-10-12`로 다시 이름을 바꿨고 QA 카드도 원래 프로젝트로 복원했다.

근거는 `project-name-emoji-after.json`, `project-name-save-reload-and-boundaries.json`, `project-name-rename-boundary.json`, `project-name-switch-boundary.json`이다. 의미 있는 BMP·이모지·혼합 입력 회귀를 포함한 project-library 테스트 7개가 통과했다. 글자 수는 저장 계약과 동일한 Unicode code points이며, 합성 emoji를 grapheme 하나로 세는 정책으로 변경한 것은 아니다.

독립 검토 `independent-project-name-review.md`도 현재 80-code-point 계약에서 통과 판정했다. 복사 이름 suffix helper의 기존 상수 80은 현재 정책과 일치하지만, 향후 한도 변경 시 함께 갱신해야 한다는 비차단 유지보수 의견을 기록했다.

## 최종 검사

`tmp/input-validation-2026-10-11/final-build.log`, `final-typecheck.log`, `final-lint.log`, `final-tests.log`에서 일반 프로덕션 빌드·타입·전체 ESLint·전체 테스트 통과를 확인했다. 테스트는 259개 통과, 기존 archive 29개 skip, 실패 0개다. 변경 파일 범위의 diff whitespace 검사도 통과했다. src/out/dist 검색에서 검수용 export endpoint·환경 플래그·타이머는 남아 있지 않다. 원본 Stone SHA-256은 `E25912D9A98152C90EC17352DBE22A6573928522063C807DDD3CCDA906C55F92`로 유지됐다.

## 검증 경계

검수용 export 수집 hunk는 제품 소스에서 제거했다. FC 원본 9개는 별도 loopback QA collector가 생성 Blob bytes를 보관한 결과이며, 9번의 실제 OS 다운로드를 확인했다고 표현하지 않는다. 일반 빌드의 결과 이미지 치수 확인을 별도로 기록했다. 전체 브라우저·모든 기기·OS 동작 줄이기·인쇄/PDF는 이 기록의 범위가 아니다. portable brain 파일/CLI가 이 checkout에 없어 해당 시스템에 기록했다고 주장하지 않는다.

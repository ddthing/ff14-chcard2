# 디자인 계약 순차 검증·수정

2026-10-11 사용자의 “하나씩 확인하고 수정된 것 검증 후 계속 진행” 지시에 따라 한 항목의 수정·실측·검토가 통과하기 전에는 다음 항목을 수정하지 않는다. 기준은 루트 DESIGN.md이며 원본 Stone 테마, 카드 작품, 저장·출력·appearance 경계를 유지한다.

## 1. 모바일 언어 선택 높이: 통과

- 홈용 마케팅 헤더와 에디터 앱 헤더의 실제 select 최소 높이를 40px에서 44px로 수정했다. 기존 8px 반경 토큰과 locale/appearance 기능은 유지했다.
- 브라우저: 두 헤더 × KO/EN/JA × 390/320px = 12개 조합. 모든 select가 실제 112×44px, 반경 8px로 계산되며 가로 넘침이 없다.
- 네비게이션·locale 기존 테스트 9개와 프로덕션 빌드 통과. 독립 소스 검토에서도 cascade와 locale 핸들러의 변경을 발견하지 않았다.
- 증거: `tmp/strict-design-2026-10-11/step-01-runtime.json`, `step-01-tests.log`, `step-01-build.log`.

## 2. 보조 UI 글자 12px 최소: 통과

- 에디터 문서 레이블 10px, 저장 상태 11px, 보관창 레이블 11.84px와 메타데이터 11.52px, 툴팁 11.2px를 12px로 수정했다. 모바일 설정 레이블과 사이트 출처도 12px 최소를 적용했다.
- 사이트 출처에만 `data-attribution-variant='site'`를 부여했다. 카드 branch와 기존 card base를 유지했으며 같은 viewport에서 카드 출처 글자의 계산 값은 전후 모두 5.26677px였다.
- 실제 에디터 header 12px, 기본 dialog label 12px, 저장한 QA 프로젝트 metadata 12px, 키보드로 표시한 툴팁 12px를 확인했다. 두 헤더 × KO/EN/JA × 390/320px의 추가 12개 조합에서 실제 표시 레이블 12px 최소와 넘침 없음이 통과했다.
- PostCSS parsing·scoped diff check·프로덕션 빌드·독립 소스 검토 통과. aria-hidden wordmark, 비율 도형과 체크 글리프는 작품/기하로 구분해 유지했다.
- 증거: `step-02-before.json`, `step-02-runtime.json`, `step-02-build.log`.

## 3. 페이지·섹션 제목 크기: 통과

- 템플릿의 desktop 72px 제목을 32–44px band로 정리했다. 사진·출력 페이지의 유효한 desktop 크기는 보존하고 작은 화면의 32px 최소를 적용했다. 홈 표시 제목, sr-only 제목과 카드 작품은 유지했다.
- 실제 사진·출력·에디터·보관창 UI 섹션 제목은 18px/650, 목록 제목은 14px/650으로 정리했다.
- 4개 화면 × KO/EN/JA × 1440/390/320px = 36개 조합에서 제목 크기와 가로 넘침 검증 통과. 에디터 정보·디자인 패널의 실제 heading, 보관창 제목 18px와 목록 제목 14px를 별도로 확인했다.
- 독립 검토에서 샘플 옵션 제목 12px/normal이 추가 발견돼 이 단계 안에서 14px/650으로 수정하고 3언어 × 3폭의 9개 조합을 재검증했다. 해당 수정 전에는 다음 단계로 이동하지 않았다.
- PostCSS parsing·scoped diff·프로덕션 빌드·독립 재검토 통과. 증거: `step-03-before.json`, `step-03-runtime.json`, `step-03-panels.json`, `step-03-samples.json`, `step-03-build.log`.

## 4. 정보 선택 지우기 조작 영역: 통과

- 실제 정보 패널의 다섯 36×36px 지우기 버튼을 44×44px로 수정했다. 입력 text reserve와 기존 mobile offset을 함께 조정해 화살표·텍스트와 별도 공간을 확보했다.
- KO/EN/JA × 1440/390/320px의 9개 조합에서 크기, 필드 내부 포함, 화살표·텍스트와의 겹침 없음, 가로 넘침 없음을 확인했다.
- 실제 직업 지우기 후 값이 비고 popover가 열리지 않음을 확인하고 실행 취소로 원래 ‘적마도사’ 값을 복원했다. picker JS·스키마·기존 900/901px 전환은 바꾸지 않았다.
- PostCSS parsing·scoped diff·프로덕션 빌드·독립 source review 통과. 증거: `step-04-runtime.json`, `step-04-action.json`, `step-04-build.log`.

## 5. 모서리 토큰: 통과

- 툴팁 8px와 에디터의 focus/sample/ratio·zoom label pill 값을 `--radius-md`로 정리했다. 내비게이션 표시와 icon wrapper, native color swatch의 내부 CSS는 `--radius-sm`을 사용한다.
- 실제 툴팁과 hint·예시·배율 label은 8px, 내비게이션 pseudo-element는 0/6/6/0px, icon wrapper는 6px였다. native color input의 외곽은 기존 8px token을 유지한다. Chromium의 해당 pseudo-element 계산 조회는 host 값을 반환하므로 내부 swatch 6px는 source/cascade 검증으로 구분해 기록한다.
- 카드 안전 guide 2px를 실제로 켰다 끄며 보존을 확인했다. 비율 그림 1/2/4px, 원형 기호·thumb·spinner, switch와 sheet handle은 기능 기하로 보존했다. QA palette mode를 잠시 바꾼 뒤 실행 취소로 원래 자동 모드를 복원했다.
- `.bottomRatio select`는 현재 JS가 렌더하지 않아 수정 대상에서 제외했다. `.pickerInlineSelect select`의 옛 base는 후속 token rule에 덮인다. 이런 inactive/overridden 선언을 실제 수정 완료 항목으로 계산하지 않았다.
- PostCSS parsing·scoped diff·프로덕션 빌드·독립 source review 통과. 증거: `step-05-runtime.json`, `step-05-build.log`.

## 6. 모션 시간·이징: 통과

- 템플릿 진입의 고정 520/440/560ms를 기존 default 420ms token으로 정리했다. 보관창 전환은 fast160, 에디터의 micro는 fast160, ui/panel은 ui240에 연결했다. transform/진입의 이징은 기존 editorial cubic-bezier(0.22,1,0.36,1)를 재사용한다.
- 에디터 WAAPI 효과는 기존 MOTION_DURATION.fast와 MOTION_EASE.editorial 상수를 사용한다. `prefers-reduced-motion` early return과 animation.cancel cleanup은 유지했다.
- 브라우저의 일반 모션 환경에서 실제 버튼 160ms, 홈 카드 transform 240ms, 템플릿 header/tools/gallery 진입 420ms와 이징을 확인했다. WAAPI 시간은 source/constants 및 타입 검사로 검증했으며 고해상도 재생 시간/FPS를 실측했다고 주장하지 않는다.
- 기능성 700/800ms loader, tooltip leave delay 등 행동 timer, 카드 작품과 신규 spring/무한 장식/공통 route fade는 변경하지 않았다. 템플릿의 기존 preview-only root 진입 효과는 기존처럼 화면에만 적용되며 출력 renderer 경로·데이터는 변경하지 않았다.
- PostCSS parsing·scoped diff·typecheck·전체 lint·전체 테스트·프로덕션 빌드·독립 검토 통과. 전체 테스트는 252개 통과, archive 29개 skip, 실패 0이다. 증거: `step-06-runtime.json`, `step-06-build.log`, `tests.log`, `typecheck.log`, `lint.log`.

## 7. 동작 줄이기 대응: 승인된 검증 범위 완료

- 홈의 줄이기 전용 CSS에서 inactive rear card를 숨기고 선택 카드만 같은 중심 위치에 표시하도록 보완했다. 큰 자리 교환을 보이는 대신 정면 카드를 교체하고, 세 hover 화살표의 이동도 없앤다. normal rules·DOM·ARIA·중앙 geometry는 그대로다.
- CSS parsing·preference scope·scoped diff·프로덕션 빌드·독립 검토는 통과했다. KO/EN/JA × light/dark × 14개 실제 분기/화면 크기의 일반 모션 84개 조합에서 세 카드 표시, 240ms transition, 중앙 카드 포함, 제작 버튼 가시성과 넘침을 재확인했다. 증거: `step-07-normal-regression.json`, `step-07-build.log`.
- 현재 브라우저의 `prefers-reduced-motion: reduce`는 false이며, 제공되는 제어 기능은 visibility와 viewport뿐이다. OS preference emulation은 지원되지 않는다. 줄이기 branch와 CSS global override, loader 정지, template instant scroll, WAAPI guard/cleanup은 source에서 확인했지만 실물 reduce 상태를 검증했다고 주장하지 않는다.
- 2026-10-11 사용자가 “일반 모션·소스 검증까지 진행”을 선택해 이 단계의 완료 범위를 승인했다. 해당 범위의 수정·빌드·독립 검토와 일반 모션 84개 조합 검증을 완료했다. OS 동작 줄이기가 켜진 실물 검증은 수행하지 않았으며, 실물 reduce 검증까지 통과했다는 의미가 아니다.

## 보존과 검증 범위

원본 Stone SHA-256 `E25912D9A98152C90EC17352DBE22A6573928522063C807DDD3CCDA906C55F92` 유지. 카드 credit·renderer 내부 typography·palette·XIVAPI 원본·store/history/schema/export 경로·사용자 appearance는 변경하지 않았다. 실제 제어·저장·Undo와 locale/theme 전환은 별도 origin의 QA 데이터에서 검증했다. 이미지 내보내기 전체 조합과 OS forced-colors 실행은 재검증했다고 주장하지 않는다.

이 checkout에는 portable brain의 memory/protocol/tools 경로가 없어 해당 CLI로 기록을 남겼다고 주장하지 않는다. 이 문서와 단계별 JSON/log가 순차 검증 기록이다.

# 저장·복원 순차 검증

2026-10-11. 이미지 출력의 두 결함을 수정하고 독립 검토로 닫은 뒤 저장·복원을 검증했다. 실제 화면은 별도 `127.0.0.1:4324`이며 사용 중인 4322의 데이터는 변경하지 않았다.

**현재 판정: 검증한 범위에서 통과.** 독립 검토가 실제 before/after JSON·history·프로젝트 복원·최종 log 및 두 수정의 source/test를 확인했다. 근거는 `tmp/persistence-validation-2026-10-11/independent-review.md`다.

## 실제 화면 검증

- 편집기를 새로고침해 캐릭터명·직업·레벨·서버·데이터센터·종족·부족·자유부대·비율·마스터·사진 URL/위치/확대 및 JA/dark 표시 상태가 동일함을 확인했다.
- `QA Persistence 2026-10-11` 프로젝트를 저장하고 초안 이름을 변경했다. 다시 열기 확인을 취소했을 때 변경한 초안을 유지했다. 이후 교체를 선택했을 때 원래 프로젝트의 위 정보와 사진·설정이 동일하게 복원됐다.
- 이름 편집 → 실행 취소 → 다시 실행 → 원본 복귀를 실제 버튼으로 검사했다. undo는 저장 원본과, redo는 편집 상태와 동일했다.

근거: `tmp/persistence-validation-2026-10-11/reload.json`, `project-restore.json`, `history.json`.

## 1. 지운 부족이 다시 채워지는 결함: 수정·실물 재검수 완료

수정 전에는 지우기 직후 부족 input이 비고 렌더된 부족 필드도 없어졌지만, 새로고침하면 `デューンフォーク`가 되살아났다. 예시 기반 카드의 normalization이 기본값을 다시 넣는 문제였다.

`src/store/editor-persistence.ts`에서 own `clan: ''`와 own `clanId: null`이 모두 있으면 명시적 지우기로 취급한다. 두 필드가 없거나 한쪽만 있는 과거 형식은 기존 fallback을 유지한다. 유효한 label→ID 정규화, 호환되지 않는 race/clan 정리, 새 사용자 프로필의 빈 값 및 schema/version은 유지한다.

검증:

- 수정 후 지우기 → 새로고침에서 input은 계속 비고 부족 필드는 없어졌다. 나머지 사진·정보·설정도 동일했다.
- 빈 부족 프로젝트를 저장한 뒤, 부족이 있는 원본 프로젝트를 열고 다시 빈 프로젝트를 열어도 빈 값이 정확히 복원됐다.
- 일반 WebP 출력에서 부족 필드가 없는 live preview와 1080×1350 완료 bitmap을 확인했다. 이 추가 출력은 기존 이미지 출력 manifest의 파일 검사 건수에 합산하지 않는다.
- draft persist/load/hydrate와 프로젝트 save/get roundtrip, `migrated === false`, 세 가지 과거 누락 형태의 기본값 유지 테스트를 실행했다. Source 독립 검토 통과.

근거: `clan-clear-before-fix.json`, `clan-clear-after-fix.json`, `clan-project-restore.json`, `cleared-clan-export.json`, `clan-fix-build.log` 및 관련 store/project-library 테스트.

## 2. 카드 출처 metadata 비교 누락: 수정·소스/통합 테스트 완료

`profileOrigin`은 clone/serialize에 보존되지만 `sameCharacter()` 비교에서 빠져 있었다. 다른 데이터가 같은 카드에서 해당 marker만 바꾸면 `replaceCardData()`가 변경을 무시해 복원·history·저장을 건너뛸 수 있었다.

`src/store/editor-store.ts`의 scalar equality keys에 기존 `profileOrigin`을 포함했다. 다른 상태 처리·데이터 구조는 변경하지 않았다. 메모리 저장소 테스트에서 marker-only replacement, 이전 marker의 history snapshot, persist/load, undo/redo 양쪽 marker 복원을 확인했다. 해당 내부 값을 직접 전환하는 UI가 없어 이 사례를 실물 브라우저에서 직접 조작했다고 주장하지 않는다. 독립 source/test 검토 통과.

## 최종 확인

최종 일반 빌드·타입·전체 ESLint·전체 테스트 통과. 테스트는 257개 통과, 기존 archive evidence 29개 skip, 실패 0개다. 변경 파일 diff check 통과. 새 빌드의 실제 편집기에서 빈 값의 유지와 원본 프로젝트 복원을 다시 확인했으며, console warning/error는 없었다. `final-state.json`의 두 비교는 true다. 검사 종료 시 QA 초안을 원래 프로젝트로 복원했다. QA 보관함에는 두 검수용 프로젝트를 남겼다.

로그와 화면: `final-build.log`, `final-typecheck.log`, `final-lint.log`, `final-tests.log`, `final-editor-restored.jpg`. Stone 원본 SHA-256은 `E25912D9A98152C90EC17352DBE22A6573928522063C807DDD3CCDA906C55F92`로 유지했다.

이번 persistence 실물 사진은 예시 asset이다. 사용자가 올린 사진의 data URL·실제 파일·EXIF·24MB 경계와 장치별 저장 용량 제한은 후속 사진/입력 경계 검증 범위다. 검사하지 않은 브라우저·OS에서 저장을 보장한다고 쓰지 않는다.

이 checkout에는 portable brain memory/protocol/CLI가 없어 해당 시스템의 로그나 WORKSPACE를 갱신했다고 주장하지 않는다. 이 문서와 실제 JSON/log가 기록이다.

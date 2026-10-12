# B · Card Stage 구현과 검증

2026-10-11 사용자의 “B느낌이좋다” 선택에 따라 B 시안의 구도를 실제 홈에 적용했다. 앱 UI 계약은 루트 [DESIGN.md](../../../DESIGN.md)를 따른다.

## 원본과 구현

- Figma [데스크톱 B](https://www.figma.com/design/MqkXWfirWgjyyRbqGZjacF?node-id=93-688), [모바일 B](https://www.figma.com/design/MqkXWfirWgjyyRbqGZjacF?node-id=93-689)의 카드 무대·중앙 도크·하단 작업 영역을 적용했다.
- 세 카드의 실제 기존 renderer를 재사용한다. 카드 내부 정보·사진·XIVAPI 아이콘은 Figma 화면을 이미지로 덮거나 재작성하지 않는다.
- 세 카드 노드를 안정적인 key와 고정된 기본 폭으로 유지하고, 선택에 따라 외부 슬롯의 위치·회전·배율만 바꾼다. 선택마다 renderer를 새로 만들거나 fit 크기를 바꾸지 않는다.
- 중앙 카드 하나만 접근성 트리에 노출한다. 네이티브 스타일 버튼은 `aria-pressed`, 체크 표시, 유지되는 키보드 포커스로 선택을 전달한다. 만들기·비교 링크는 선택한 template을 전달한다.
- 모바일은 중앙 카드를 완전히 보여주고 뒤쪽 카드의 가장자리를 의도적으로 잘라 B의 중첩 구도를 유지한다. 최소 조작 높이는 44px이며 reduced-motion에서는 전환을 제거한다.
- 초안과 저장 폼은 하나의 Stone 작업 표면에 배치한다. 목록·상태·오류·확인 영역은 그 아래 전체 폭을 사용한다. 홈 전용 `stage` presentation만 추가했으며 에디터의 기존 프로젝트 대화상자는 기본 presentation을 유지한다.

## 테마와 보존 경계

원본 `src/app/shadcn-theme.css` SHA-256은 `E25912D9A98152C90EC17352DBE22A6573928522063C807DDD3CCDA906C55F92`로 변함없다. 앱 UI는 기존 의미 토큰을 직접 사용한다. 밝게·어둡게 모두 지원하며 사용자의 저장된 appearance 선호를 강제로 변경하지 않는다.

CardPreview·공유 renderer·이미지 출력, store·history·persistence와 기존 프로젝트 확인 흐름을 유지했다. 이 작업에서 이미지 내보내기 전체 행렬을 다시 실행했다고 주장하지 않는다.

## 실제 검증

- 전체 테스트: 281개 중 252개 통과, 29개 기존 archive 테스트 건너뜀, 실패 0.
- `npm run typecheck`, `npm run lint`, `npm run build` 통과. Next 정적 출력 생성 완료.
- 브라우저: KO/EN/JA × light/dark × 1440/1024/768/390/320px × 세 카드 선택 = 90개 조합 통과.
- 각 조합에서 실제 viewport, 가로 넘침, 중앙 카드 경계, 단일 main, 단일 선택, 후면 카드 접근성 숨김, 44px 조작 높이와 선택 template 링크를 확인했다. 모든 조합에서 선택 버튼 포커스와 초안 정보가 유지됐다.
- Enter 스타일 선택, 프로젝트 저장·목록 반영, 삭제 확인 취소·포커스 복귀를 실제 UI로 확인했다. 검증은 별도 localhost 4324의 fixture에서 진행했다.
- 에디터 프로젝트 대화상자의 기본 presentation 유지와 Escape 닫기·호출 버튼 포커스 복귀를 확인했다.
- 독립 소스 검토에서 renderer·저장·appearance 경계의 회귀를 확인하지 않았다.

브라우저 실측 결과는 `tmp/card-stage-2026-10-11/runtime-matrix.json`, 실행 로그와 데스크톱·모바일 화면 증거도 같은 디렉터리에 저장했다. 소스의 reduced-motion 분기를 확인했으며 OS 설정을 바꾼 브라우저 재현 검증은 수행하지 않았다.

## 실행 환경 기록

이 checkout에는 portable brain의 `memory/`, `protocols/`, `.agent/tools/` 및 로컬 design-md skill이 없어 관련 CLI를 실행하거나 메모리 기록을 남겼다고 주장하지 않는다. 작업 상태와 결과는 이 문서에 기록한다.

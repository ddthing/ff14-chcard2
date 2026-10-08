# 사용성 재설계 · 2026-10-08

사용자가 이전의 크기·여백 중심 개선을 거부하고 실제 사용성 개선을 요청했다. 이번 범위는 홈, 사진 시작, 편집기, 이미지 저장의 작업 흐름이다. 기존 V3 팔레트/폰트와 카드 렌더러·내보내기·store/history/persistence는 보존했다.

## 변경

- 홈의 세 칼럼 홍보와 반복 갤러리를 제거하고, 사진 시작 CTA·직접 스타일 선택·단일 미리보기를 한 화면에 구성. 실제 초안 재개를 상단에 배치.
- 사진 시작은 업로드 우선, 작은 샘플 선택, 실제 카드 프리뷰로 재구성. 의미 없는 2/4 단계 표시 제거. 기존 덮어쓰기 확인과 업로드 취소/오류 유지.
- 편집기는 136px 작업 전용 레일과 넓은 캔버스/인스펙터. 모바일 92px 툴바를 56px 한 줄로 축소하고, 확대·이동·초기화는 더보기로 이동.
- 사진 조절 슬라이더를 첫 화면에 노출. 반복 업로드/제목을 축소. 예시 업로드 배지를 카드 위에서 헤더로 이동.
- 더보기는 화면 안에 중앙 정렬. Escape는 메뉴만 닫고 summary로 포커스를 돌려준다.
- 앱 헤더의 초안 저장 상태와 이미지 저장 행동을 구분. 모바일 저장/재다운로드 버튼은 화면 하단 고정.
- 모바일 export의 transform animation을 제거해 fixed 버튼의 viewport 기준을 보장. 전역 html 최소 너비를 제거해 320px에서 세로 스크롤바 때문에 생기던 15px 가로 넘침 수정.
- 스타일 선택 설명을 aria-describedby로 연결해 lint 경고 해소.

## 실제 검증

- 최종 npm test: 254/254 통과. npm run lint: 오류/경고 없음. npm run build: 타입 검사 포함 통과.
- 프로덕션 정적 출력으로 홈→Cinematic 선택→사진 시작→샘플→편집→이름 변경→undo/redo→reload→이미지 저장을 실제 브라우저에서 수행.
- 다운로드된 Atelier-QA-4x5-1x.png: PNG signature 89504e470d0a1a0a, 1080×1350, 2,837,992 bytes. 완료 화면은 실제 다운로드 dispatch 후 표시됨.
- 홈/사진 시작: KO/EN/JA × 320/390/768/1440px에서 document scrollWidth == clientWidth.
- 편집기: KO 390/1440, EN 320, JA 320/390/768/1440 검수. 모바일 toolbar 높이 56px.
- 320px 보조 팝오버: left16.5/right288.5, 실제 clientWidth305 안에 위치. Escape 후 open details0, focus More tools, inspector 높이340 유지.
- 사용자 localhost:3000 초안은 변경하지 않음. 상태 변경 검수는 127.0.0.1:4322 별도 origin에서 진행.
- 신규 모든 비율/모든 export 형식 매트릭스와 모든 업로드 오류 실동작은 수행하지 않았다. 기존 회귀 테스트 결과와 이번 PNG 1× 실제 검증을 구분한다.

## 기록

캡처: tmp/ux-home-desktop.jpg, tmp/ux-create-desktop.jpg, tmp/ux-editor-desktop.jpg, tmp/ux-editor-mobile.jpg, tmp/ux-export-success.jpg.

이전 Sites 업로드 승인 요청은 승인받지 않았으므로 원격 소스 전송이나 배포를 재시도하지 않았다. 기존 tmp/sites-xiv-atelier는 이전 수정본으로 오래된 상태이며, 향후 승인 후 최신 소스를 다시 준비해야 한다. Site ID는 .openai/hosting.json의 기존 값을 재사용한다.

portable-brain의 memory/protocol/.agent/tools 경로는 이 checkout에 없어 전용 기록 CLI를 실행할 수 없다. 이 문서가 이번 작업 기록이다.

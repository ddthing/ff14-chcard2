# XIV / ATELIER 디자인 마감 · 2026-10-08

사용자 요청: Sites를 사용한 현재 모험가 카드 앱의 디자인 업그레이드.

## 구현

- 홈: 대표 카드 크기와 비대칭 그리드 강화, 큰 스타일 썸네일, 읽기 쉬운 보조 정보, 중복 주요 CTA 제거.
- 실제 초안 재개를 스타일 갤러리보다 먼저 배치. 샘플 카드의 시각·접근성 설명을 KO/EN/JA로 제공.
- 갤러리: 제목 위계, 작품 여백, 선택 상태, 선택된 스타일의 주요 버튼, 모바일 체크 표시 개선.
- 공통 헤더: 현재 경로 및 hover 대비, 좁은 화면 정렬, reduced-motion 대응.
- 스타일 선택 버튼에 설명을 접근성 description으로 제공.
- 기존 카드 마스터/renderer/export/store/history/persistence/직업 아이콘 원본은 수정하지 않음.

기존 V3 팔레트·폰트·경로 유지. 디자인 방향은 editorial, variance 7 / motion 4 / density 3. 새로운 의존성 없음.
Figma 홈 75:1523, 모바일 홈 69:673, 갤러리 75:2069 및 V3 문서를 참고했다. 이번 결과는 요청된 개선이며 Figma 픽셀 복제는 아니다.

## 실행 검증

- npm run typecheck: 통과.
- npm run lint: 통과.
- npm test: 254 통과, 0 실패. 기존 일부 검사는 저장된 과거 렌더 증거를 검사하므로 신규 export 매트릭스 수행을 뜻하지 않는다.
- npm run build: 최종 접근성 보완 포함 통과. /, /templates, /create, /editor, /export 정적 출력 생성.
- 실제 프로덕션 정적 빌드 브라우저 확인: 홈과 갤러리 각각 KO/EN/JA × 320/390/768/1050/1440px, 가로 document overflow 없음.
- 홈 라이트/다크 시각 확인, 모바일 스타일 선택 → 생성 URL의 template 값 유지 확인. 브라우저 콘솔 오류 없음.
- independent source review의 접근성 설명 누락을 수정했다.
- 새 업로드/전체 45개 카드 조합/PNG·WebP 내보내기 전체 실동작 재검증은 이번 화면 마감에서 수행하지 않았다.

캡처: tmp/award-home-before.jpg, tmp/award-home-after-desktop.jpg, tmp/award-home-after-mobile.jpg, tmp/award-gallery-after.jpg.

## Sites 상태와 재개

- 새 owner-private Site ID: appgprj_6ac77662be4881918a79d88f77021ef7. 루트 .openai/hosting.json에 보존.
- source preparation 위치: tmp/sites-xiv-atelier. src/public/licenses와 필요한 빌드 설정 및 정적 dist만 복사. .env.local, 개인 메모리, 대화, QA 백로그는 복사하지 않음.
- 예상 주소: https://xiv-atelier.ddinngdoong.chatgpt.site (배포 성공 URL이 아님).
- Sites Git 소스 전송이 자동 승인 검토에 의해 차단됨: 사용자에게 원격 소스 전송 목적지 승인이 충분히 명시되지 않았다는 사유. 우회·push·deploy를 수행하지 않음.
- 사용자 승인 후 같은 Site의 새 단기 credential을 메모리로 받아 source helper를 계속한다. 기존 ID 재사용, 새 Site 생성 금지. source push 후 정확한 commit/archive로 private 배포해야 한다.
- Sites build helper는 Windows npm shim 경로 오류로 실행 실패하여 동일 npm run build를 직접 실행했다.
- 저장소에 참조된 protocols/, memory/, .agent/tools/가 없어 해당 메모리 CLI 기록을 실행할 수 없었다. 이 문서로 작업 상태를 남긴다.

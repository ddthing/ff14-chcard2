# Figma 임팩트 시안 2종 · 2026-10-11

사용자 요청: 현재 프로젝트를 위한 눈에 확 띄는 임팩트 있는 디자인 시안 2개.

기존 Figma 파일의 새 페이지 `03 · Impact concepts · 2026-10-11`에 두 방향을 제작했다. 각 방향은 데스크톱 1440×1000과 모바일 390×1050으로 구성한다. 앱 코드와 현재 디자인 계약을 변경하는 구현 작업이 아니라 비교용 Figma 제안이다.

| 방향 | 구성 | 데스크톱 | 모바일 |
| --- | --- | --- | --- |
| A · Type Folio | 밝은 Stone, 112px 제품 타이포그래피, 단일 대형 카드, 작품 인덱스 | [A](https://www.figma.com/design/MqkXWfirWgjyyRbqGZjacF?node-id=93-686) | [A Mobile](https://www.figma.com/design/MqkXWfirWgjyyRbqGZjacF?node-id=93-687) |
| B · Card Stage | 어두운 Stone, 펼쳐진 세 카드, 중앙 제작·선택 도크 | [B](https://www.figma.com/design/MqkXWfirWgjyyRbqGZjacF?node-id=93-688) | [B Mobile](https://www.figma.com/design/MqkXWfirWgjyyRbqGZjacF?node-id=93-689) |

## 제작 경계

- 설치된 bJMSkfGi Stone의 OKLCH 원본을 sRGB로 변환해 Figma Light/Dark 변수 모드로 만들었다. UI 의미 변수는 원본 primitive에 alias로 연결했다. preset 반경 6/8/10/14/18px를 사용한다.
- UI 폰트는 실제 사용 가능한 Noto Sans KR, Noto Serif KR, DM Sans, Cormorant Garamond로 구성하고 read-back으로 확인했다. A의 큰 표시 제목은 임팩트를 비교하기 위한 제안값이다.
- 기존 카드 마스터 `23:233`, `23:273`, `23:383`를 인스턴스로 재사용했다. 카드의 고유 사진·마스크·재료·폰트와 색상은 UI Stone 변수와 분리한다.
- 헤더·버튼·스타일 옵션·프로젝트 입력은 재사용 컴포넌트다. 버튼 Label과 입력 Placeholder는 component property로 수정할 수 있다.
- 페이지를 완성 UI 스크린샷으로 덮지 않았다. UI는 실제 text/frame/component/instance/vector 계층이고 이미지 fill은 기존 카드의 사진·인쇄 재료다.
- 만들기·비교·스타일 선택·초안 재개·로컬 저장의 기존 작업 의미를 유지한다. 앱에서 동작하는 새로운 기능 또는 실제 저장 상태라고 표현하지 않는다.

## 검수

4개 전체 화면 렌더를 시각적으로 확인했다. 모바일 선택 행 간격, A 모바일 저장 버튼 잘림과 B 중앙 도크 정렬을 수정했다. B 모바일의 뒤쪽 카드 양쪽 가장자리 crop은 선택된 정면 카드와 대비시키는 의도된 갤러리 구도다.

최종 구조: 네 화면 모두 폰트 불일치와 완성 UI raster 노드 없음. Light/Dark 모드와 프로젝트 입력 인스턴스의 resolved 모드가 일치한다. 독립 검토에서 텍스트 충돌·누락 이미지·주요 레이아웃 파손이 없고 두 방향의 실루엣이 다름을 확인했다.

렌더와 상태 기록은 Git 제외 `tmp/figma-impact-2026-10-11/`의 `concept-a.png`, `concept-b.png`, 모바일 PNG, `ledger.json`, `final-validation.json` 및 제작 스크립트에 있다. Figma 컴포넌트 선택 또는 시안의 실제 앱 구현은 별도 후속 작업이다.

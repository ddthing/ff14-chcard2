# XIV / ATELIER V3 디자인 스펙

이 폴더는 사용자가 승인한 V3 앱 UI·UX 및 카드 디자인을 구현하고 검수하는 기준 문서 모음이다. Figma 시안과 실제 제품의 기존 데이터·저장·렌더링·내보내기 기능을 함께 반영한다.

## 문서 읽는 순서

1. [마스터 디자인 스펙](./MASTER_DESIGN_SPEC.md) — 제품 약속, 세 카드 마스터, 화면 인벤토리, 작업 흐름, 보존할 기능과 구현 완료 기준
2. [디자인 토큰](./DESIGN_TOKENS.md) — 컬러, 서체, 간격, 컴포넌트 및 상태값
3. [화면별 AI 프롬프트](./SCREEN_AI_PROMPTS.md) — 화면을 만들거나 수정할 때 전달할 구체적인 프롬프트
4. [AI 결과물 QA·수정 가이드](./AI_QA_REPAIR_GUIDE.md) — Figma·제품·출력 비교, 오류 우선순위, 수정과 재검수
5. [구현 및 검증 기록](./IMPLEMENTATION_VERIFICATION.md) — 실제 변경, 실행한 검사와 새 렌더 증거
6. [60fps 참고 연구와 리디자인](./REFERENCE_REDESIGN_2026-10-08.md) — 페이지별 적용, 병목 수정, 측정 범위와 최종 화면 증거

각 문서는 맡은 역할이 다르다. 제품·화면 의미는 마스터 스펙, 구체적인 수치는 토큰, 작업 입력은 프롬프트, 결과 승인과 수정 순서는 QA 가이드를 따른다.

## Figma 원본

[XIV / ATELIER — 02 V3 product experience](https://www.figma.com/design/MqkXWfirWgjyyRbqGZjacF/XIV-Atelier-%E2%80%94-%EB%AA%A8%EB%B0%94%EC%9D%BC-UI---%EC%B9%B4%EB%93%9C-%EC%BD%98%EC%85%89%ED%8A%B8-3%EC%95%88?node-id=64-672)

카드 마스터: [Cinematic Gold](https://www.figma.com/design/MqkXWfirWgjyyRbqGZjacF?node-id=23-233) · [Editorial Vermilion](https://www.figma.com/design/MqkXWfirWgjyyRbqGZjacF?node-id=23-273) · [Adventurer Record](https://www.figma.com/design/MqkXWfirWgjyyRbqGZjacF?node-id=23-383)

Figma prototype의 화면 연결과 시뮬레이션을 실제 업로드·편집·출력 기능으로 오해하지 않는다. 현재 지원 기능과 주요 경계는 마스터 스펙의 **실제 제품 동작과 프로토타입의 경계**를 먼저 읽는다.

## 기존 구현 문서

- [카드 마스터 및 필드 계약](../master-cards.md)
- [상호작용 시스템](../interaction-system.md)
- [직업 아이콘 출처](../job-icon-sources.md)
- [직업 아이콘 정리 기록](../job-icon-source-cleanup.md)
- [웹 제품 경험](../web-experience.md)

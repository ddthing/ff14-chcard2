# XIV / ATELIER V3 디자인 토큰

**상태:** 구현 기준 · Figma 원본 및 현행 코드 대조 완료  
**기준일:** 2026-10-08  
**대상:** 홈, 템플릿 갤러리, 사진 시작, 에디터, 출력 화면과 세 카드 마스터

이 문서는 [V3 Figma 화면](https://www.figma.com/design/MqkXWfirWgjyyRbqGZjacF/XIV-Atelier-%E2%80%94-%EB%AA%A8%EB%B0%94%EC%9D%BC-UI---%EC%B9%B4%EB%93%9C-%EC%BD%98%EC%85%89%ED%8A%B8-3%EC%95%88?node-id=64-672)의 값과 현재 프로젝트의 구현 토큰을 연결한다. 값에는 출처를 구분해 표시한다.

- **Figma 원본:** 파일 안의 variable, mode, text style에서 읽은 값이다. HEX는 Figma RGBA sRGB 값을 8비트로 반올림한 표기다.
- **코드 기준:** 현재 CSS·TypeScript 구현 또는 동결된 동작 문서에 있는 값이다.
- **구현 파생:** Figma에 해당 variable이 없어서 반응형·접근성·컴포넌트 일관성을 위해 정한 제안값이다. Figma 원본값으로 인용하지 않는다.

Figma의 로컬 변수는 색상형뿐이다. 간격·모서리·그림자·브레이크포인트·상태색은 변수로 등록되어 있지 않다. 이 문서의 파생 토큰은 모바일 390×844와 데스크톱 1440×1080 기준 화면, 현재 앱의 CSS 규칙을 함께 고려한다.

## 1. 색상 체계

### 1.1 제품 UI용 Figma 색상

원본 컬렉션은 `XIV / V2 Atelier themes` (`VariableCollectionId:23:137`)다. 제품 UI 기본 모드는 **Editorial Vermilion** (`23:1`)으로 정한다. 다른 두 모드는 별개의 시각 콘셉트이지 라이트/다크 모드가 아니다.

| 의미 | Figma variable | Figma ID | Cinematic Gold `23:0` | **Editorial Vermilion `23:1`** | Archive Burgundy `23:2` | Figma WEB 구문 |
|---|---|---|---|---|---|---|
| 앱 배경 | `color/bg` | `VariableID:23:141` | `#111A16` | **`#EEE5D7`** | `#E8E0D1` | `var(--atelier-v2-bg)` |
| 기본 표면 | `color/surface` | `VariableID:23:145` | `#1B2620` | **`#FBF4E8`** | `#F7EFDF` | `var(--atelier-v2-surface)` |
| 주요 잉크 | `color/ink` | `VariableID:23:149` | `#F4EAD6` | **`#27211C`** | `#352B22` | `var(--atelier-v2-ink)` |
| 보조 잉크 | `color/muted` | `VariableID:23:153` | `#BBB5A8` | **`#807365`** | `#84735F` | `var(--atelier-v2-muted)` |
| 버건디/금색 포인트 | `color/accent` | `VariableID:23:157` | `#D1B579` | **`#863B34`** | `#713A34` | `var(--atelier-v2-accent)` |
| 장식선 | `color/line` | `VariableID:23:161` | `#485B4D` | **`#D2C0A8`** | `#CDBB9D` | `var(--atelier-v2-line)` |
| 강조 배경 위 글자 | `color/onAccent` | `VariableID:23:165` | `#18241D` | **`#FFF6E6`** | `#FFF6E6` | `var(--atelier-v2-onAccent)` |

각 semantic color variable은 세 모드에서 각자의 primitive를 alias한다. Semantic variable의 Figma scope는 `FRAME_FILL`, `SHAPE_FILL`, `TEXT_FILL`, `STROKE_COLOR`다. `primitive/*` 변수의 scope는 비어 있다. 별도 색 변수로 임의의 RGB를 복제하기보다 해당 semantic variable을 바인딩한다. 컬렉션에는 총 28개의 색 변수가 있다.

Figma의 WEB code syntax는 디자인 메타데이터다. 현재 Next.js 앱에서 그 이름이 자동으로 CSS에 생성되지는 않는다. 앱 구현은 아래 표의 기존 `--app-*` 의미 토큰으로 값을 연결하고, `--editor-*`는 에디터 안에서 그 토큰을 가리키는 별칭으로 둔다.

### 1.2 UI semantic → 앱 CSS 매핑

| Figma 원본 | 앱 토큰 | 적용 규칙 |
|---|---|---|
| `color/bg` | `--app-bg` | 페이지·앱 바깥 배경 |
| `color/surface` | `--app-surface`, `--app-header` | 입력 영역, 내비게이션, 일반 표면 |
| `color/ink` | `--app-text` | 제목, 값, 본문 |
| `color/muted` | `--atelier-v2-muted` | 원본 스와치 보존. 작은 UI 글자에는 그대로 사용하지 않는다. |
| `color/muted` + `color/ink` | `--app-text-muted` | **파생 readable 잉크.** 작은 라벨에서 WCAG 명도 대비를 만족하도록 혼합한다. |
| `color/accent` | `--app-accent`, `--app-focus` | 주요 액션, 현재 선택, 키보드 포커스 |
| `color/onAccent` | `--app-on-accent` | 버건디로 채운 버튼의 글자·아이콘 |
| `color/line` | `--app-border` | 구획과 비활성 장식선. 입력 경계를 이 색만으로 표현하지 않는다. |
| `color/ink` + `color/line` | `--app-border-strong` | 포커스 전 입력·선택 경계용 파생 선 |
| 없음 | `--app-surface-raised`, `--app-workspace`, `--app-control`, `--app-control-hover` | 아래 레이아웃 규칙에 맞춘 파생 표면. 앱 표면을 여러 겹의 카드로 쌓지 않는다. |

Editorial Vermilion 라이트 테마에서 Figma에 없는 표면 역할의 값은 구현 파생값이며 현재 [`app-theme.css`](../../../src/app/app-theme.css)에 적용되어 있다. 제품 표면을 더 만들기보다 실제 겹침이 있는 경우에만 사용한다.

| 앱 토큰 | 라이트 현재값 | provenance |
|---|---|---|
| `--app-surface-raised` | `#FFF9EF` | 구현 파생. popover·선택 메뉴 |
| `--app-workspace` | `#E6DAC8` | 구현 파생. 편집 캔버스 주변 작업대 |
| `--app-control` | `#FBF4E8` | Figma `color/surface` 재사용 |
| `--app-control-hover` | `#EEE5D7` | Figma `color/bg` 재사용 |
| `--app-header` | `#FBF4E8` | Figma `color/surface` 재사용 |
| `--app-accent-soft` | `rgb(134 59 52 / 9%)` | 구현 파생. 선택 배경 |
| `--app-focus` | `#863B34` | Figma `color/accent` 재사용 |
| `--app-header-height` | 56 px | 현재 코드 기준 |
| `--app-shadow-overlay` | `0 12px 32px rgb(26 29 32 / 16%)` | 현재 코드 기준 |

### 1.3 대비와 작은 글자

선택 모드의 Figma 원본을 WCAG 2.x 상대휘도 공식으로 계산한 대비다. 색 자체에 대한 정적 계산이며, 최종 화면 검증을 대신하지 않는다.

| 조합 | 대비 | 사용 |
|---|---:|---|
| 잉크 `#27211C` / 배경 `#EEE5D7` | 12.74:1 | 본문, 제목 |
| 잉크 `#27211C` / 표면 `#FBF4E8` | 14.54:1 | 본문, 제목 |
| Figma 보조색 `#807365` / 배경 `#EEE5D7` | 3.69:1 | 14px 미만 본문·필드 설명에는 불가 |
| Figma 보조색 `#807365` / 표면 `#FBF4E8` | 4.21:1 | 12px UI 글자의 일반 텍스트 대비에 부족 |
| 버건디 `#863B34` / 배경 `#EEE5D7` | 6.26:1 | 텍스트 포인트, 포커스 표시 |
| 강조 글자 `#FFF6E6` / 버건디 `#863B34` | 7.28:1 | 주요 버튼 |
| 장식선 `#D2C0A8` / 배경 `#EEE5D7` | 1.42:1 | 장식선으로만 사용 |

파생값은 정확한 Figma 스와치를 보존하면서 읽기·조작에 필요한 대비를 보충한다.

- 작은 보조 글자: `color-mix(in srgb, #27211C 18%, #807365)` → 약 `#706458`, 배경 대비 약 4.61:1. UI에서 12–13px 라벨과 보조 설명은 이 파생값 또는 주요 잉크를 쓴다.
- 강한 컨트롤 경계: `color-mix(in srgb, #27211C 40%, #D2C0A8)` → 약 `#8E8070`, 배경 대비 약 3.07:1. 입력·선택 경계에는 이를 사용한다.
- `#D2C0A8` 장식선은 정보 구조의 유일한 표시로 삼지 않는다. 선택 상태는 버건디, 체크, 문구 또는 형태도 함께 바꾼다.
- 포커스는 2px 이상의 `--app-focus` 외곽선과 2px offset을 사용한다. 색상만으로 성공·오류·선택을 전달하지 않는다.

### 1.4 다크 모드

Figma의 `Cinematic Gold`와 `Archive Burgundy`는 별개의 콘셉트 모드다. Editorial Vermilion의 다크 팔레트로 오인해 자동 연결하지 않는다. Figma에는 Editorial의 다크 counterpart가 없다. 아래 **구현 파생값**은 현재 `app-theme.css`에 적용되어 있지만 Figma exact는 아니다. 사진·카드 렌더러는 이 앱 테마를 상속하지 않는다.

| 앱 토큰 | 다크 현재값 | 용도 |
|---|---|---|
| `--app-bg` | `#191512` | 따뜻한 차콜 배경 |
| `--app-surface` | `#211C18` | 패널·헤더 |
| `--app-surface-raised` | `#2A241E` | 팝오버·선택 메뉴 |
| `--app-workspace` | `#151210` | 카드 주변 작업대 |
| `--app-control` / `--app-control-hover` | `#27211B` / `#342B24` | 폼 컨트롤의 기본·호버 |
| `--app-text` | `#F4EADB` | 주요 글자 |
| `--app-text-muted` / `--app-text-subtle` | `#B7A794` / `#B7A794` | 보조 글자 / 2차 보조 글자 |
| `--app-accent` / `--app-on-accent` | `#D98279` / `#241715` | 읽기 쉬운 밝은 버건디 / 버튼 글자 |
| `--app-border` / `--app-border-strong` | `#51463B` / `#847361` | 장식선 / 조작 경계 |
| `--app-focus` | `#F0B3A5` | 키보드 포커스 |
| `--app-accent-soft` | `rgb(217 130 121 / 14%)` | 낮은 강도의 선택 배경 |
| `--app-header` | `#211C18` | 다크 앱 헤더 |
| `--app-shadow-overlay` | `0 14px 40px rgb(0 0 0 / 34%)` | 현재 코드 기준 overlay shadow |

다크 파생 팔레트의 현재 코드 대비는 주요 글자/배경 15.24:1, 보조 글자/배경 7.75:1, 잉크색 버튼 글자/버건디 버튼 6.14:1, 포커스/배경 10.11:1, 강한 경계/배경 3.98:1이다. 이 값은 정적 색상 대비며 최종 화면 상태 검토를 대신하지 않는다. 구현은 기존 앱의 `data-app-theme="light|dark"`와 `system` 선호를 유지한다.

### 1.5 상태색 및 오버레이

Figma에 상태색 variable은 없다. 아래는 현재 [`src/app/app-theme.css`](../../../src/app/app-theme.css)의 코드 기준을 유지하는 값이다. V3 화면에도 쓰려면 새 표면 위에서 대비를 확인한다.

| 상태 | 라이트 코드 기준 | 다크 코드 기준 | 규칙 |
|---|---|---|---|
| 오류 글자/표면 | `#A72F27` / `#FBE9E6` | `#FFAAA1` / `#3D2425` | 오류 이유와 회복 액션을 함께 제공 |
| 성공 글자/표면 | `#276447` / `#E5F2EA` | `#91D3A9` / `#193428` | 실제 저장·출력 성공 이후에만 표시 |
| 오버레이 | `rgb(23 27 31 / 32%)` | `rgb(0 0 0 / 58%)` | 배경 작업 문맥과 닫기 동작 보존 |

## 2. 카드 전용 색상과 재료

**앱 UI 토큰과 카드 토큰은 분리한다.** `data-app-theme` 전환으로 카드의 종이·사진·잉크·직업색을 바꾸지 않는다. 카드 팔레트는 현행 `design.palette`, color mode, 선택된 카드 마스터를 통해 렌더러에서 정한다. `XIV / Print materials` (`VariableCollectionId:23:166`, mode `Art stock`, `23:3`)는 카드의 종이·금속·잉크 재료에만 사용한다.

| 역할 | Figma variable ID | 정확한 색 | WEB 구문 | 쓰임 |
|---|---|---|---|---|
| 종이 | `VariableID:23:168` | `#EFE4CE` | `var(--card-paper)` | 기록물의 기본 stock |
| 밝은 종이 | `VariableID:23:170` | `#F8F0DE` | `var(--card-paperLight)` | 밝은 종이 면 |
| 진한 잉크 | `VariableID:23:172` | `#211D17` | `var(--card-dark)` | 카드 본문·어두운 그림자 기준 |
| 금색 | `VariableID:23:174` | `#C5A46C` | `var(--card-gold)` | 금박 선과 인쇄 장식 |
| 밝은 금색 | `VariableID:23:176` | `#ECDBA7` | `var(--card-goldLight)` | 작은 하이라이트 |
| 버건디 | `VariableID:23:178` | `#7E3831` | `var(--card-burgundy)` | Editorial 잉크 포인트 |
| 세이지 | `VariableID:23:180` | `#4A5948` | `var(--card-sage)` | Cinematic/식물 계열 색 |

이 변수들은 각 `primitive/*` 색을 alias한다. Figma semantic variable scope는 UI 색 변수와 같이 `FRAME_FILL`, `SHAPE_FILL`, `TEXT_FILL`, `STROKE_COLOR`다. 종이·금색 값을 새 앱 버튼, 헤더, 입력 색으로 재사용하지 않는다.

### 2.1 카드 렌더러 수치

아래 수치는 현행 [마스터 카드 렌더러](../master-cards.md)의 **V2 Master A 역사적 코드 기준**이다. V3 Figma의 새 장식·구도에 대한 exact 수치로 보지 않는다. 기존 렌더러의 palette/material 계산을 참고할 때만 사용하며, V3 작품은 단일 `CardPreview`/마스터 렌더러와 내보내기 경로를 유지하고 각 비율에서 다시 확인한다.

| 카드 계열 | 기본 표면 처리 | 보조 잉크 비율 | 강조 잉크 혼합 | 선 불투명도 | 안전 여백 | 메타 간격 | 외곽 모서리/프레임 |
|---|---|---:|---:|---:|---:|---:|---|
| Cinematic | dark + primary tint 8% | 73% | accent와 light 50% | 28% | 5.5% | `1.4cqi` | 반경 0, 프레임 0 |
| Editorial | light + primary tint 7% | 67% | accent와 dark 54% | 25% | 6% | `1.5cqi` | 반경 0, 프레임 0 |
| Adventurer Record | light + accent tint 5% | 69% | accent와 dark 44% | 31% | 5.8% | `1.6cqi` | 반경 0, 프레임 1 CSS px |

`--master-rule-weight`는 V2 코드 기준으로 4:5·1:1·3:4·9:16에서 `calc(100cqi / 1080)`, 16:9에서 `calc(100cqi / 1920)`다. 컨테이너 상대 선을 이용해 출력 1×에서 약 1px로 맞춘다. 이는 V3 Figma의 장식선 두께를 확정하는 값이 아니다. 카드의 비율별 구도·타이포 위계·사진 크롭은 [마스터 디자인 스펙](./MASTER_DESIGN_SPEC.md)과 [기존 카드 구성 계약](../master-cards.md)을 따른다.

### 2.2 재료 맵

재료 역할·자산 경로·opacity는 [`src/lib/card-materials.ts`](../../../src/lib/card-materials.ts)의 **V2 코드 기준**이다. V3 Figma에서 재료 효과를 표현하는 exact opacity 값으로 보지 않는다. 프로그래밍된 재료는 표면의 미세 인쇄감에만 쓰고, 사용자 사진을 덮는 장식으로 확대하지 않는다.

| 계열 | 역할 | 자산 | 불투명도 |
|---|---|---|---:|
| Cinematic | `cinematic-film-grain` | `/images/materials/cinematic-film-grain.webp` | 0.45 |
| Editorial | `editorial-paper-surface` | `/images/materials/editorial-paper-surface.webp` | 0.30 |
| Editorial | `editorial-ink-density` | `/images/materials/editorial-ink-density.webp` | 0.50 |
| Adventurer Record | `identity-matte-fiber` | `/images/materials/identity-matte-fiber.webp` | 0.30 |

## 3. 서체와 타입 스케일

Figma의 텍스트 스타일은 픽셀 단위다. 웹에서는 CSS px로 대응한다. 아래는 Figma local style inventory다. 실제 V3 카드 마스터에는 별도 노드별 서체 override가 있으므로 local style 하나를 모든 카드 제목에 일괄 적용하지 않는다. 카드 출력의 문자는 카드 컨테이너 상대 크기로 조정하므로, Figma print 값은 앱 화면 글자 크기로 재사용하지 않는다.

| 범위 / Figma 스타일 | Figma style ID | 글꼴과 굵기 | 크기 / 행간 | 자간 | 제품 역할 |
|---|---|---|---|---|---|
| UI · `XIV / UI/Body` | `S:eccc687160071dd4d48ae5fbd64cd4a3d97ec8e4,` | Noto Sans KR Regular 400 | 14 / 22 px | 0% | 본문과 설정 설명 |
| UI · `XIV / UI/Label` | `S:eadb28808c2915fa34631903378c7addba9b41c0,` | Noto Sans KR Medium 500 | 14 / 20 px | 0% | 핵심 입력 라벨·탭 |
| UI · `XIV / UI/Caption` | `S:b2adfa9b5b3aba205f060de8d8b5cab64d1a8748,` | Noto Sans KR Regular 400 | 12 / 18 px | 0% | 보조 설명; 대비가 확보된 잉크 사용 |
| UI · `XIV / Latin/Meta` | `S:667aed5146406142f8e7ddcf2c1e4219571da708,` | DM Sans Medium 500 | 12 / 18 px | 0% | 라틴 메타 값 |
| UI · `XIV / Latin/Title` | `S:e6f71f229083d8b62a334f5bba437fb6f08aeb0a,` | Cormorant Garamond Medium 500 | 56 / 56 px | 0% | 라틴 디스플레이 제목 |
| UI · `Product / Body small` | `S:7f6bf339f8994714fff0f05b6f4cfed8c5cd16f5,` | Noto Sans KR Regular 400 | 13 / 19 px | 0% | 좁은 화면의 본문 |
| UI · `Product / Field label` | `S:b8c30e00db8cae3d74e57f502d3ca69fe8c861ec,` | Noto Sans KR Regular 400 | 11 / 16 px | 0% | 시안의 필드 보조 캡션. 핵심 라벨에 단독 적용하지 않는다. |
| UI · `Product / Small label` | `S:43ab127434ab04eccae07a3b2a1ef1fae217da9b,` | Noto Sans KR Medium 500 | 12 / 18 px | 0% | 작은 화면의 필드 라벨 |
| UI · `Product / Heading` | `S:73b0f60d49501f6283bbb11579db3a927b783b5e,` | Noto Serif KR Medium 500 | 26 / 34 px | 0% | 화면·섹션 제목 |
| UI · `Product / Mobile hero` | `S:35d6e23fb15dad9a7a00dba219cc5671c20bb345,` | Noto Serif KR Medium 500 | 30 / 39 px | 0% | 모바일 홈·진입 문구 |
| UI · `Product / Desktop display` | `S:40f6f8d3f0372bfcca97a99a657b717381ba8f68,` | Noto Serif KR Medium 500 | 50 / 65 px | 0% | 데스크톱 홈 디스플레이 |
| 카드 · `XIV V2 / Print/Display` | `S:ab9183cf105151281b7b06e601ec6e6b38d3a007,` | Cormorant Garamond SemiBold 600 | 92 / 94 px | −1.5 px | 이름·인쇄물 디스플레이 |
| 카드 · `XIV V2 / Print/Body` | `S:0e2a7004f8e4ea9564212ad714b10374532d726c,` | Cormorant Garamond Medium 500 | 12 / 15 px | 0 px | 카드의 짧은 영문 문장 |
| 카드 · `XIV V2 / Print/Label` | `S:970bf934011784feb6fdbdb0c799c57e575e7103,` | DM Sans Bold 700 | 7 / 11 px | 1.1 px | 비핵심 인쇄 메타. 필수 정보·앱 UI에는 사용 금지 |
| 카드 · `XIV V2 / Print/Handwritten` | `S:c3f166c84b9ef54328e50af5fa16dc90f3f1b10c,` | Caveat Regular 400 | 22 / 25 px | 0 px | 기존 Figma 라이브러리 스타일. V3 카드 노드에서는 사용하지 않는다. |

### 3.1 코드 글꼴과 매핑

현재 서체는 [`src/data/fonts/registry.ts`](../../../src/data/fonts/registry.ts), [`src/data/fonts/load-fonts.ts`](../../../src/data/fonts/load-fonts.ts), `src/app/globals.css`, `src/app/fonts.css`, `src/lib/typography-presets.ts`에서 관리한다. 영문 `Cormorant Garamond Variable`(300–700)과 `DM Sans Variable`(100–1000)은 프로젝트의 local WOFF2 파일을 사용한다. Noto Sans/Serif KR/JP는 `@fontsource-variable` 패키지의 WOFF2를 Next 빌드 안에서 필요한 스크립트·glyph에 따라 동적으로 self-host한다. `unicode-range`와 glyph 단위 `document.fonts.load()`가 필요한 subset을 요청한다. 패키지 버전과 SIL Open Font License 1.1 고지는 registry 및 `licenses/fonts/`에 기록되어 있다.

| 토큰 | 코드 역할 | 폴백 원칙 |
|---|---|---|
| `--font-display` / `--font-editorial` | 카드·홈의 감성 디스플레이 | 영문은 Cormorant Garamond, 한글·일본어는 기존 Noto Serif 계열 및 시스템 폴백 |
| `--font-ui` / `--font-copy` | 컨트롤·본문 | DM Sans + 기존 Pretendard/Noto CJK/시스템 산세리프 |
| `--font-mono` | 기술 메타·수치 | 시스템 모노스페이스 |

`Noto Serif KR`, `Noto Serif JP`, `Noto Sans KR`, `Noto Sans JP`는 로컬 `public/fonts/`에 통째로 복사하지 않아도 패키지를 통해 프로덕션 Next output에서 self-host된다. 이름 스크립트 감지와 기존 `typography-presets`를 우회하지 않는다. 제품 로케일은 [`SUPPORTED_LOCALES`](../../../src/lib/types.ts)의 한국어·영어·일본어 세 가지다.

V3 Figma 카드 마스터의 **노드별 서체 override**가 generic local style보다 우선한다.

| Figma V3 node | 대상 역할 | 적용 서체 override |
|---|---|---|
| Cinematic Gold · `23:233` | 이름·디스플레이 | 라틴 Cormorant Garamond; 한글·일본어는 등록 Noto Serif KR/JP. 서명은 해당 노드에서 Pinyon Script 400을 쓴다. |
| Editorial Vermilion · `23:273` | 이름·디스플레이·서명 | 라틴 디스플레이 Cormorant Garamond; CJK 디스플레이는 등록 Noto Serif KR/JP. 두 handwritten node는 Pinyon Script 400 또는 Whisper 400을 지정한다. |
| Adventurer Record · `23:383` | 메인 이름 | 라틴은 DM Sans Black 900, uppercase, burgundy `#7E3831`; 한글·일본어는 등록 Noto Sans KR/JP Bold(750)로 조판한다. 이름 외 디스플레이 역할은 Cormorant Garamond 및 스크립트별 Noto Serif를 쓴다. |

Pinyon Script 400과 Whisper 400은 현재 등록된 local WOFF2 폰트다. 출처는 Google Fonts, 라이선스는 SIL Open Font License 1.1이며 registry와 [Pinyon Script OFL](../../../licenses/fonts/Pinyon-Script-OFL.txt), [Whisper OFL](../../../licenses/fonts/Whisper-OFL.txt)에 기록되어 있다. 각각 라틴·라틴 확장·베트남어 subset을 제공한다. V3 노드의 Pinyon/Whisper 지정이 사용되지 않는 Figma 라이브러리 Caveat 스타일보다 우선한다.

## 4. 간격·크기·모서리

아래는 Figma에 없는 **간격 체계 제안**이다. 4px 보조 단위와 8px 기본 박자를 따른다. 현재 구현에는 이 등급의 전역 CSS variables가 없고, 각 화면은 아래에 기록한 실제 padding/breakpoint와 컴포넌트별 CSS 값을 사용한다. 기존 화면 값을 바꾸지 말고 새 컨트롤 간격을 정할 때 이 scale에서 선택한다.

### 4.1 간격 스케일

아래 `--space-*` 이름은 이 스펙의 의미상 간격 등급이다. 현재 앱에는 동일 이름의 전역 CSS variables가 없으므로, 실제 화면 여백은 이 절의 구현 기준 표와 화면별 CSS가 우선한다.

| 토큰 | 값 | 일반 쓰임 |
|---|---:|---|
| `--space-1` | 4 px | 아이콘과 라벨 간격, 작은 인셋 |
| `--space-2` | 8 px | 컨트롤 내부 요소 간격, 짧은 필드 그룹 |
| `--space-3` | 12 px | 입력 좌우 padding, 좁은 요소 사이 |
| `--space-4` | 16 px | compact 화면 여백, 일반 필드 간격 |
| `--space-5` | 24 px | 카드 내부 그룹, 섹션 간격 |
| `--space-6` | 32 px | 주요 화면 섹션과 데스크톱 여백 |
| `--space-7` | 48 px | 큰 섹션 분리, 주요 헤더 간격 |
| `--space-8` | 64 px | 홈·갤러리의 넓은 전시 여백 |

| 레이아웃 토큰 | V3 구현값 | 근거와 사용 |
|---|---:|---|
| 홈 콘텐츠 최대폭 | 1360 px | **현재 코드 기준** `.home .content`; 1440 px artboard에서 좌우 여백과 합쳐짐 |
| 마케팅 헤더 최대폭 | 1440 px | **현재 코드 기준** `.headerInner` |
| 홈 데스크톱 좌우 여백 | `clamp(24px, 2.8vw, 40px)` | **현재 코드 기준** 홈 콘텐츠; 1440 px에서는 40 px |
| 글로벌 page gutter | `clamp(18px, 4vw, 64px)` | **현재 코드 기준** `--page-gutter`; 1440 px에서 57.6 px |
| 홈·갤러리·시작 모바일 여백 | 24 px; 370 px 이하 16 px | **현재 코드 기준** 각 화면의 mobile/compact 규칙. OS 안전영역은 별도 더한다. |
| 앱 헤더 높이 | 56 px | **현재 코드 기준** `--app-header-height` |
| 마케팅 헤더 높이 | 데스크톱 72 px; 767 px 이하 66 px | **현재 코드 기준** header inner min-height |
| 입력 필드 너비 | 컨테이너 100%, 최대 인스펙터 너비 | 임의 고정폭을 지정하지 않고 데스크톱 인스펙터 안에서 맞춘다. |
| 앱 헤더 좌우 여백 | `clamp(8px, 2.1vw, 20px)` | **현재 코드 기준** 56 px app header |
| 마케팅 헤더 좌우 여백 | `clamp(20px, 4vw, 64px)` | **현재 코드 기준** max-width 1440 px header |
| 에디터 도구 레일 | `minmax(196px, 16.25vw)` (1181 px 이상); `minmax(180px, 20vw)` (901–1180 px) | **현재 코드 기준** 1440 px에서 약 234 px; 중간 데스크톱에서는 180–236 px |
| 에디터 인스펙터 | `minmax(300px, min(22vw, 360px))` (1181 px 이상); `minmax(280px, 320px)` (901–1180 px) | **현재 코드 기준** 1440 px 화면에서 약 317 px; 900 px 이하에서는 mobile panel |

### 4.2 컴포넌트 크기

| 컴포넌트 | V3 파생 규칙 |
|---|---|
| 주요 CTA | Home/Templates/Create/Export는 최소 52 px (`3.25rem`); Editor 작업·선택은 역할별 44–48 px |
| 보조 버튼·탭 | 기본 hit target 최소 44 px, 좌우 padding은 화면별 CSS 값 적용 |
| 아이콘 전용 조작 | hit target 최소 44×44 CSS px, 내부 아이콘 20–24 px |
| Editor 입력·선택 필드 | 넓은 화면 48 px, 560 px 이하 44 px. 나머지 라우트는 해당 화면 CSS 값 적용 |
| 모바일 하단 고정 액션 | 하단 `env(safe-area-inset-bottom)` 반영, 홈/시작/출력 주요 버튼 최소 52 px, 콘텐츠와 겹치지 않는 자체 영역 |
| 터치·포인터 상태 | 최소 시각/조작 영역 44×44 CSS px. 시각 아이콘만 작게 보이더라도 hit target은 줄이지 않는다. |

44 CSS px 기준은 웹 앱 구현 권장값이다. 나중에 네이티브로 옮길 때 Apple pt·Android dp와 기기 배율을 별도 검증한다.

### 4.3 모서리와 테두리

| 토큰 | V3 파생값 | 용도 |
|---|---:|---|
| `--radius-card` | 0 px | 카드 출력물의 직각 프레임 |
| `--radius-control` | 2 px | Editor의 V3 도구·입력 컨트롤 |
| `--radius-small` | 4 px | 작은 Editor 유틸리티 |
| `--radius-overlay` | 8 px | 팝오버·모바일 sheet 모서리 |
| `--radius-pill` | 9999 px | 현재 Home/Marketing 주요 CTA와 App shell 출력 버튼 |
| 일반 선 | 1 px | 구획선·입력 경계 |
| 키보드 focus | 2 px, 2 px offset | 색상만이 아닌 뚜렷한 외곽선 |

이 값은 공통 UI의 의미상 등급이며 현재 CSS에는 전역 `--radius-*` variables가 없다. 개별 표면은 각 화면 CSS 값을 따른다. 특히 Home/Marketing CTA는 현재 pill 형태이고 Editor 컨트롤은 2px 사각 반경이다. 앱 화면을 둥근 카드 표면 여러 겹으로 쌓지 않고, 카드 프레임과 UI 컨트롤 반경을 서로 교차 사용하지 않는다.

## 5. 반응형 규칙

Figma 기준 프레임은 모바일 **390×844**와 데스크톱 **1440×1080**이다. 기준 폭은 테스트 기준이며 최소 지원 폭을 뜻하지 않는다. HTML은 최소 320px부터 가로 넘침 없이 동작한다.

| 화면·코드 위치 | 현재 breakpoint | 적용 |
|---|---|---|
| Home · `home.module.css` | 1050–768 px, 767 px 이하, 370 px 이하 | 중간폭 재배치, 모바일 화면, compact padding |
| Templates · `templates.module.css` | 980 px 이하, 760 px 이하, 370 px 이하 | 좁은 데스크톱, 모바일 선택 UI, compact padding |
| Create · `create.module.css` | 900 px 이하, 760 px 이하, 370 px 이하 | 폭별 입력 흐름, 모바일 화면, compact padding |
| Marketing header · `marketing.module.css` | 767 px 이하, 600 px 이하, 380 px 이하 | 작은 내비게이션과 브랜드 축약 |
| App shell/header · `app-shell.module.css` | 640 px 이하, 360 px 이하 | header actions와 초소형 화면 |
| Editor · `editor.module.css` | 1600 px 이상, 901–1180 px, 900 px 이하, 560 px 이하, 370 px 이하 | 넓은 캔버스, 좁은 데스크톱, 모바일 편집, compact 조작부 |

이 값은 **현재 코드의 화면별 media query**이며 Figma variable이나 전역 `--bp-*` token이 아니다. Figma 기준 390×844·1440×1080과 최소 HTML 폭 320 px에서 레이아웃이 맞는지 확인한다. 화면의 목적에 따라 실제 분기점을 유지한다.

## 6. 모션·그림자

Figma에는 motion·shadow variable이 없다. 코드 기준 토큰과 적용 경계는 [`interaction-system.md`](../interaction-system.md)에 있다.

| 범위 | 토큰 | 현재 코드 값 | 쓰임 |
|---|---|---:|---|
| Editor | `--editor-motion-micro` | 120 ms | 짧은 입력 반응·버튼 눌림 |
| Editor | `--editor-motion-ui` | 180 ms | 상태·피커 등장 |
| Editor | `--editor-motion-panel` | 220 ms | 모바일 sheet |
| Editor | `--editor-ease-snappy` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | 짧은 도구 반응 |
| Editor | `--editor-ease-soft` | `cubic-bezier(0.22, 0.61, 0.36, 1)` | sheet·조용한 상태 변화 |
| Home/Marketing | `--motion-fast` | 160 ms | 짧은 인터랙션 |
| Home/Marketing | `--motion-ui` | 240 ms | UI 상태 변화 |
| Home/Marketing | `--motion-default` | 420 ms | 제한된 진입·전환 |
| Home/Marketing | `--motion-hero` | 760 ms | 홈의 시각 진입만 제한적으로 |
| Home/Marketing | `--ease-editorial` | `cubic-bezier(0.22, 1, 0.36, 1)` | 기존 홈 모션 |

모션은 불투명도와 transform에만 사용한다. 카드 색·사진 위치·비율 전환을 늦추거나 편집을 따라오지 못하게 만들지 않는다. `prefers-reduced-motion: reduce`에서는 애니메이션과 press scale을 끄되 포커스·선택·오류 표시는 유지한다.

오버레이 그림자는 현재 코드의 `--app-shadow-overlay`를 메뉴·popover·sheet에만 쓴다. Figma는 일반 카드 표면에 그림자 토큰을 정하지 않았다. 카드에는 master별 사진 대비·재료·국소 그림자 규칙을 사용하며 앱 그림자를 카드 renderer에 전달하지 않는다.

## 7. 기존 코드 적용 지도

| 역할 | 현재 구현 위치 | 적용 원칙 |
|---|---|---|
| 앱 라이트/다크 변수 | `src/app/app-theme.css` | V3 Figma mode 23:1 색상과 채택된 파생 dark palette, 56 px app header |
| 공통 앱 글꼴·page gutter | `src/app/globals.css` | 글꼴 스택과 `--page-gutter: clamp(18px, 4vw, 64px)` |
| Editor 별칭·모션 | `src/app/editor/editor.module.css`, `src/app/editor/interaction-tokens.css` | `--editor-*`를 `--app-*`로 연결하고 focus·reduced motion 보존 |
| 카드 동적 palette | `src/components/cards/AdventurerCards.tsx` | 앱 테마와 분리; 사용자·직업·마스터 palette를 renderer에 제공 |
| 카드 surface/ink tokens | `src/lib/card-art-tokens.ts` | master별 혼합 비율과 컨테이너 상대 크기를 유지 |
| 카드 재료 | `src/lib/card-materials.ts` | 재료 image와 opacity는 단일 registry를 따른다. |
| 카드 텍스트 | `src/lib/typography-presets.ts`, font registry | script-aware, 측정 기반 이름 맞춤을 계속 사용 |
| 직업 아이콘 | `docs/design/job-icon-sources.md` 및 XIVAPI manifest | 승인된 원본 SVG/PNG만 사용. 수제 마스크·SDF·재생성 사본 금지 |

### 7.1 기본 CSS 변수 관계

아래는 코드 연결 개념이다. Figma code syntax 자체가 CSS 값을 생성한다는 뜻은 아니다.

```css
/* Figma: XIV / V2 Atelier themes · Editorial Vermilion · mode 23:1 */
html[data-app-theme='light'] {
  --app-bg: #eee5d7;              /* color/bg */
  --app-surface: #fbf4e8;         /* color/surface */
  --app-text: #27211c;            /* color/ink */
  --atelier-v2-muted: #807365;    /* exact color/muted */
  --app-text-muted: #706458;      /* derived: readable muted */
  --app-accent: #863b34;          /* color/accent */
  --app-on-accent: #fff6e6;       /* color/onAccent */
  --app-border: #d2c0a8;          /* color/line, decorative only */
  --app-border-strong: #8e8070;   /* derived interactive boundary */
}

/* Editor aliases resolve to app semantic tokens; card variables stay local. */
.page {
  --editor-bg: var(--app-bg);
  --editor-panel: var(--app-surface);
  --editor-text: var(--app-text);
  --editor-muted: var(--app-text-muted);
  --editor-accent: var(--app-accent);
}
```

원본 RGB는 Figma token 표와 variable IDs를 기준으로 하며 CSS 소문자 표기는 같은 HEX다. 색이 달라 보일 때 CSS/빌드·Figma 값을 몰래 변경하지 말고 먼저 이 문서의 provenance와 theme mode를 확인한다.

## 8. 토큰 적용 QA

- Light: Figma mode `Editorial Vermilion`(23:1)의 7개 semantic color와 런타임 값을 대조한다.
- Dark: 앱 테마만 전환하고 종이·카드 사진·직업 아이콘 색이 유지되는지 확인한다.
- Text: 12px 이상 UI 글자를 실제 작은 휴대폰 폭에서 읽고, Figma raw muted 대신 readable muted가 필요한 곳을 확인한다.
- Controls: 입력, 선택, tab, disabled, hover, focus, error, success를 색상 외 표식과 함께 검토한다. 최소 조작 영역은 44×44 CSS px다.
- Responsive: 320, 370, 390, 560, 900, 1180, 1440 CSS px에서 정렬·잘림·키보드·safe-area를 확인한다. Figma 기준 캔버스는 390×844와 1440×1080이다.
- Card: 지원 비율 1:1, 4:5, 3:4, 9:16, 16:9와 1×/2×/4× export에서 이름·사진 초점·직업 아이콘·작은 메타 글자를 확인한다. 카드 값은 앱 UI theme에 종속시키지 않는다.
- Type: 긴 한글·영문·일본어 이름, Han-only 이름, 좁은 버튼 라벨과 낮은 높이에서 줄바꿈·폭 측정·클립을 확인한다.
- Motion: `prefers-reduced-motion`을 켜고 최종 상태를 확인한다. 드래그·줌·슬라이더에는 추적 지연을 추가하지 않는다.
- Assets: Editorial 사진 붓결은 SVG clip-path로 유지하고, 직업 심볼은 승인된 XIVAPI 원본 경로만 쓴다.

## 9. 출처

- Figma 파일: [XIV / ATELIER V3 product experience](https://www.figma.com/design/MqkXWfirWgjyyRbqGZjacF/XIV-Atelier-%E2%80%94-%EB%AA%A8%EB%B0%94%EC%9D%BC-UI---%EC%B9%B4%EB%93%9C-%EC%BD%98%EC%85%89%ED%8A%B8-3%EC%95%88?node-id=64-672)
- Figma theme collection: `XIV / V2 Atelier themes`, `VariableCollectionId:23:137`; modes `23:0`, `23:1`, `23:2`.
- Figma print collection: `XIV / Print materials`, `VariableCollectionId:23:166`; mode `23:3`.
- Figma text styles: Figma local text style inventory; IDs are recorded beside each role in §3.
- Current implementation: [`app-theme.css`](../../../src/app/app-theme.css), [`globals.css`](../../../src/app/globals.css), [`fonts.css`](../../../src/app/fonts.css), [`interaction-tokens.css`](../../../src/app/editor/interaction-tokens.css), [`card-art-tokens.ts`](../../../src/lib/card-art-tokens.ts), [`card-materials.ts`](../../../src/lib/card-materials.ts), [`typography-presets.ts`](../../../src/lib/typography-presets.ts).
- Existing product boundaries: [`APP_UI_EDITOR_CORE_V1_FROZEN.md`](../APP_UI_EDITOR_CORE_V1_FROZEN.md), [`interaction-system.md`](../interaction-system.md), [`master-cards.md`](../master-cards.md), [`job-icon-sources.md`](../job-icon-sources.md).

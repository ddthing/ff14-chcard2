# shadcn Stone 테마 적용 · 2026-10-10

사용자 요청: `npx shadcn@latest apply --preset bJMSkfGi --only theme`으로 UI/UX 개선.

**최신 보정:** 이후 사용자가 설치한 테마의 엄격한 준수를 명시했다. [엄격한 Stone 준수](./STRICT_STONE_THEME_2026-10-10.md)가 아래 최초 적용의 대비 파생값·별도 성공색 정책보다 우선한다. 공식 원본 토큰을 변형하지 않고 직접 연결한다.

## 공식 적용

공식 CLI로 preset을 decode하여 Nova, base/theme/chart Stone, default radius(10px), subtle menu 설정을 확인했다. 기존 프로젝트에 `components.json`이 없어 최소 설정을 만든 뒤 프로젝트 루트에서 다음 명령을 실행했다.

```powershell
npx --yes shadcn@latest apply --preset bJMSkfGi --only theme --yes
```

CLI는 Next.js, Tailwind v4와 import alias를 확인하고 `components.json`, `src/app/shadcn-theme.css`를 갱신했으며 성공으로 종료했다. `--yes`는 지정한 적용의 대화형 확인만 생략한다. 명령 전후 `package.json`과 `package-lock.json`의 SHA-256이 같아 의존성 변경이 없음을 확인했다.

[`--only theme` 공식 문서](https://ui.shadcn.com/docs/changelog/2026-04-partial-preset-apply)에 맞춰 폰트와 기존 UI 컴포넌트를 교체하지 않았다. CLI 설정에 lucide가 기록되어 있지만 아이콘 패키지를 설치하거나 게임의 원본 직업 자산을 교체한 것은 아니다.

## 적용 구조

- `shadcn-theme.css`: 공식 CLI가 생성한 CSS 원본. 라이트/다크 Stone 토큰, 10px 기준 radius와 Tailwind semantic utility 연결.
- `globals.css`: 공식 파일을 로드하고 중복된 legacy muted 토큰을 정리한다. 전역 포커스·선택 영역·skip link를 앱 의미 토큰에 연결한다.
- `app-theme.css`: background/card/popover/muted/foreground/primary 토큰을 기존 `--app-*` 역할로 연결한다. 작은 글자와 입력 경계·포커스는 읽기 쉬운 대비를 위해 파생하며 별도 성공 상태는 유지한다.
- appearance bootstrap/provider: 저장된 system/light/dark 선호와 공식 `.dark` 클래스를 첫 렌더 전부터 동기화한다. 기존 저장 키와 다른 탭 동기화는 유지한다.
- 브라우저 상단 색상도 실제 앱 선택을 따른다. Stone background의 sRGB 값은 밝게 `#ffffff`, 어둡게 `#0c0a09`이며 OS 테마가 수동 선택을 덮지 않도록 한다.
- 카드 render scope는 공식 파일에 선언된 원본·utility·radius 변수를 `initial`로 차단한다. 격리 테스트는 해당 파일의 실제 토큰 목록에서 필요한 reset과 금지할 참조를 도출한다.
- 기존 화면 CSS: 버튼·입력·선택·메뉴·모달의 실제 조작부에 공통 radius를 적용하고 포커스 링을 정돈한다. 원·슬라이더 thumb·비율 도형·작품 프레임 같은 별도 의미가 있는 기하는 유지한다.

## 승인 범위와 경계

이번 명시적 preset 요청은 V3 앱 팔레트의 새 변경 승인이다. 흰색·Stone 잉크·차콜의 중립 작업대를 쓰며 이전 버건디 앱 강조색으로 다시 덮지 않는다. 카드 인쇄물은 자신의 사진·팔레트·재료·폰트·직업 자산을 계속 사용한다. 경로·정보 순서·업로드·undo/redo·저장·카드 렌더러·출력을 새로운 데모 컴포넌트로 교체하지 않는다.

기존 코드 감사에서 현재 네비게이션·오류 복구·모달·상태 안내는 이미 구현되어 있었다. 기능 추가보다 색상 역할, 일관된 컨트롤, 키보드 포커스에 집중했다. 저장소의 다른 진행 중 변경을 되돌리지 않았다.

## 검증

- TypeScript, ESLint, 최종 프로덕션 빌드 통과.
- 전체 테스트 248개 통과, 실패 0개, 기존 아카이브 검사 29개 skip. bootstrap의 클래스·브라우저 색상 동기화와 카드 테마 변수 격리 검사를 보강했다. 최종 브라우저 색상 보정 후 해당 두 테스트 파일의 10개 검사도 다시 통과했다.
- 5개 경로 × 밝게/어둡게 × 320/390/1440px = 30개 화면: 가로 넘침 없음, main 존재, 앱 테마와 `.dark` 및 브라우저 상단 색상 일치.
- 961/1024px의 KO/EN/JA 에디터 헤더 6개 검사: 가로 넘침 없음. 증거 없는 추측을 이유로 breakpoint를 변경하지 않았다.
- 현재 카드 92개 요소의 색상·배경·글꼴·크기·테두리를 적용 전과 비교했다. 새 라이트/다크 모두 동일했다. 카드 내부의 새 background/primary/radius 테마 변수도 computed style에서 비어 있음을 확인했다.
- 실제 4:5 PNG 1×를 두 앱 테마에서 각각 다운로드했다. PNG 시그니처와 1080×1350 치수, 약 2.8MB 크기를 확인했고 SHA-256이 같아 두 출력 파일이 완전히 동일했다.
- 390px의 다섯 비율 선택은 약 62.8×72px 조작 영역을 유지했다. 브라우저 error 로그 0개. 독립 검토의 두 지적(브라우저 상단 색상, 새 변수의 출력 상속)을 수정한 뒤 재검토에서 미해결 지적 없음.

로컬 증거는 Git 제외 경로 `tmp/shadcn-2026-10-10/`에 보관한다: `home-before.jpg`, `home-light.jpg`, `home-dark.jpg`, `home-mobile.jpg`, `editor-before.jpg`, `editor-light.jpg`, `editor-dark.jpg`, `editor-mobile.jpg`, `card-before-styles.json`, `route-results.json`, `localized-header-results.json`, `export-light.png`, `export-dark.png`, `export-results.json`, `tests.log`, `build.log`.

UI 테마 적용과 대표 카드의 출력 분리를 검증한 범위다. 모든 카드·비율·언어·배율의 전체 출력 조합이나 실제 휴대폰 OS 키보드·성능을 검증했다는 뜻은 아니다.

이 저장소에는 portable-brain의 `protocols/`, `memory/`, `.agent/tools/`가 없어 해당 CLI를 실행하지 못했다. 이 기록을 변경·판단·검증의 근거로 남긴다.

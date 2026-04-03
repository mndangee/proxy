# DataForge (Proxy)

## 소개

- **Electron + React + TypeScript** 기반 데스크톱 애플리케이션입니다.
- **프로젝트 관리**: 홈에서 프로젝트를 생성·목록 조회하며, 데이터는 브라우저 **localStorage**에 저장됩니다.
- **API 탐색**: 프로젝트별 API 엔드포인트 목록, 응답 시나리오(로컬/테스트/에러) 선택, JSON 더미 편집(`/api/json`) 흐름을 지원합니다.
- **UI**: 디자인 시스템 토큰(`bg-background-*`, `text-label-*`, `typo-*` 등)과 Tailwind CSS 4.x, 공통 컴포넌트(`Btn`, `Input`, `Modal` 등)를 사용합니다.

## 기술 스택

- **Electron** — 데스크톱 런타임
- **React** — 18.x
- **TypeScript** — 5.x
- **Vite / electron-vite** — 7.x
- **Tailwind CSS** — 4.x (`src/styles/globals.css`의 `@theme` 중심, `tailwind.config.ts`는 플러그인 등 보조 설정)
- **Pretendard** — 기본 폰트

## 주요 기능

| 영역 | 설명 |
|------|------|
| **홈 (`/`)** | 저장된 프로젝트 카드 목록, 탭·히스토리 UI |
| **프로젝트 생성** | 헤더 **「새 프로젝트 만들기」** 또는 사이드바 **「프로젝트 생성하기」** → 전역 모달(`CreateProjectModal`). 이름·설명·즐겨찾기 입력 후 저장 |
| **프로젝트 상세 (`/project/:slug`)** | 프로젝트 메타·API 엔드포인트 테이블(목 데이터와 연동) |
| **API 상세 (`/api/:apiName`)** | 응답 그룹 라디오, 활성 응답 표시, JSON 편집기로 이동 |
| **JSON 편집 (`/api/json`)** | 쿼리(`apiName`, `type`, `responseValue` 등)로 리소스 편집,보내기·「응답으로 사용」 |
| **내비게이션** | 프로젝트 목록·API 목록·JSON 편집 시 응답 트리, 홈/즐겨찾기 아이콘 |
| **라이선스 (`/licenses`)** | 오픈소스 라이선스 목록 |
| **디자인 시스템 (`/design-system`)** | 컴포넌트 샘플 |

### 프로젝트 엔티티 (localStorage)

`src/libs/projects/store.ts`에서 `proxy-app-projects-v1` 키로 배열을 저장합니다.

- `id`, `name`, `description`, `createdAt`, `updatedAt`(ISO 8601), `isFavorite`

브라우저 이벤트:

- `proxy-projects-changed` — 목록·LNB 등 갱신용
- `open-create-project-modal` — 프로젝트 생성 모달 오픈(`requestOpenCreateProjectModal()`)

### 목 데이터 (API·엔드포인트)

- `src/libs/datadummy/api.ts` — API별 응답 그룹, 활성 응답 localStorage 연동
- `src/libs/datadummy/project.ts` — 프로젝트 ID별 엔드포인트 목록(저장된 프로젝트 ID와 매칭 시 사용)
- `src/libs/datadummy/home.ts` — 활동 목(`mockActivities`) 등, `slugify`는 `@/libs/slugify`로 re-export

## 폴더 구조

```
├── scripts
│   └── generate-licenses.js    # 오픈소스 라이선스 JSON 생성
├── src
│   ├── main                    # Electron 메인 프로세스
│   ├── preload
│   ├── renderer                # index.html, main.tsx, App.tsx (라우팅·History/해시 폴백)
│   ├── app                     # 페이지 (App Router 스타일)
│   │   ├── layout.tsx          # 루트 레이아웃, #modal, GlobalCreateProjectModal
│   │   ├── page.tsx            # 홈
│   │   ├── project/page.tsx    # 프로젝트 상세
│   │   ├── api/page.tsx        # API 탐색
│   │   ├── api/json/page.tsx   # JSON 리소스 편집
│   │   ├── design-system/page.tsx
│   │   └── licenses/page.tsx
│   ├── components
│   │   ├── common/             # Btn, Input, TextArea, Modal, ModalPortal, Radio, DropDown, Loader …
│   │   ├── shared/           # Header, Navigation, Table
│   │   ├── main/             # ProjectList, ProjectCard, CreateProjectModal, ProjectTab, HistoryList
│   │   ├── api/              # ApiExplorerHeader, ApiResponseSection, ApiResponseStatus
│   │   ├── project/          # ApiEndpointsTable, NoApiEndpoints
│   │   └── providers/        # GlobalCreateProjectModal
│   ├── libs
│   │   ├── projects/store.ts # 프로젝트 localStorage·이벤트
│   │   ├── datadummy/        # API·엔드포인트·활동 목 데이터
│   │   └── slugify.ts
│   ├── types/index.ts        # Project, ApiEndpoint, Activity 등
│   └── styles/               # globals.css(@theme), main.css 등
├── electron.vite.config.ts
├── tailwind.config.ts
├── package.json
└── tsconfig*.json
```

## 라우팅

- 개발 시 **path** 기준: `/`, `/project/e-commerce-mock`, `/api/VD.MOVS0001`, `/api/json?...`, `/licenses`, `/design-system` 등.
- Electron에서 `file://` 로 열릴 때는 **해시** 라우팅으로 폴백할 수 있습니다 (`src/electron/renderer/App.tsx`).
- 같은 경로에서 **쿼리만 바뀌는** 이동(예: `/api/json?...`)은 내부적으로 `locationKey`로 페이지를 구분해 폼·LNB가 갱신되도록 되어 있습니다.

## 모달

- `Modal` + `ModalPortal`은 `#modal` 노드(`layout.tsx`)에 포털로 렌더됩니다.
- 프로젝트 생성 모달은 레이아웃의 `GlobalCreateProjectModal`에서 한 번만 마운트되며, 헤더·내비에서 동일하게 열립니다.

## 설정

### Tailwind CSS

| 항목 | 설명 |
|------|------|
| **테마** | `src/styles/globals.css`의 `@theme { }` 로 컬러·타이포·간격 등 |
| **로딩** | `src/renderer/main.tsx`에서 `globals.css`, `main.css` import |
| **유틸** | `bg-background-primary`, `text-label-normal`, `rounded-3`, `typo-title-3` 등 |

### 디자인 시스템

- 공통 컴포넌트: `src/components/common` (`Btn`, `Input`, `Modal` …)
- 컬러·타이포는 `globals.css`의 `@theme` 및 컴포넌트에 정의된 `typo-*`, `text-label-*` 클래스를 따릅니다.

### 환경 변수

- 기본적으로 `.env` 없이 동작합니다. 필요 시 Vite 규칙에 맞게 `VITE_*` 변수를 두면 됩니다.

## 프로젝트 실행

### 사전 요구 사항

- **Node.js** 20.x 이상 권장 (저장소는 `.nvmrc` 기준 **Node 24** 사용을 가정할 수 있음).
- **npm** 9.x 이상

### Node를 찾지 못할 때

```sh
./dev
# 또는
bash scripts/dev.sh
```

### 초기 세팅

```sh
git clone [저장소 URL]
cd proxy
npm install
npm run licenses   # 선택: 라이선스 페이지용 JSON 생성
```

### 개발

```sh
npm run dev
```

- Electron 창이 열리며 Vite 개발 서버와 연동됩니다.
- 브라우저에서 Vite만 띄운 경우(예: `http://localhost:5173`)에도 동일한 페이지 구조로 동작할 수 있습니다(엔트리 설정에 따름).

### 빌드

```sh
npm run build
npm run build:mac | build:win | build:linux
```

### 기타 스크립트

```sh
npm run typecheck
npm run lint
npm run format
npm run licenses
```

## 라이선스 페이지

- `npm run licenses` → `src/json/licenses.json` 생성
- 앱 하단 푸터 **Open Source Licenses** 또는 `/licenses`

## 주의 사항

1. **Node 버전**: 네이티브 바인딩 오류 시 Node 버전 확인 후 `node_modules` 재설치를 시도하세요.
2. **프로젝트 데이터**: localStorage를 비우면 저장된 프로젝트가 사라집니다. 백업이 필요하면 별도 동기화 로직을 추가해야 합니다.
3. **라이선스 목록**: 의존성 변경 후 `npm run licenses`를 다시 실행하세요.

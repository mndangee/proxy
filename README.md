# DataForge (Proxy)

## 소개

- **Electron + React + TypeScript** 기반 데스크톱 애플리케이션입니다.
- **프로젝트 관리**: 홈에서 프로젝트를 생성·목록 조회합니다. **Electron**에서는 사용자 데이터 폴더에 프로젝트를 저장하고, **브라우저만 쓸 때**는 **localStorage** 폴백을 씁니다(아래 **데이터 저장 방식**).
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
| **내비게이션 (LNB)** | 프로젝트 목록·API 엔드포인트·JSON 편집 응답 트리; 홈·즐겨찾기 필터·접기/펼치기 (아래 **사이드 내비게이션** 참고) |
| **라이선스 (`/licenses`)** | 오픈소스 라이선스 목록 |
| **디자인 시스템 (`/design-system`)** | 컴포넌트 샘플 |

### 사이드 내비게이션 (`Navigation.tsx`)

`src/components/shared/Navigation.tsx` — 왼쪽 사이드바(LNB)입니다.

- **접기/펼치기**: `ToggleNaviIcon` 버튼으로 너비 전환(펼침 약 280px / 접힘 좁은 열).
- **홈**: `NavigationTopHomeIcon`으로 `/` 이동.
- **즐겨찾기만 보기** (프로젝트 목록이 나올 때만 표시): 클릭 시 **페이지 이동 없이** LNB 프로젝트 목록만 즐겨찾기 항목으로 좁힘. 꺼져 있을 때는 외곽 별 `StarIcon`, 켜져 있을 때는 채운 별 `FillStarIcon`으로 표시.
- **상단 아이콘 크기**: 펼침·접힘 모두에서 홈과 즐겨찾기 토글 별의 **표시 크기를 동일 계열로 맞춤** (코드상 홈 `18×18`px, 별 `22×22`px 등 Tailwind 고정 크기).
- **프로젝트 행**: 각 링크 왼쪽에 즐겨찾기 여부에 따라 `StarIcon` / `FillStarIcon`(목록 행은 `h-6 w-6`).
- **데이터**: `getStoredProjects()`로 목록 로드, `proxy-projects-changed` 이벤트로 갱신(`PROJECTS_CHANGED_EVENT` in `src/libs/projects/store.ts`).
- **경로별 패널**:
  - **홈 계열** (`/` 등): 검색 입력 + 프로젝트 목록 + **프로젝트 생성하기**(전역 모달).
  - **`/api/:apiName`**: 해당 프로젝트의 API 엔드포인트로 JSON 편집 진입 링크.
  - **`/api/json`**: `jsonEditorApiName` prop과 쿼리에 맞춰 로컬/테스트/에러 응답 그룹 네비.
- **props**: `activeProjectSlug`, `currentApiName`, `jsonEditorApiName`, `onNewProject`(미사용 시 생략 가능).

### 데이터 저장 방식

구현 위치: **`src/libs/projects/store.ts`**, **`src/libs/datadummy/api.ts`** 등.

#### 프로젝트 목록 (생성·즐겨찾기·삭제)

| 환경 | 저장 위치 | 비고 |
|------|-----------|------|
| **Electron** (preload `window.api.projects` 또는 IPC `project-fs:*` 사용 가능) | **디스크** — 주석 기준 `userData/DataForge-projects` 하위, 프로젝트별 폴더·매니페스트 | 생성/즐겨찾기/삭제/가져오기·내보내기는 IPC로 처리 |
| **그 외** (순수 브라우저 등) | **localStorage** 키 `proxy-app-projects-v1` — 프로젝트 객체 **JSON 배열** 전체를 직렬화해 저장 | 추가·수정 시 배열을 통째로 다시 저장 |

#### 저장 경로 (디스크 · Finder)

Electron에서는 **`app.getPath("userData")`** 아래에 **`DataForge-projects`** 폴더를 만들고, 프로젝트마다 **`{folderName}/`** 하위 디렉터리를 둡니다(구현: `src/electron/main/project-fs.ts`의 `getProjectsRoot()`).

| 플랫폼 | `userData` 예시 (앱 이름에 따라 달라질 수 있음) | 프로젝트 루트 |
|--------|-----------------------------------------------|----------------|
| **macOS** | `~/Library/Application Support/proxy` — `electron-builder.yml`의 **`productName: proxy`** 기준 | `…/proxy/DataForge-projects/` |
| **Windows** | `%APPDATA%\proxy` 근처( Electron 기본 규칙) | `…\proxy\DataForge-projects\` |
| **Linux** | `~/.config/proxy` 근처( Electron 기본 규칙) | `…/proxy/DataForge-projects/` |

- **한 프로젝트 폴더**: `{위 루트}/{folderName}/` — 내부에 **`project.json`**, **`apis/`** 등(레이아웃은 `src/libs/project-fs/layout.ts` 참고).
- **macOS에서 Finder로 열기**: **이동 → 폴더로 이동…**(⌘⇧G)에 다음을 입력합니다.

  `~/Library/Application Support/proxy/DataForge-projects`

  개발/빌드 설정으로 앱 **표시 이름**이 바뀌면 `proxy` 대신 해당 이름의 `Application Support` 하위 폴더를 확인하세요. 정확한 루트는 런타임에 IPC **`project-fs:getRootPath`**(`getProjectsRootPath()` 호출)로도 확인할 수 있습니다.

- **브라우저만 사용할 때** 프로젝트 목록은 **디스크 폴더가 아니라** 해당 출처(origin)의 **localStorage** `proxy-app-projects-v1`에만 있습니다(개발 서버 URL과 배포 URL이 다르면 서로 다른 저장소).

**공통 동작**

- 앱에서 쓰는 목록은 메모리 **`projectsCache`**에 두고, UI는 **`getStoredProjects()`**로 읽습니다. Electron 경로에서는 부팅 시 **`hydrateProjects()`**로 디스크에서 채웁니다.
- **마이그레이션**: 디스크 API가 있고 디스크 목록이 비어 있을 때, 예전 **localStorage** `proxy-app-projects-v1`에 데이터가 있으면 **`migrateFromLegacy`**로 한 번 옮긴 뒤 해당 키를 비웁니다.
- 저장된 뒤 **`notifyProjectsChanged()`** → 커스텀 이벤트 **`proxy-projects-changed`**(`PROJECTS_CHANGED_EVENT`)로 LNB·홈 카드 등이 갱신됩니다.
- **`open-create-project-modal`** 이벤트: `requestOpenCreateProjectModal()` 호출 시 전역 프로젝트 생성 모달 오픈.

**프로젝트 레코드 필드** (타입 `Project`)

- `id`, `name`, `description`, `createdAt`, `updatedAt`(ISO 8601), `isFavorite`
- Electron·디스크 사용 시 **`folderName`**(슬러그형 폴더명 등)이 함께 옵니다.

#### API별 “현재 선택된 응답” (탐색 UI 상태)

- **`src/libs/datadummy/api.ts`**: 응답 시나리오 **목록(로컬/테스트/에러)** 자체는 **코드에 정의된 목 데이터**입니다.
- 사용자가 API 화면에서 고른 **활성 응답**은 **localStorage** 키 **`active-api-response:${apiName}`** 에 JSON으로 저장됩니다(`getStoredActiveApiResponse` / `setStoredActiveApiResponse`). JSON 편집기 진입 URL(`getJsonEditorEntryHref`)도 이 값을 참고합니다.

#### 그 외 목 데이터

- `src/libs/datadummy/project.ts` — 프로젝트 **ID**별 API 엔드포인트 목록(저장소에 있는 프로젝트 `id`와 맞출 때 사용)
- `src/libs/datadummy/home.ts` — 홈 활동 목(`mockActivities`) 등
- `slugify`: `@/libs/slugify`

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
│   │   ├── projects/store.ts # 프로젝트 디스크(Electron)·localStorage 폴백·이벤트
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
npm run docs:data-guide-pdf   # docs/data-lifecycle-guide.md → PDF (Chromium 기반, 최초 1회 다운로드)
```

## 문서

- **`docs/data-lifecycle-guide.md`** — 프로젝트 데이터 **생성·저장·삭제** 흐름을 코드 파일/함수 단위로 정리한 가이드. PDF로 보려면 위 `docs:data-guide-pdf` 또는 문서 맨 아래 **「PDF로 보기」** 절 참고.
- **`docs/project-full-flow-usage.md`** — 프록시 + 업스트림을 함께 쓰는 **프로젝트 전체 동작 기준** 실사용 가이드(포트 구성, 게이트웨이 사용 조건, Windows/Node 주의점 포함).
- **`docs/DataForge-프로젝트-개요-및-사용법.pptx`** — 개요·사용법 정리용 PowerPoint(저장소에서 그대로 내려받거나 Finder에서 `docs` 폴더로 이동). 내용 갱신: `npm run docs:project-overview-ppt`

## 라이선스 페이지

- `npm run licenses` → `src/json/licenses.json` 생성
- 앱 하단 푸터 **Open Source Licenses** 또는 `/licenses`

## 주의 사항

1. **Node 버전**: 네이티브 바인딩 오류 시 Node 버전 확인 후 `node_modules` 재설치를 시도하세요.
2. **프로젝트 데이터**: 브라우저만 사용할 때는 **localStorage** `proxy-app-projects-v1`을 지우면 목록이 사라집니다. **Electron**에서는 사용자 데이터 폴더의 프로젝트 디렉터리를 지워야 합니다. 백업·동기화는 앱에 내장되어 있지 않으면 별도 처리가 필요합니다.
3. **라이선스 목록**: 의존성 변경 후 `npm run licenses`를 다시 실행하세요.

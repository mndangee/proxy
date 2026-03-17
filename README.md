# DataForge (Proxy)

## 소개

- Electron + React + TypeScript 기반 데스크톱 애플리케이션
- 프로젝트 관리 및 API/엔드포인트 모니터링 대시보드를 제공합니다.
- UI Kit v1.0 디자인 시스템과 Tailwind CSS 테마를 적용한 공통 컴포넌트를 사용합니다.

## 기술 스택

- **Electron** - 데스크톱 앱 런타임
- **React** - 18.x
- **TypeScript** - 5.x
- **Vite** - 7.x (electron-vite)
- **Tailwind CSS** - 4.x
- **Pretendard** - 기본 폰트

## 폴더 구조

```
├── .vscode                     # VS Code 설정 (launch, settings, extensions)
├── scripts
│   └── generate-licenses.js    # 오픈소스 라이선스 목록 생성
├── src
│   ├── main                    # Electron 메인 프로세스
│   ├── preload                 # Preload 스크립트
│   ├── renderer                # 렌더러 엔트리 (index.html, main.tsx, App.tsx)
│   ├── app                     # App Router 스타일 페이지/레이아웃 (Next.js와 유사)
│   │   ├── layout.tsx          # 루트 레이아웃 (공통 shell, 푸터)
│   │   ├── page.tsx            # 홈 (기본 라우트)
│   │   ├── project/
│   │   │   └── page.tsx        # 프로젝트 상세·API 엔드포인트 (#project/:id)
│   │   └── licenses/
│   │       └── page.tsx        # 라이선스 페이지 (#licenses)
│   ├── json                     # JSON 데이터 (licenses.json 등)
│   ├── components              # 컴포넌트
│   │   └── common              # 공통 UI
│   │       ├── badge            # MethodTag, StatusBadge
│   │       ├── button           # Button
│   │       ├── callout          # Callout
│   │       ├── card             # Card, ProjectCard, NewProjectCard, ActivityListItem 등
│   │       ├── header           # AppHeader, PageHeader
│   │       ├── nav              # NavItem
│   │       ├── tabs             # Tabs
│   │       └── typography       # Heading, BodyText
│   ├── libs
│   │   └── data                # 목 데이터 (mocks)
│   ├── types                   # 공통 타입 정의 (index.ts)
│   └── styles                  # 스타일 (globals.css, main.css, base.css, Tailwind 테마)
├── electron.vite.config.ts
├── package.json
├── tsconfig.json
├── tsconfig.web.json
└── tsconfig.node.json
```

> 비어 있는 디렉터리는 두지 않습니다. 공통 타입은 `src/types`에만 정의합니다.
>
> **라우팅**: Next.js App Router처럼 `app/` 아래 폴더·`page.tsx`로 페이지를 구성합니다. 개발 서버(`http://localhost:5173`)에서는 path 기반 URL을 사용합니다. `/`(홈), `/licenses`, `/project/프로젝트이름-slug` 형태이며, History API로 페이지 전환합니다. `file://` 로드 시(예: Electron 패키징 빌드)에는 해시(`#home`, `#licenses` 등)로 자동 폴백합니다.

## 설정

### Tailwind CSS 사용 방법

이 프로젝트는 **Tailwind CSS 4.x**를 사용하며, **설정 파일(`tailwind.config.js` 등) 없이** CSS만으로 테마를 지정합니다.

| 항목 | 설명 |
|------|------|
| **테마 정의** | `src/styles/globals.css`에서 `@theme { }` 블록으로 컬러·타이포·간격·radius·shadow 등 정의 |
| **스타일 로딩** | `src/renderer/main.tsx`에서 `../styles/globals.css`, `../styles/main.css` 로드 |
| **유틸 클래스** | `@theme`에 정의한 변수 이름으로 `bg-primary-500`, `text-neutral-900`, `rounded-3`, `shadow-lv2` 등 사용 |
| **커스텀 클래스** | 같은 파일의 `@layer components`에 `.text-h1`, `.text-body`, `.typo-label`, `.cn-center` 등 정의 (필요 시 여기서 `@apply`로 테마 변수 조합) |

- **UI Kit (DataForge)**: `--color-primary-*`, `--color-neutral-*`, `--color-success`, `--color-error` 등 → `bg-primary-500`, `text-neutral-600` 형태로 사용
- **Pola 테마**: `:root` / `html[data-theme="light"|"dark"|"pink"|"green" …]` 안의 CSS 변수(`--primary-normal` 등)와 `@theme inline`으로 연결 → `bg-primary-normal`, `text-font-high` 등 사용. 테마 전환은 `<html data-theme="dark">`처럼 지정

### 지정 컬러를 바꾸고 싶을 때

모든 지정 컬러는 `src/styles/globals.css` 한 파일에서 수정합니다.

1. **UI Kit 컬러 (Primary, Neutral, Success, Error 등)**  
   - **위치**: `src/styles/globals.css` 맨 위 **첫 번째 `@theme { }` 블록** 안
   - **변수**: `--color-primary`, `--color-primary-500`, `--color-neutral-900`, `--color-success`, `--color-error` 등
   - **방법**: 해당 줄의 HEX(또는 사용 중인 값)만 원하는 색으로 바꾸면 됩니다.  
     예: `--color-primary-500: #306df2;` → `--color-primary-500: #2563eb;`
   - **결과**: `bg-primary-500`, `text-primary`, `border-neutral-200` 등 해당 이름을 쓰는 유틸리티가 모두 새 컬러로 적용됩니다.

2. **Pola 계열 컬러 (primary-normal, secondary, menu, bg 등)**  
   - **위치**: 같은 파일의 **`:root`** 와 **`html[data-theme="light"]` / `html[data-theme="dark"]`** 등 블록
   - **변수**: `--primary-normal`, `--primary-light`, `--secondary-normal`, `--menu-bg`, `--bg-normal` 등
   - **방법**: 바꾸고 싶은 테마(light/dark 등) 블록에서 해당 변수 값(HEX)을 수정
   - **결과**: `bg-primary-normal`, `text-secondary-normal` 등 Pola 이름 유틸리티와 `data-theme`에 따른 배경/글자색이 바뀝니다.

3. **한 번에 초기화하고 싶다면**  
   - `@theme` 블록에서 `--color-*: initial;` 등으로 기존 팔레트를 지우고, 필요한 `--color-이름: #hex;` 만 새로 정의하는 방식도 가능합니다. (Tailwind v4 문서의 “Overriding the default theme” 참고)

### 디자인 시스템 (UI Kit v1.0)

- **Tailwind 테마**: `src/styles/globals.css`의 `@theme` 블록에서 컬러·타이포·간격 정의
- **컬러**: Primary Blue `#306DF2`, Neutral 900/600/400, Success `#0BBA64`, Error `#EF4C4C`
- **타이포그래피**: `.text-h1`, `.text-h2`, `.text-body`, `.text-details` 유틸 클래스 사용
- **공통 컴포넌트**: `src/components/common` (Button, PageHeader, ProjectCard, ActivityListItem 등)

### 초기 환경 변수 설정

- 현재 프로젝트는 별도 `.env` 파일 없이 동작합니다.
- 빌드/실행 시 환경 변수가 필요한 경우 프로젝트 루트에 다음처럼 추가할 수 있습니다.

```sh
# .env.local (로컬 개발)
# .env.production (프로덕션 빌드)
```

- 예시:

```yml
# 예시 (필요 시 사용)
API_URL=http://localhost:3000
```

- Vite/Electron에서 사용하려면 `import.meta.env.VITE_*` 형태로 노출하고, `electron.vite.config` 또는 메인 프로세스에서 읽도록 설정하면 됩니다.

## 프로젝트 실행

### 사전 요구 사항

- Node.js 20.x 이상 권장 (Tailwind v4, Vite 7 호환). 이 프로젝트는 **Node 24**를 기준으로 합니다 (`.nvmrc` 참고).
- [nvm](https://github.com/nvm-sh/nvm) 사용 시: 저장소 루트에서 `nvm use`를 실행하면 `.nvmrc`에 지정된 버전(24)이 적용됩니다.
- npm 9.x 이상

### Node를 찾지 못할 때 (`env: node: No such file or directory`)

터미널에서 `nvm use` 후에도 `npm run dev` 실행 시 위 오류가 나면, **npm을 거치지 않고** nvm을 로드한 뒤 실행하는 스크립트를 사용하세요.

```sh
# 개발 서버 실행 (권장)
./dev
```

또는

```sh
bash scripts/dev.sh
```

- `scripts/dev.sh`는 nvm을 로드하고 `.nvmrc` 버전을 적용한 뒤 `electron-vite dev`를 실행합니다.
- `npm` 명령이 PATH에서 `node`를 찾지 못하는 환경(예: nvm 미로드 셸)에서도 동작합니다.

### 초기 세팅

1. 저장소 클론

   ```sh
   git clone [저장소 URL]
   cd proxy
   ```

2. 의존성 설치

   ```sh
   npm install
   ```

3. (선택) 오픈소스 라이선스 목록 생성  
   - 라이선스 페이지에 목록을 표시하려면 한 번 실행합니다.

   ```sh
   npm run licenses
   ```

### 개발

```sh
npm run dev
```

- Node가 PATH에 정상적으로 있는 환경에서는 위 명령으로 실행합니다.
- `env: node: No such file or directory` 오류가 나면 **`./dev`** 또는 **`bash scripts/dev.sh`** 를 사용하세요 (위 “Node를 찾지 못할 때” 참고).

- Electron 창이 열리며 개발 서버와 연동됩니다.
- 라이선스 페이지: 앱 하단 푸터의 "Open Source Licenses" 링크 또는 `#licenses` 해시로 이동합니다.

### 빌드

```sh
# 타입 체크 후 빌드
npm run build

# 플랫폼별 패키징
npm run build:mac    # macOS
npm run build:win    # Windows
npm run build:linux  # Linux
```

### 기타 스크립트

```sh
npm run typecheck   # TypeScript 검사
npm run lint        # ESLint
npm run format      # Prettier 포맷
npm run licenses    # 라이선스 JSON 생성 (src/json/licenses.json)
```

## 라이선스 페이지

- 사용 중인 npm 패키지의 라이선스 정보를 확인할 수 있는 페이지를 제공합니다.
- 목록 생성: 프로젝트 루트에서 `npm run licenses` 실행 후 앱을 실행하면 됩니다.
- 생성된 파일: `src/json/licenses.json`
- 앱 내 접근: 하단 푸터 "Open Source Licenses" 클릭 또는 URL 해시 `#licenses`

## 주의 사항

1. **Node 버전**: `@tailwindcss/oxide` 등 네이티브 바인딩은 Node 20+ 환경에서 안정적입니다. `Cannot find native binding` 오류 시 Node 버전을 올리거나, `node_modules`와 `package-lock.json` 삭제 후 `npm install`을 다시 실행해 보세요.
2. **라이선스 목록**: 새 의존성 추가 후에는 `npm run licenses`를 다시 실행하면 최신 목록이 반영됩니다.

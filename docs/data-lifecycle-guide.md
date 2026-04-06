# 데이터 생성 · 저장 · 삭제 — 코드 따라가기 가이드

> 이 문서는 **프로젝트(폴더)** 와 **API 화면에서의 “선택한 응답”** 이 어디서 만들어지고, 어디에 쓰이고, 어떻게 지워지는지 **파일 이름과 함수 이름**으로 정리합니다.  
> 아래 **「PDF로 보기」** 를 참고하면 같은 내용을 PDF로 저장해 볼 수 있습니다.

---

## 1. 먼저 알아두면 좋은 것: 두 갈래 저장소

앱은 **렌더러(React)** 에서 `src/libs/projects/store.ts` 를 통해 데이터를 다룹니다.  
그 안에서 **디스크 API가 있으면 Electron**, 없으면 **브라우저 localStorage** 로 갈립니다.

| 구분 | 언제? | 실제 저장 |
|------|--------|-----------|
| **A. 디스크 (Electron)** | `window.api.projects` 가 있거나, `ipcRenderer.invoke("project-fs:…")` 를 쓸 수 있을 때 | `{userData}/DataForge-projects/{폴더명}/project.json` 등 |
| **B. localStorage 폴백** | 위 API가 없을 때 (브라우저만 띄운 경우 등) | 키 `proxy-app-projects-v1` 에 JSON 배열 통째로 |

분기 코드 위치: **`src/libs/projects/store.ts`** 의 `getProjectsApi()`, `addProject`, `deleteProject`, `updateProjectFavorite`, `hydrateProjects`.

---

## 2. 코드 지도 (어떤 파일을 보면 되나요?)

| 역할 | 파일 경로 |
|------|-----------|
| **목록·생성·삭제·즐겨찾기 (UI에서 쓰는 진입점)** | `src/libs/projects/store.ts` |
| **디스크에 폴더/JSON 읽기·쓰기 (메인 프로세스)** | `src/electron/main/project-fs.ts` |
| **렌더러 → 메인 IPC 노출 (preload)** | `src/electron/preload/index.ts` |
| **앱 시작 시 디스크에서 목록 채우기** | `src/electron/renderer/App.tsx` → `hydrateProjects()` |
| **프로젝트 생성 모달에서 저장 버튼** | `src/components/main/CreateProjectModal.tsx` → `addProject()` |
| **카드에서 즐겨찾기·삭제** | `src/components/main/ProjectCard.tsx` → `updateProjectFavorite()`, `deleteProject()` |
| **API별 “지금 고른 응답” localStorage** | `src/libs/datadummy/api.ts` (`getStoredActiveApiResponse` / `setStoredActiveApiResponse`) |
| **그 응답을 고를 때 저장하는 화면** | `src/app/api/page.tsx`, `src/app/api/json/page.tsx` |
| **폴더 구조 설명(주석)** | `src/libs/project-fs/layout.ts` |

---

## 3. 생성 (Create)

### 3.1 사용자가 “프로젝트 만들기”를 누르면

1. **`CreateProjectModal`** 이 `addProject({ name, description, isFavorite })` 를 호출합니다.  
   - 파일: `src/components/main/CreateProjectModal.tsx`

2. **`addProject`** (`store.ts`)  
   - 이름이 비어 있으면 `{ ok: false, error: "empty-name" }` 로 끝.  
   - **디스크 모드**: `disk.create(input)` → 내부적으로 IPC **`project-fs:create`**.  
   - **localStorage 모드**: `createProjectRecord()` 로 객체를 만들고, 기존 배열에 붙인 뒤 **`writeLegacyList(next)`** 로 통째로 저장.

### 3.2 Electron에서 실제로 디스크에 생기는 것

**`project-fs:create`** (`src/electron/main/project-fs.ts`, `ipcMain.handle("project-fs:create", …)`)

- 루트: `getProjectsRoot()` → `join(app.getPath("userData"), "DataForge-projects")`
- 새 폴더: 이름 슬러그 기반 + 충돌 시 `project-2`, `project-3` … (`uniqueFolderName`)
- 생성 작업:
  - `{folderName}/apis/` 디렉터리
  - **`project.json`** ← id, name, description, 날짜, isFavorite, folderName 등 전부 기록
  - **`apis/index.json`** ← 빈 배열 `[]` 로 시작

성공 시 렌더러는 **`projectsCache`** 를 최신화하고 **`notifyProjectsChanged()`** → 이벤트 **`proxy-projects-changed`** 로 LNB·홈 등이 다시 그려집니다.

---

## 4. 저장 / 수정 (Save — “다시 쓰기”에 해당하는 것들)

### 4.1 즐겨찾기만 바꿀 때

- **`updateProjectFavorite(projectId, isFavorite)`** (`store.ts`)
- **디스크**: IPC **`project-fs:updateFavorite`** → 해당 폴더의 **`project.json`** 을 읽어서 `isFavorite` 만 고쳐 다시 `writeFile`.
- **localStorage**: 배열에서 해당 프로젝트만 수정 후 **`writeLegacyList(list)`**.

호출 예: **`ProjectCard.tsx`** (즐겨찾기 토글).

### 4.2 프로젝트 목록 전체를 메모리에 맞추는 것

- **`hydrateProjects()`** (`store.ts`): 앱 기동 시 한 번(또는 필요 시) 디스크 `list` 또는 localStorage 를 읽어 **`projectsCache`** 채움.  
- 디스크 목록이 비어 있고 예전 localStorage 에 데이터가 있으면 **`migrateFromLegacy`** 한 뒤 legacy 키 삭제.

### 4.3 API 화면에서 “선택한 응답” (별도 저장)

- 시나리오 **목록** 자체는 코드에 박힌 목 데이터 (`getApiResponseGroups` 등).
- 사용자가 라디오 등으로 고른 **활성 응답** 은 **브라우저 localStorage** 에만 저장됩니다.  
  - 키: **`active-api-response:${apiName}`**  
  - 함수: **`setStoredActiveApiResponse`**, **`getStoredActiveApiResponse`** (`src/libs/datadummy/api.ts`)
- 호출하는 화면: **`src/app/api/page.tsx`**, **`src/app/api/json/page.tsx`**

프로젝트 **폴더** 와는 별개이므로, “API에서 고른 응답”만 백업하려면 해당 localStorage 키를 알아두면 됩니다.

---

## 5. 삭제 (Delete)

### 5.1 `deleteProject(projectId)`

파일: **`src/libs/projects/store.ts`**

1. `getStoredProjects()` 에서 `projectId` 로 항목을 찾음. 없으면 `{ ok: false, error: "not-found" }`.
2. **디스크 모드**: `folderName` 이 있어야 함 → IPC **`project-fs:delete`** 에 폴더명 전달.  
   - 메인: `fs.rm(projectRoot, { recursive: true, force: true })` 로 **폴더 통째 삭제**.
3. **localStorage 모드**: 배열에서 해당 id 제거 후 **`writeLegacyList(next)`**.

UI 예: **`ProjectCard.tsx`** 의 삭제 버튼.

### 5.2 안전장치

- **`project-fs:delete`** 는 폴더명에 `..`, `/`, `\` 가 들어오면 거절 (`isSafeProjectFolderName`).

---

## 6. 흐름을 한 줄로 요약

```
[사용자] 생성/삭제/즐겨찾기
    → store.ts (addProject / deleteProject / updateProjectFavorite)
        → (Electron) IPC project-fs:* → project-fs.ts 가 파일 시스템 조작
        → (브라우저) localStorage proxy-app-projects-v1 배열 덮어쓰기
    → notifyProjectsChanged() → proxy-projects-changed 이벤트 → UI 갱신
```

```
[사용자] API 탐색에서 응답 선택
    → api/page.tsx 또는 api/json/page.tsx
    → setStoredActiveApiResponse → localStorage active-api-response:…
```

---

## 7. PDF로 보기

같은 폴더의 이 파일(`docs/data-lifecycle-guide.md`)을 PDF로 바꾸는 예시입니다.

### 방법 A — VS Code / Cursor

1. Markdown 미리보기에서 편집기 상단 메뉴 또는 확장 기능으로 **Print / PDF 저장** (환경에 따라 “Markdown PDF” 등 확장 사용).

### 방법 B — Chromium 계열 (인쇄)

1. Markdown 을 HTML 로 렌더링한 뒤 브라우저에서 **인쇄 → PDF로 저장**.  
   - 예: VS Code에서 미리보기 열기 → 브라우저로 복사하거나, `npx serve` 로 볼 수 있는 정적 HTML 이 있으면 인쇄.

### 방법 C — Pandoc (설치되어 있을 때)

```bash
pandoc docs/data-lifecycle-guide.md -o docs/data-lifecycle-guide.pdf
```

### 방법 D — npm 패키지 (한 번에 PDF)

프로젝트 루트에서:

```bash
npx --yes md-to-pdf docs/data-lifecycle-guide.md
```

기본적으로 `docs/data-lifecycle-guide.pdf` 가 생성됩니다(도구 버전에 따라 경로 옵션 확인).

---

## 8. 디버깅 팁

- **“디스크에 저장된 프로젝트가 맞나?”**  
  macOS 예: `~/Library/Application Support/proxy/DataForge-projects/` (앱 `productName` 에 따라 `proxy` 가 달라질 수 있음).
- **“UI는 왜 안 바뀌지?”**  
  `notifyProjectsChanged()` 가 빠졌는지, `PROJECTS_CHANGED_EVENT` 를 듣는 컴포넌트가 있는지 확인.
- **“브라우저와 Electron 데이터가 다르다”**  
  서로 다른 저장소(localStorage vs `userData` 폴더)를 쓰기 때문입니다. Electron 첫 실행 시 legacy localStorage 는 **한 번** 마이그레이션될 수 있습니다(`hydrateProjects`).

---

*문서 버전: 저장소 코드 기준으로 작성. IPC 이름·파일 경로가 바뀌면 이 문서와 실제 코드를 함께 확인하세요.*

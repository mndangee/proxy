# GitHub Release 설명문 템플릿

앱 버전은 **`package.json`의 `version`**과 맞추고, Git 태그는 **`v` + 동일 번호**(예: `v0.1.0`)를 권장합니다.  
정식 1.0 전 **베타·프리뷰**는 보통 **`0.1.0`부터** 시작합니다(현재 저장소도 `0.1.0`).

아래 블록을 복사해 Releases → **Describe this release**에 붙여 넣고, `vX.Y.Z`·날짜·체크리스트만 바꿔 쓰면 됩니다.

---

## vX.Y.Z (YYYY-MM-DD)

### 한 줄 요약

DataForge(Proxy) 데스크톱 빌드 — 로컬 모의 API·프록시 설정·업스트림 자동 실행·다운로드 안내 페이지 포함.

### 포함 파일 (Assets)

| 파일 | 설명 |
|------|------|
| `proxy-0.1.0.dmg` 등 | macOS용 설치 이미지 (`${name}-${version}`) |
| `proxy-0.1.0-setup.exe` 등 | Windows용 설치 프로그램(NSIS) |

※ 실제 파일명은 `electron-builder.yml`의 `artifactName` 규칙에 따릅니다. 위 이름이 다르면 표만 수정하세요.

### 설치 · 실행

- **macOS**: DMG를 열고 앱을 Applications로 드래그한 뒤 실행합니다. (보안 경고 시 시스템 설정에서 허용)
- **Windows**: `setup.exe` 실행 후 안내에 따라 설치합니다.

### 주요 기능 (이번 빌드 기준)

- 프로젝트·API·JSON 응답 관리 (Electron 시 디스크 저장)
- **프록시 설정**: 모의 서버 ON/OFF, 포트, 프로토콜 프로필(레거시 트랜 봉투 / 일반 JSON REST)
- **업스트림 자동 실행**: 백엔드 작업 폴더·포트·(선택) Node 경로·커스텀 명령
- **다운로드 · 공유** (`/downloads`): Releases·ZIP·문서·PPT 링크 모음

### 문서

- [README](https://github.com/mndangee/proxy/blob/main/README.md) — 설치·빌드·다운로드 표
- [프로젝트 전체 동작 가이드](https://github.com/mndangee/proxy/blob/main/docs/project-full-flow-usage.md)
- 개요 PPT: 저장소 `docs/DataForge-프로젝트-개요-및-사용법.pptx` 또는 Releases Assets에 첨부한 경우 여기서 다운로드

### Node 관련 (사용자 안내)

- **앱(EXE/DMG) 실행**: Electron에 런타임이 포함되어 있어 **시스템에 Node가 없어도** 됩니다.
- **업스트림 자동 실행**을 쓰는 경우에만 별도 **Node(또는 설정한 node.exe 경로)**가 필요할 수 있습니다.

### 소스에서 빌드하려면

```bash
git clone https://github.com/mndangee/proxy.git
cd proxy
npm install
npm run build:mac   # 또는 build:win
```

산출물은 저장소 루트 **`dist/`** 에 생성됩니다.

### 알려진 제한

- Windows에서 **업스트림 커스텀 명령**은 `cmd /c` 기준으로 실행됩니다. 셸 전용(`sh -lc`) 스크립트는 Mac/Linux에 맞춰 작성하세요.
- 릴리스에 바이너리를 첨부하지 않은 경우, 위 **소스에서 빌드** 절을 안내하세요.

---

## 짧은 버전 (패치·핫픽스용)

```
## v0.1.1

- 수정: …
- 문서: …

**Assets:** macOS `.dmg`, Windows `setup.exe` (또는 해당 릴리스에 첨부된 파일명 그대로)

**문서:** README · docs/project-full-flow-usage.md
```

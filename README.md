# DataForge

DataForge는 프로젝트 코드를 바꾸지 않고 저장된 더미 응답을 사용할 수 있게 해주는 Electron 기반 로컬 프록시 도구입니다. JSON 응답을 API별로 관리하고, 조건에 맞는 더미가 없으면 기존 프로젝트 서버로 요청을 전달합니다.

## 주요 기능

- JSON 파일·폴더·ZIP에서 더미 데이터 가져오기
- `tranId`를 기준으로 API 이름과 설명 자동 연결
- Default, Test, Error 응답 관리
- URL 쿼리 파라미터별 응답 선택
- 응답 JSON 편집, 저장 및 즉시 적용
- 기존 프로젝트 서버 포트 전환 및 원래 포트 복구
- 더미가 없는 요청을 실제 프로젝트 서버로 전달
- 연결 상태 진단과 단계별 오류 안내
- 최근 요청의 트랜 ID, 처리 결과, 상태 코드와 응답 시간 확인
- 정상 종료 및 비정상 종료 후 프로젝트 서버 복구
- macOS와 Windows 실행·배포 지원

## 사용 방법

### 1. 더미 데이터 가져오기

홈에서 `더미 데이터 가져오기`를 누르고 JSON 파일, 폴더 또는 DataForge ZIP을 선택합니다.

서버에서 받은 다음 형식의 파일명도 인식합니다.

```text
VD_CMDJ0089_1080_Test.json
```

- `VD_CMDJ0089` → 트랜 ID `VD.CMDJ0089`
- `1080` → 동일 트랜 내 응답을 구분하는 sourceId
- `Test` → 응답 라벨 및 Test 분류

라벨에 Default, Test, Error 의미가 있으면 해당 분류를 우선합니다. 명시적인 Default가 없으면 sourceId가 가장 빠른 응답을 Default로 사용하고 나머지는 Test로 분류합니다.

### 2. API 이름과 설명 자동 연결

가져오기 과정에서 모듈 파일의 다음 형식을 찾아 트랜 정보와 연결합니다.

```js
getRsrvList: {
  tranId: "VD.MOVS0018",
  desc: "예약목록 조회",
}
```

연결 결과:

```text
API 이름: getRsrvList
트랜 ID: VD.MOVS0018
설명: 예약목록 조회
```

탐색 순서:

1. 가져온 데이터 폴더와 상위 경로
2. 해당 작업 공간에 연결된 API 정보 파일
3. 프록시에 설정된 서버 코드 폴더(보조 경로)

데이터와 API 정보가 서로 관련 없는 위치에 있으면 파일 선택창이 표시됩니다. 파일명과 위치는 제한하지 않으며 `tranId` 구조가 있는 JS·TS·JSON 파일을 여러 개 선택할 수 있습니다. 선택한 경로는 해당 작업 공간의 `project.json`에만 저장되므로 다른 프로젝트와 섞이지 않습니다. 선택을 취소해도 트랜 ID를 API 이름으로 사용해 가져오기는 계속됩니다.

프로젝트 상세의 `API 정보 다시 분석`은 저장된 파일들을 다시 읽고, `API 정보 파일 변경`은 다른 파일을 선택해 해당 프로젝트의 연결 정보만 교체합니다.

Default 응답이 하나뿐이고 모듈 설명을 찾았다면 해당 `desc`를 응답 제목으로 사용합니다.

### 3. 응답 편집 및 사용

API 상세에서 응답을 선택하고 JSON 편집 화면으로 이동합니다.

- 제목, 설명, 타입과 JSON 본문을 편집할 수 있습니다.
- `key=value&key2=value2` 형식으로 URL 쿼리 조건을 지정할 수 있습니다.
- 쿼리 조건이 모두 일치하는 응답 중 조건이 많은 응답을 우선합니다.
- 일치하는 조건 응답이 없으면 조건 없는 Default 응답을 사용합니다.
- `응답으로 사용`을 누르면 현재 편집 내용을 먼저 저장한 뒤 활성화합니다.
- 처리 중에는 버튼이 잠기며 `저장 중`, `적용 중` 상태가 표시됩니다.

### 4. 더미 응답 연결

기본 포트 구성:

| 역할 | 포트 | 설명 |
| --- | ---: | --- |
| 프로젝트 요청 | `7777` | 기존 클라이언트가 호출하는 주소 |
| 프로젝트 서버 | `7778` | 더미가 없을 때 전달할 실제 서버 |
| DataForge 내부 서버 | `4780` | 저장된 더미 응답 조회 전용 |

프로젝트 서버가 없다면 서버 코드 설정 없이 더미 전용으로 연결할 수 있습니다. 이 경우 저장되지 않은 요청은 실제 서버로 전달할 수 없습니다.

실행 중인 프로젝트 서버와 실제 응답을 함께 사용하려면:

1. 프록시 설정에서 프로젝트 서버 폴더를 선택합니다.
2. DataForge가 실행 명령을 자동 감지합니다.
3. `연결 시작`을 누릅니다.
4. 기존 서버 종료를 확인하면 프로젝트 서버를 `7778`에서 다시 실행합니다.
5. DataForge 프록시가 기존 요청 주소인 `7777`을 사용합니다.

```text
클라이언트 :7777
  → 저장된 응답이 있으면 DataForge 더미 사용
  → 저장된 응답이 없으면 실제 서버 :7778로 전달
```

`연결 끊기`는 모든 서버를 종료하는 기능이 아닙니다. DataForge 프록시를 종료하고 프로젝트 서버를 원래 `7777` 포트로 복구합니다.

### 5. 최근 요청

화면 하단의 원형 버튼에서 다음 내용을 확인할 수 있습니다.

- HTTP 메서드와 요청 경로
- 트랜 ID
- 더미 응답 또는 실제 서버 처리 여부
- 사용된 응답 라벨
- 상태 코드와 응답 시간

저장된 더미 요청을 누르면 API 상세로 이동합니다. 최근 요청은 최대 100개, 7일 동안 보관되며 앱을 다시 실행해도 유지됩니다. 패널을 확인하면 새 요청이 들어오기 전까지 읽지 않은 배지가 사라집니다.

## 서버 전환과 복구

프로젝트 서버를 전환하면 `active-proxy-takeover.json`에 원래 포트, 이동 포트, 서버 폴더와 실행 명령을 기록합니다.

- 연결 해제 또는 정상 종료 시 프로젝트 서버를 원래 포트로 복구합니다.
- 강제 종료 후 다음 실행에서도 남은 기록과 포트를 확인해 복구합니다.
- 다른 프로그램이 원래 포트를 사용 중이면 강제로 종료하지 않습니다.
- 복구 결과는 DataForge 공통 알림으로 한 번만 표시합니다.

## 데이터 저장 위치

Electron의 `app.getPath("userData")` 아래에 저장합니다.

| 데이터 | 위치 |
| --- | --- |
| 프로젝트와 API 응답 | `DataForge-projects/` |
| 프록시 설정과 활성 응답 | `proxy-app-config.json` |
| 최근 요청 | `recent-proxy-requests.json` |
| 서버 전환 기록 | `active-proxy-takeover.json` |
| 프로젝트별 API 정보 파일 경로 | 각 프로젝트의 `project.json` 내 `apiMetadataSources` |
| 가져오기 호환용 최근 모듈 경로 | `import-interface-source.json` |

플랫폼별 기본 위치:

| 플랫폼 | 예시 |
| --- | --- |
| macOS | `~/Library/Application Support/proxy/` |
| Windows | `%APPDATA%\proxy\` |
| Linux | `~/.config/proxy/` |

새 컴퓨터에는 포트 기본값만 제공되며 프로젝트 경로, 실행 명령과 더미 데이터는 비어 있습니다. 같은 컴퓨터에서 앱만 다시 설치하면 기존 userData가 유지될 수 있습니다.

순수 브라우저 환경에서는 일부 데이터가 localStorage에 저장되지만, 파일 가져오기와 프록시 제어는 Electron 앱에서만 사용할 수 있습니다.

## 개발 환경 실행

요구 사항:

- Node.js 24.x
- npm 9 이상

```bash
git clone https://github.com/mndangee/proxy.git
cd proxy
npm install
npm run dev
```

Windows에서는 PowerShell 또는 명령 프롬프트에서 같은 명령을 사용합니다. macOS에서는 다음 명령도 사용할 수 있습니다.

```bash
./run-mac
# 또는
npm run run:mac
```

## 검사와 빌드

```bash
npm run typecheck
npm run lint
npm run build
```

```bash
npm run build:win          # Windows x64
npm run build:win:arm64    # Windows ARM64
npm run build:mac          # macOS ARM64
npm run build:linux
```

## 서명하지 않은 macOS 앱 배포

Apple 개발자 인증서 없이 사내·테스트용 앱을 만들 수 있습니다.

```bash
npm run bundle:mac:unsigned:arm64 # Apple Silicon
npm run bundle:mac:unsigned:x64   # Intel Mac
```

생성된 `dist/proxy-mac-unsigned-{아키텍처}.zip`에는 다음 파일이 포함됩니다.

```text
proxy.app
open.mac.command
README-MAC.txt
```

사용자는 ZIP 압축을 푼 뒤 `open.mac.command`를 더블클릭합니다. 외부 배포에는 Apple 인증서 서명과 공증을 권장합니다.

## 프로젝트 구조

```text
src/
├── app/                  # 화면과 라우트
├── assets/svg/           # 공통 SVG 아이콘
├── components/           # API, 모달, 홈, 프로젝트와 공통 UI
├── electron/
│   ├── main/             # 저장소, 프록시, 서버 전환과 복구
│   └── preload/          # 렌더러 IPC 브리지
├── libs/                 # 메타데이터 분석, 응답과 프로젝트 저장
├── styles/               # 디자인 토큰과 전역 스타일
└── types/                # 공통 타입
```

## 테스트 문서

- [프록시 최종 테스트 시나리오](docs/proxy-end-to-end-test-scenarios.md)
- [수동 테스트 시나리오](docs/manual-test-scenarios.md)
- [프로젝트 전체 동작 가이드](docs/project-full-flow-usage.md)
- [데이터 라이프사이클 가이드](docs/data-lifecycle-guide.md)

포트 상태 확인:

```bash
lsof -nP -iTCP:7777 -iTCP:7778 -iTCP:4780
```

## 다운로드와 공유

- [최신 릴리스](https://github.com/mndangee/proxy/releases/latest)
- [모든 릴리스](https://github.com/mndangee/proxy/releases)
- [master 브랜치 ZIP](https://github.com/mndangee/proxy/archive/refs/heads/master.zip)
- 앱 내부 `/downloads` 페이지

## 기술 스택

- Electron
- React 18
- TypeScript 5
- Vite / electron-vite 7
- Tailwind CSS 4
- Pretendard

## 라이선스

의존성 변경 후 다음 명령으로 목록을 다시 생성합니다.

```bash
npm run licenses
```

앱 하단 `Open Source Licenses` 또는 `/licenses`에서 확인할 수 있습니다.

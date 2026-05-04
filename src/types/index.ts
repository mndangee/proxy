/** 이 Proxy(응답) 프로젝트를 붙일 외부 클라이언트(care 등) */
export interface LinkedClientEntry {
  id: string
  label: string
  /** CORS 등에 쓸 개발 Origin (예: http://localhost:5173) */
  allowedOrigins: string[]
  notes?: string
}

/**
 * 외부 프로젝트가 호출하는 API URL(포트) 앞단에서 저장 응답을 주입하는 게이트웨이.
 * Care뿐 아니라 동일한 HTTP 프록시 패턴이면 어떤 백엔드에도 쓸 수 있음.
 */
export interface AppProxyInterceptGatewayConfig {
  enabled: boolean
  /**
   * 클라이언트(브라우저·앱)가 호출하는 API URL에 박혀 있는 포트(변경 불가인 경우 그대로 적음).
   * 게이트웨이 프로세스가 이 포트에서 listen 합니다.
   * 같은 포트에 이미 개발 서버가 떠 있으면 동시에 둘 수 없으므로, 가로채기 시에는 그 프로세스를 끄고
   * 실제 API 처리는 `upstreamPort`에서만 돌아가야 합니다(외부 프로젝트가 원래 두 포트를 쓰는 구조여야 함).
   */
  clientPort: number
  /**
   * 실제 백엔드 HTTP 서버가 listen 하는 포트(역시 프로젝트마다 고정인 값을 그대로 적음).
   * `clientPort`와 반드시 달라야 하며, 모의 전용 서버(`proxyServer.port`)와도 달라야 합니다.
   */
  upstreamPort: number
  /**
   * true이면 게이트웨이 기동 후 `upstreamWorkdir`에서 백엔드 프로세스를 대신 실행합니다
   * (수동으로 `npm run` 할 필요 없음 — 실행 방식은 DataForge 구현에 따름).
   */
  autoStartUpstream?: boolean
  /** 자동 실행 시 작업 폴더 (예: 다른 프로젝트의 server 디렉터리) */
  upstreamWorkdir?: string | null
}

/** 모의 응답 프로토콜 프로필 */
export type MockProfileType = "legacy-tran-envelope" | "generic-json";

/** 앱 공통: 로컬 프록시 HTTP 서버 설정(userData proxy-app-config.json) */
export interface AppProxyConfig {
  version: number
  proxyServer: {
    port: number
    enabled: boolean
    /** @deprecated 모의 서버는 모든 프로젝트를 탐색하므로 미사용. 이전 설정 파일 호환용 */
    servingFolderName?: string | null
    /**
     * 폴백 JSON 폴더 절대 경로(또는 `~/...`) — 주로 Care dummy/mobility 호환.
     * 스토어에 없을 때 `{tranId}.json` 로드
     */
    careDummyMobilityPath?: string | null
    /** 모의 서버 기동 시 업스트림 서버도 함께 실행 */
    upstreamAutoStart?: boolean
    /** 업스트림 서버 작업 폴더 */
    upstreamServerWorkdir?: string | null
    /** 업스트림 서버 포트 (모의 서버/게이트웨이 클라이언트 포트와 달라야 함) */
    upstreamServerPort?: number
    /**
     * 업스트림 실행 커맨드(선택). `{{port}}`를 포함하면 업스트림 포트로 치환.
     * 예: `npm run dev -- --port {{port}}`
     */
    upstreamServerCommand?: string | null
    /**
     * 업스트림 자동 실행에 사용할 Node 실행 파일 경로(선택).
     * 예: `~/.nvm/versions/node/v16.20.2/bin/node`
     */
    upstreamNodePath?: string | null
    /** @deprecated 레거시 호환 */
    careDummyAutoStart?: boolean
    /** @deprecated 레거시 호환 */
    careDummyServerWorkdir?: string | null
    /** @deprecated 레거시 호환 */
    careDummyServerPort?: number
  }
  /** API 가로채기 게이트웨이 (클라이언트 포트 ↔ 업스트림 포트) */
  interceptGateway?: AppProxyInterceptGatewayConfig
  /**
   * 모의 서버의 요청 키 추출·응답 포맷 규칙
   * - legacy-tran-envelope: Care/SFD 스타일(header.tranId, responseMessage 봉투)
   * - generic-json: 일반 REST/JSON 스타일(원본 JSON 반환)
   */
  mockProfile?: MockProfileType
  /**
   * 요청 본문의 트랜 키(예: header.tranId) → 스토어 API 이름.
   * 클라이언트 트랜 ID와 DataForge API 이름이 다를 때 매핑.
   */
  mockTranAliases?: Record<string, string>
}

export interface Project {
  id: string
  name: string
  description: string
  /** ISO 8601 */
  createdAt: string
  /** ISO 8601 */
  updatedAt: string
  isFavorite: boolean
  /** Electron: userData/DataForge-projects 아래 폴더명 */
  folderName?: string
  /** project.json — 이 응답 묶음을 사용할 외부 프로젝트 목록 */
  linkedClients?: LinkedClientEntry[]
}

export interface Activity {
  id: string
  message: string
  apiPath: string
  timeAgo: string
}

export interface ApiEndpoint {
  id: string
  method: string
  /** 트랜 이름 */
  tran: string
  description: string
  /** API 이름 (예: VD.MOVS0001) */
  name: string
  lastModified: string
  /** ISO 8601 (디스크 row); 있으면 표시 포맷에 우선 사용 */
  updatedAt?: string
  /** ISO 8601 — 목록 정렬(등록순)용 */
  createdAt?: string
}

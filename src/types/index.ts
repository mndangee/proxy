/** 이 Proxy(응답) 프로젝트를 붙일 외부 클라이언트(care 등) */
export interface LinkedClientEntry {
  id: string
  label: string
  /** CORS 등에 쓸 개발 Origin (예: http://localhost:5173) */
  allowedOrigins: string[]
  notes?: string
}

/** 앱 공통: 로컬 프록시 HTTP 서버 설정(userData proxy-app-config.json) */
export interface AppProxyConfig {
  version: number
  proxyServer: {
    port: number
    enabled: boolean
  }
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
}

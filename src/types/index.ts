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

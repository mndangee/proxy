/** 프로젝트 카드 한 개 */
export interface Project {
  id: string
  name: string
  lastUpdated: string
  isFavorite: boolean
}

/** 최근 활동 한 줄 */
export interface Activity {
  id: string
  message: string
  apiPath: string
  timeAgo: string
}

/** API 엔드포인트 (프로젝트 상세 테이블용) */
export interface ApiEndpoint {
  id: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  description: string
  lastModified: string
}

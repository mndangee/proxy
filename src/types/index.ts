export interface Project {
  id: string
  name: string
  lastUpdated: string
  isFavorite: boolean
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
  path: string
  description: string
  /** API 이름 (예: VD.MOVS0001) */
  name: string
  lastModified: string
}

import type { Project, Activity } from '@/types'

/** 프로젝트 이름 → URL path용 slug (예: "E-commerce Mock" → "e-commerce-mock") */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

/** slug 또는 projectName(URL 디코딩)으로 프로젝트 찾기 (없으면 첫 번째 프로젝트) */
export function getProjectBySlug(slug: string | null): Project {
  if (!slug) return mockProjects[0]
  const decoded = decodeURIComponent(slug)
  const foundBySlug = mockProjects.find((p) => slugify(p.name) === slug)
  const foundByName = mockProjects.find((p) => p.name === decoded)
  return foundBySlug ?? foundByName ?? mockProjects[0]
}

export const mockProjects: Project[] = [
  { id: '1', name: 'User Auth API', lastUpdated: '2h ago', isFavorite: true },
  { id: '2', name: 'E-commerce Mock', lastUpdated: '5h ago', isFavorite: true },
  { id: '3', name: 'Weather Sync', lastUpdated: '1d ago', isFavorite: true },
  { id: '4', name: 'Social Feed Data', lastUpdated: '3d ago', isFavorite: true },
  { id: '5', name: 'Logistics Tracker', lastUpdated: '4d ago', isFavorite: false },
]

export const mockActivities: Activity[] = [
  { id: '1', message: 'User Auth API deployed to production', apiPath: '/api/v2/auth', timeAgo: '2 hours ago' },
  { id: '2', message: 'Inventory Alpha schema updated', apiPath: '/api/v1/inventory/stocks', timeAgo: '5 hours ago' },
  { id: '3', message: 'E-commerce Mock endpoints configured', apiPath: '/api/v2/products', timeAgo: '12 hours ago' },
]

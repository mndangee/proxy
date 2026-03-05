import type { ApiEndpoint } from '../../types'

/** 프로젝트 ID별 API 엔드포인트 목 데이터 */
export const mockEndpointsByProjectId: Record<string, ApiEndpoint[]> = {
  '1': [
    { id: '1-1', method: 'POST', path: '/api/v1/auth/login', description: 'User login and token issuance', lastModified: 'Oct 24, 2023 14:20' },
    { id: '1-2', method: 'POST', path: '/api/v1/auth/logout', description: 'Invalidate current session', lastModified: 'Oct 23, 2023 08:15' },
    { id: '1-3', method: 'GET', path: '/api/v1/auth/me', description: 'Get current user profile', lastModified: 'Oct 22, 2023 16:45' },
  ],
  '2': [
    { id: '2-1', method: 'GET', path: '/api/v1/products', description: 'Retrieve all available products in the catalog', lastModified: 'Oct 24, 2023 14:20' },
    { id: '2-2', method: 'POST', path: '/api/v1/products', description: 'Create a new product entry in the system', lastModified: 'Oct 23, 2023 08:15' },
    { id: '2-3', method: 'PUT', path: '/api/v1/orders/{id}', description: 'Update order status or shipping details', lastModified: 'Oct 21, 2023 16:45' },
    { id: '2-4', method: 'DELETE', path: '/api/v1/user/{id}', description: 'Permanently remove user account and data', lastModified: 'Oct 18, 2023 11:20' },
  ],
  '3': [
    { id: '3-1', method: 'GET', path: '/api/v1/weather/current', description: 'Get current weather for location', lastModified: 'Oct 20, 2023 09:00' },
    { id: '3-2', method: 'GET', path: '/api/v1/weather/forecast', description: 'Get 5-day forecast', lastModified: 'Oct 19, 2023 14:30' },
  ],
  '4': [],
  '5': [],
}

export function getEndpointsForProject(projectId: string): ApiEndpoint[] {
  return mockEndpointsByProjectId[projectId] ?? []
}

import { useCallback, useEffect, useState } from 'react'
import RootLayout from '../../app/layout'
import HomePage from '../../app/page'
import DesignSystemPage from '../../app/design-system/page'
import LicensesPage from '../../app/licenses/page'
import DownloadsPage from '../../app/downloads/page'
import ProjectPage from '../../app/project/page'
import ProjectApiPage from '../../app/api/page'
import ApiJsonPage from '../../app/api/json/page'

import { navigateApp } from '../../libs/app-navigation'
import { getProjectForApiName, getProjectRouteSlug, hydrateProjects } from '../../libs/projects/store'

const useHashFallback = typeof window !== 'undefined' && window.location?.protocol === 'file:'

function pathnameToRoute(pathname: string): string {
  let pathOnly = pathname.split('?')[0].split('#')[0]
  try {
    pathOnly = new URL(pathname, 'http://route.local').pathname
  } catch {
    // keep pathOnly from split
  }
  const p = pathOnly.replace(/^\//, '').trim()
  return p || 'home'
}

function getRouteFromLocation(): string {
  if (useHashFallback) {
    const hash = window.location.hash.slice(1).trim()
    return pathnameToRoute(`/${hash.split('?')[0].split('#')[0]}`)
  }
  return pathnameToRoute(window.location.pathname)
}

/** pathname+search(또는 hash 전체) — 같은 route라도 쿼리가 바뀌면 리렌더·리마운트용 */
function getLocationKey(): string {
  if (typeof window === 'undefined') return 'home'
  if (useHashFallback) {
    return window.location.hash.slice(1).trim() || 'home'
  }
  return `${window.location.pathname}${window.location.search}`
}

function App(): React.JSX.Element {
  const [route, setRoute] = useState(getRouteFromLocation)
  const [locationKey, setLocationKey] = useState(getLocationKey)
  const [bootReady, setBootReady] = useState(false)

  useEffect(() => {
    void hydrateProjects().finally(() => setBootReady(true))
  }, [])

  const navigate = useCallback((path: string) => {
    navigateApp(path)
  }, [])

  // path 모드: 초기 로드 시 #home, #licenses 등 해시가 있으면 path로 치환해 URL 정리
  useEffect(() => {
    if (!useHashFallback && window.location.hash) {
      const hashPath = window.location.hash.slice(1).trim() || 'home'
      const path = hashPath === 'home' ? '/' : `/${hashPath}`
      window.history.replaceState(null, '', path)
      setRoute(hashPath === 'home' ? 'home' : pathnameToRoute(path))
      setLocationKey(getLocationKey())
    }
  }, [])

  useEffect(() => {
    const onAppNavigate = (event: Event): void => {
      const rawPath = event instanceof CustomEvent && typeof event.detail?.path === 'string' ? event.detail.path : '/'
      const normalized = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
      if (useHashFallback) {
        const hashPath = normalized === '/' ? 'home' : normalized.slice(1)
        window.history.pushState(null, '', `#${hashPath}`)
      } else {
        window.history.pushState(null, '', normalized)
      }
      setRoute(pathnameToRoute(normalized))
      setLocationKey(useHashFallback ? window.location.hash.slice(1).trim() || 'home' : normalized)
    }
    window.addEventListener('dataforge-navigate', onAppNavigate)
    return () => window.removeEventListener('dataforge-navigate', onAppNavigate)
  }, [])

  useEffect(() => {
    const onPopState = (): void => {
      setRoute(getRouteFromLocation())
      setLocationKey(getLocationKey())
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href^="/"]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.getAttribute('rel') === 'external') return
      const href = a.getAttribute('href')
      if (!href || href === '#') return
      e.preventDefault()
      navigate(href)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [navigate])

  const projectMatch = /^project(?:\/([^/]+))?$/.exec(route)
  const projectSlug = projectMatch ? (projectMatch[1] ?? null) : null

  const apiMatch = /^api\/([^/]+)$/.exec(route)
  const apiName = apiMatch ? decodeURIComponent(apiMatch[1]) : null

  let Page: React.ComponentType<any> = HomePage
  let pageProps: Record<string, unknown> = {}
  if (route === 'design-system') {
    Page = DesignSystemPage
  } else if (route === 'licenses') {
    Page = LicensesPage
  } else if (route === 'downloads') {
    Page = DownloadsPage
  } else if (route === 'api/json') {
    Page = ApiJsonPage
  } else if (apiMatch && apiName) {
    Page = ProjectApiPage
    pageProps = { apiName }
  } else if (projectMatch) {
    Page = ProjectPage
    pageProps = { projectSlug }
  }

  /** 프로젝트·API 목록 Nav 스크롤 유지: 같은 프로젝트 셸에서는 리마운트하지 않음 (본문은 페이지에서 별도 스크롤 리셋) */
  let pageMountKey = locationKey
  if (apiMatch && apiName) {
    const p = getProjectForApiName(apiName)
    pageMountKey = p ? `shell:api:${getProjectRouteSlug(p)}` : `shell:api-orphan:${encodeURIComponent(apiName)}`
  } else if (projectMatch) {
    pageMountKey = 'shell:project'
  }

  return (
    <RootLayout>
      {bootReady ? (
        <Page key={pageMountKey} {...pageProps} />
      ) : (
        <div className="typo-body-1-normal text-label-assistant flex min-h-0 flex-1 items-center justify-center">불러오는 중…</div>
      )}
    </RootLayout>
  )
}

export default App

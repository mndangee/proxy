import { useCallback, useEffect, useState } from 'react'
import RootLayout from '../../app/layout'
import HomePage from '../../app/page'
import DesignSystemPage from '../../app/design-system/page'
import LicensesPage from '../../app/licenses/page'
import ProjectPage from '../../app/project/page'
import ProjectApiPage from '../../app/api/page'
import ApiJsonPage from '../../app/api/json/page'

import { hydrateProjects } from '../../libs/projects/store'

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
    if (useHashFallback) {
      try {
        const baseHref = window.location.href.replace(/#.*$/, '')
        const u = new URL(path.startsWith('/') ? path : `/${path}`, baseHref)
        let pathPart = u.pathname.replace(/^\//, '').trim()
        if (!pathPart) pathPart = 'home'
        const search = u.search.replace(/^\?/, '')
        window.location.hash = search ? `${pathPart}?${search}` : pathPart
      } catch {
        const raw = path.startsWith('/') ? path.slice(1) : path
        const head = raw.split('?')[0] || 'home'
        window.location.hash = head
      }
      const hashNow = window.location.hash.slice(1).trim()
      const routePart = hashNow.split('?')[0].split('#')[0] || 'home'
      setRoute(pathnameToRoute(`/${routePart}`))
      setLocationKey(getLocationKey())
      return
    }
    const normalized = path.startsWith('/') ? path : `/${path}`
    window.history.pushState(null, '', normalized)
    let pathOnly = normalized
    try {
      pathOnly = new URL(normalized, window.location.href).pathname
    } catch {
      pathOnly = normalized.split('?')[0].split('#')[0]
    }
    setRoute(pathnameToRoute(pathOnly))
    setLocationKey(getLocationKey())
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
    if (useHashFallback) {
      const onHash = (): void => {
        const hash = window.location.hash.slice(1).trim()
        setRoute(pathnameToRoute(`/${hash.split('?')[0].split('#')[0]}`))
        setLocationKey(getLocationKey())
      }
      window.addEventListener('hashchange', onHash)
      return () => window.removeEventListener('hashchange', onHash)
    }
    const onPopState = (): void => {
      setRoute(pathnameToRoute(window.location.pathname))
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
  } else if (route === 'api/json') {
    Page = ApiJsonPage
  } else if (apiMatch && apiName) {
    Page = ProjectApiPage
    pageProps = { apiName }
  } else if (projectMatch) {
    Page = ProjectPage
    pageProps = { projectSlug }
  }

  return (
    <RootLayout>
      {bootReady ? (
        <Page key={locationKey} {...pageProps} />
      ) : (
        <div className="typo-body-1-normal text-label-assistant flex min-h-[40vh] items-center justify-center">불러오는 중…</div>
      )}
    </RootLayout>
  )
}

export default App

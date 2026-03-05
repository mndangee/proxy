import { useCallback, useEffect, useState } from 'react'
import RootLayout from '../../app/layout'
import HomePage from '../../app/page'
import LicensesPage from '../../app/licenses/page'
import ProjectPage from '../../app/project/page'

const useHashFallback = typeof window !== 'undefined' && window.location?.protocol === 'file:'

function pathnameToRoute(pathname: string): string {
  const p = pathname.replace(/^\//, '').trim()
  return p || 'home'
}

function getRouteFromLocation(): string {
  if (useHashFallback) {
    const hash = window.location.hash.slice(1).trim()
    return hash || 'home'
  }
  return pathnameToRoute(window.location.pathname)
}

function App(): React.JSX.Element {
  const [route, setRoute] = useState(getRouteFromLocation)

  const navigate = useCallback((path: string) => {
    if (useHashFallback) {
      const hashPath = path.startsWith('/') ? path.slice(1) : path
      window.location.hash = hashPath || 'home'
      setRoute(hashPath || 'home')
      return
    }
    const normalized = path.startsWith('/') ? path : `/${path}`
    window.history.pushState(null, '', normalized)
    setRoute(pathnameToRoute(normalized))
  }, [])

  // path 모드: 초기 로드 시 #home, #licenses 등 해시가 있으면 path로 치환해 URL 정리
  useEffect(() => {
    if (!useHashFallback && window.location.hash) {
      const hashPath = window.location.hash.slice(1).trim() || 'home'
      const path = hashPath === 'home' ? '/' : `/${hashPath}`
      window.history.replaceState(null, '', path)
      setRoute(hashPath === 'home' ? 'home' : hashPath)
    }
  }, [])

  useEffect(() => {
    if (useHashFallback) {
      const onHash = (): void => setRoute(window.location.hash.slice(1) || 'home')
      window.addEventListener('hashchange', onHash)
      return () => window.removeEventListener('hashchange', onHash)
    }
    const onPopState = (): void => setRoute(pathnameToRoute(window.location.pathname))
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

  let Page: React.ComponentType<any> = HomePage
  let pageProps: Record<string, unknown> = {}
  if (route === 'licenses') {
    Page = LicensesPage
  } else if (projectMatch) {
    Page = ProjectPage
    pageProps = { projectSlug }
  }

  return (
    <RootLayout>
      <Page {...pageProps} />
    </RootLayout>
  )
}

export default App

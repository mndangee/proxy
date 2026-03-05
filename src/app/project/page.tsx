import { MethodTag } from '../../components/common/badge'
import { getProjectBySlug, mockProjects, slugify } from '../../libs/data/home'
import { getEndpointsForProject } from '../../libs/data/project'

interface ProjectPageProps {
  projectSlug: string | null
}

export default function ProjectPage({ projectSlug }: ProjectPageProps) {
  const project = getProjectBySlug(projectSlug)
  const endpoints = getEndpointsForProject(project.id)

  return (
    <div className="flex min-h-full bg-white">
      {/* 사이드바 (다크) */}
      <aside className="flex w-[260px] shrink-0 flex-col bg-neutral-900 text-white">
        <div className="flex items-center gap-2 border-b border-neutral-700 p-3">
          <button type="button" className="rounded p-1.5 hover:bg-neutral-700" aria-label="메뉴">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button type="button" className="rounded p-1.5 hover:bg-neutral-700" aria-label="선택">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </button>
          <button type="button" className="rounded p-1.5 hover:bg-neutral-700" aria-label="즐겨찾기">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
        </div>
        <div className="border-b border-neutral-700 p-3">
          <label className="text-details text-neutral-400">검색</label>
          <input
            type="search"
            placeholder="검색"
            className="mt-1 w-full rounded-3 border border-neutral-600 bg-neutral-800 px-3 py-2 text-body text-white placeholder-neutral-500 focus:border-primary-500 focus:outline-none"
          />
        </div>
        <nav className="flex-1 overflow-auto p-2">
          {mockProjects.map((p) => {
            const isActive = p.id === project.id
            return (
              <a
                key={p.id}
                href={`/project/${slugify(p.name)}`}
                className={`mb-0.5 flex items-center gap-2 rounded-3 px-3 py-2 text-body transition-colors ${
                  isActive ? 'bg-primary-600 text-white' : 'text-neutral-300 hover:bg-neutral-700 hover:text-white'
                }`}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                <span className="truncate">{p.name}</span>
              </a>
            )
          })}
        </nav>
        <div className="border-t border-neutral-700 p-3">
          <a
            href="/"
            className="flex w-full items-center justify-center gap-2 rounded-4 border border-neutral-600 bg-transparent py-3 text-body font-medium text-neutral-300 transition-colors hover:border-primary-500 hover:bg-neutral-800 hover:text-white"
          >
            <span>+</span>
            New Project
          </a>
        </div>
      </aside>

      {/* 메인 영역 */}
      <main className="min-w-0 flex-1 overflow-auto bg-neutral-50">
        <div className="px-8 py-6">
          {/* 상단: 브레드크럼 + 아이콘 */}
          <div className="mb-6 flex items-center justify-between">
            <a href="/" className="text-body text-neutral-600 hover:text-primary-600 hover:underline">
              Projects / {project.name}
            </a>
            <div className="flex items-center gap-2">
              <button type="button" className="rounded p-2 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700" aria-label="검색">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              <button type="button" className="rounded p-2 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700" aria-label="설정">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>

          {/* 헤더 + Create New API */}
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-details mb-1 font-medium uppercase tracking-wide text-neutral-500">Active Project</p>
              <h1 className="text-h1 text-neutral-900">{project.name}</h1>
              <h2 className="text-h2 mt-1 text-neutral-700">API Endpoints</h2>
              <p className="text-body mt-2 max-w-2xl text-neutral-600">
                Manage and document your project endpoints for {project.name}.
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-4 bg-primary-500 px-4 py-3 text-body font-medium text-white shadow-sm transition-colors hover:bg-primary-600"
            >
              + Create New API
            </button>
          </div>

          {/* 테이블 */}
          <div className="overflow-hidden rounded-4 border border-neutral-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] border-collapse text-left text-body">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  <th className="px-4 py-3 font-semibold text-neutral-900">Method</th>
                  <th className="px-4 py-3 font-semibold text-neutral-900">Endpoint Path</th>
                  <th className="px-4 py-3 font-semibold text-neutral-900">Description</th>
                  <th className="px-4 py-3 font-semibold text-neutral-900">Last Modified</th>
                  <th className="px-4 py-3 font-semibold text-neutral-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-neutral-500">
                      등록된 API 엔드포인트가 없습니다. Create New API로 추가하세요.
                    </td>
                  </tr>
                ) : (
                  endpoints.map((ep) => (
                    <tr key={ep.id} className="border-b border-neutral-100 transition-colors hover:bg-neutral-50">
                      <td className="px-4 py-3">
                        <MethodTag method={ep.method} />
                      </td>
                      <td className="px-4 py-3 font-mono text-neutral-800">{ep.path}</td>
                      <td className="px-4 py-3 text-neutral-600">{ep.description}</td>
                      <td className="px-4 py-3 text-neutral-500">{ep.lastModified}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button type="button" className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" aria-label="편집">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button type="button" className="rounded p-1.5 text-neutral-400 hover:bg-negative-50 hover:text-negative-600" aria-label="삭제">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}

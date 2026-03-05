import { PageHeader } from '../../components/common'
import licensesData from '../../json/licenses.json'

interface LicenseEntry {
  name: string
  version: string
  license: string
  repository: string
}

const licenses = (Array.isArray(licensesData) ? licensesData : []) as LicenseEntry[]

export default function LicensesPage() {
  return (
    <main className="flex-1 overflow-auto px-6 py-8">
      <PageHeader title="Open Source Licenses" />

      <p className="mb-6 text-body text-neutral-600">
        이 프로젝트에서 사용 중인 라이브러리의 라이선스 정보입니다. 목록을 생성하려면 프로젝트 루트에서{' '}
        <code className="rounded-2 bg-neutral-100 px-2 py-1 text-details">npm run licenses</code>{' '}
        를 실행하세요.
      </p>

      <div className="overflow-hidden rounded-4 border border-neutral-200">
        <table className="w-full min-w-[600px] border-collapse text-left text-body">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="px-4 py-3 font-semibold text-neutral-900">패키지</th>
              <th className="px-4 py-3 font-semibold text-neutral-900">버전</th>
              <th className="px-4 py-3 font-semibold text-neutral-900">라이선스</th>
              <th className="px-4 py-3 font-semibold text-neutral-900">저장소</th>
            </tr>
          </thead>
          <tbody>
            {licenses.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-details text-neutral-500">
                  라이선스 목록이 비어 있습니다. npm run licenses 를 실행한 뒤 앱을 다시 빌드하세요.
                </td>
              </tr>
            ) : (
              licenses.map((entry) => (
                <tr key={`${entry.name}@${entry.version}`} className="border-b border-neutral-100">
                  <td className="px-4 py-3 font-medium text-neutral-900">{entry.name}</td>
                  <td className="px-4 py-3 text-neutral-600">{entry.version}</td>
                  <td className="px-4 py-3 text-neutral-600">{entry.license || '-'}</td>
                  <td className="px-4 py-3 text-details">
                    {entry.repository ? (
                      <a
                        href={entry.repository.replace(/^git\+/, '').replace(/\.git$/, '')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:underline"
                      >
                        링크
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}

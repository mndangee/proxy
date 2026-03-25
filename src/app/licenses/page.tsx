import Header from '../../components/shared/Header'
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
    <main className="flex-1 overflow-auto">
      <Header variant="main" title="Open Source Licenses" />

      <div className="px-6 py-8">

        <p className="typo-body-2-normal mb-6 text-label-assistant">
          이 프로젝트에서 사용 중인 라이브러리의 라이선스 정보입니다. 목록을 생성하려면 프로젝트 루트에서{' '}
          <code className="typo-caption-1 rounded-2 bg-gray-100 px-2 py-1">npm run licenses</code>{' '}
          를 실행하세요.
        </p>

        <div className="overflow-hidden rounded-4 border border-border-enabled">
          <table className="typo-body-2-normal w-full min-w-[600px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border-enabled bg-background-secondary-weak">
                <th className="px-4 py-3 font-semibold text-label-normal">패키지</th>
                <th className="px-4 py-3 font-semibold text-label-normal">버전</th>
                <th className="px-4 py-3 font-semibold text-label-normal">라이선스</th>
                <th className="px-4 py-3 font-semibold text-label-normal">저장소</th>
              </tr>
            </thead>
            <tbody>
              {licenses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="typo-caption-1 px-4 py-8 text-center text-label-assistant">
                    라이선스 목록이 비어 있습니다. npm run licenses 를 실행한 뒤 앱을 다시 빌드하세요.
                  </td>
                </tr>
              ) : (
                licenses.map((entry) => (
                  <tr key={`${entry.name}@${entry.version}`} className="border-b border-gray-100">
                    <td className="px-4 py-3 font-medium text-label-normal">{entry.name}</td>
                    <td className="px-4 py-3 text-label-assistant">{entry.version}</td>
                    <td className="px-4 py-3 text-label-assistant">{entry.license || '-'}</td>
                    <td className="typo-caption-1 px-4 py-3">
                      {entry.repository ? (
                        <a
                          href={entry.repository.replace(/^git\+/, '').replace(/\.git$/, '')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
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
      </div>
    </main>
  )
}

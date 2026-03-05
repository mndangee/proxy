import type { ReactNode } from 'react'

export interface PageHeaderAction {
  label: string
  onClick?: () => void
}

export interface PageHeaderTab {
  value: string
  label: string
}

interface PageHeaderProps {
  /** 메인 제목 (필수) */
  title: string
  /** 상단 라벨 (예: "ACTIVE PROJECT") */
  badge?: string
  /** 제목 위 부제 (예: 프로젝트명 "E-commerce Mock") */
  subtitle?: string
  /** 제목 아래 설명 문장 */
  description?: string
  /** 우측 액션: { label, onClick } 또는 커스텀 ReactNode */
  action?: PageHeaderAction | ReactNode
  /** 탭 목록 (홈 등에서 사용) */
  tabs?: PageHeaderTab[]
  /** 현재 활성 탭 값 */
  activeTab?: string
  /** 탭 변경 시 호출 */
  onTabChange?: (value: string) => void
}

export default function PageHeader({
  title,
  badge,
  subtitle,
  description,
  action,
  tabs,
  activeTab,
  onTabChange,
}: PageHeaderProps) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        {tabs != null && tabs.length > 0 && (
          <div className="mb-3 flex gap-2 border-b border-neutral-200">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => onTabChange?.(tab.value)}
                className={`border-b-2 pb-3 text-body font-medium transition-colors ${
                  activeTab === tab.value
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        {badge != null && badge !== '' && (
          <p className="text-details mb-1 font-medium uppercase tracking-wide text-neutral-500">
            {badge}
          </p>
        )}
        {subtitle != null && subtitle !== '' && (
          <p className="text-h1 mb-0.5 text-neutral-900">{subtitle}</p>
        )}
        <h1 className="text-h2 font-bold text-neutral-900">{title}</h1>
        {description != null && description !== '' && (
          <p className="text-body mt-1 text-neutral-600">{description}</p>
        )}
      </div>
      {action != null && (
        <div className="shrink-0">
          {typeof action === 'object' && action !== null && 'label' in action && typeof (action as PageHeaderAction).label === 'string' ? (
            <button
              type="button"
              onClick={(action as PageHeaderAction).onClick}
              className="flex items-center gap-2 rounded-4 bg-brand-600 px-4 py-3 text-body font-medium text-white hover:bg-brand-700"
            >
              <span className="text-h2 leading-none">+</span>
              {(action as PageHeaderAction).label}
            </button>
          ) : (
            action as ReactNode
          )}
        </div>
      )}
    </header>
  )
}

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
          <div className="mb-3 flex gap-2 border-b border-border-enabled">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => onTabChange?.(tab.value)}
                className={`typo-body-2-normal border-b-2 pb-3 font-medium transition-colors ${
                  activeTab === tab.value
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-label-assistant hover:text-label-neutral'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        {badge != null && badge !== '' && (
          <p className="typo-caption-1 mb-1 font-medium uppercase tracking-wide text-label-assistant">
            {badge}
          </p>
        )}
        {subtitle != null && subtitle !== '' && (
          <p className="typo-title-3 mb-0.5 text-label-normal">{subtitle}</p>
        )}
        <h1 className="typo-heading-1 font-bold text-label-normal">{title}</h1>
        {description != null && description !== '' && (
          <p className="typo-body-2-normal mt-1 text-label-assistant">{description}</p>
        )}
      </div>
      {action != null && (
        <div className="shrink-0">
          {typeof action === 'object' && action !== null && 'label' in action && typeof (action as PageHeaderAction).label === 'string' ? (
            <button
              type="button"
              onClick={(action as PageHeaderAction).onClick}
              className="typo-body-2-normal flex items-center gap-2 rounded-4 bg-background-primary px-4 py-3 font-medium text-label-common hover:bg-background-primary-hover"
            >
              <span className="typo-heading-1 leading-none">+</span>
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

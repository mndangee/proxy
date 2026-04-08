export type ProjectTabValue = "all" | "favorites";

export interface ProjectTabProps {
  activeTab: ProjectTabValue;
  onTabChange: (tab: ProjectTabValue) => void;
}

const tabs: { value: ProjectTabValue; label: string }[] = [
  { value: "all", label: "모든 프로젝트" },
  { value: "favorites", label: "즐겨찾기" },
];

export default function ProjectTab({ activeTab, onTabChange }: ProjectTabProps) {
  return (
    <div className="border-b border-gray-200">
      <div className="flex gap-8">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => onTabChange(tab.value)}
            className={`typo-body-1-normal relative cursor-pointer border-none bg-transparent pt-2 pb-3 font-medium transition-colors ${
              activeTab === tab.value ? "text-label-primary font-bold" : "text-label-assistant hover:text-blue-400"
            }`}
          >
            {tab.label}
            {activeTab === tab.value ? <span className="absolute right-0 bottom-0 left-0 h-0.5 bg-blue-500" aria-hidden /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

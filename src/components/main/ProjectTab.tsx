// React
import { useEffect, useState } from "react";

export interface IProjectProps {
  setIsLoading?: React.Dispatch<React.SetStateAction<boolean>>;
}

const tabs = [
  { value: "all", label: "All Projects" },
  { value: "favorites", label: "Favorites" },
] as const;

export default function ProjectTab() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["value"]>("all");

  return (
    <div className="border-b border-gray-200">
      <div className="flex gap-8">
        {tabs.map((tab) => (
          <div
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`typo-body-1-normal relative cursor-pointer pt-2 pb-3 font-medium transition-colors ${
              activeTab === tab.value ? "text-label-primary font-bold" : "text-label-assistant hover:text-blue-400"
            }`}
          >
            {tab.label}
            {activeTab === tab.value && (
              <span className="absolute right-0 bottom-0 left-0 h-0.5 bg-blue-500" aria-hidden />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

// React
import { useEffect, useMemo, useState } from "react";

// Components
import Navigation from "@/components/shared/Navigation";
import ApiExplorerHeader from "@/components/api/ApiExplorerHeader";
import ApiResponseSection from "@/components/api/ApiResponseSection";

// Libs
import { getApiResponseGroups, getStoredActiveApiResponse, setStoredActiveApiResponse, type ApiResponseItem } from "@/libs/datadummy/api";
import { getProjectForApiName } from "@/libs/datadummy/project";
import { getProjectRouteSlug } from "@/libs/projects/store";

interface ProjectApiPageProps {
  apiName: string;
}

export default function ProjectApiPage({ apiName }: ProjectApiPageProps) {
  const resolvedApiName = apiName || (typeof window !== "undefined" ? decodeURIComponent(window.location.pathname.replace("/api/", "")) : "");
  const { localResponses, testResponses, errorResponses } = useMemo(() => getApiResponseGroups(resolvedApiName), [resolvedApiName]);
  const allResponses = [...localResponses, ...testResponses, ...errorResponses];
  const [activeRevision, setActiveRevision] = useState(0);
  const activeResponse = useMemo(() => getStoredActiveApiResponse(resolvedApiName), [resolvedApiName, activeRevision]);
  const [checkedValue, setCheckedValue] = useState<string>(() => {
    const stored = getStoredActiveApiResponse(resolvedApiName);
    return stored.responseValue ?? localResponses[0]?.value ?? "";
  });

  useEffect(() => {
    const stored = getStoredActiveApiResponse(resolvedApiName);
    const { localResponses: locals } = getApiResponseGroups(resolvedApiName);
    setCheckedValue(stored.responseValue ?? locals[0]?.value ?? "");
  }, [resolvedApiName]);

  const handleApplyActiveResponse = (item: ApiResponseItem) => {
    const type = item.type === "local" ? "default" : item.type;
    setStoredActiveApiResponse(resolvedApiName, {
      apiName: resolvedApiName,
      responseValue: item.value,
      type,
      title: item.label,
      description: item.description,
      configuration: item.configuration,
    });
    setActiveRevision((r) => r + 1);
  };

  const selectedResponse = allResponses.find((item) => item.value === checkedValue) ?? localResponses[0];
  const currentType = selectedResponse?.type === "local" ? "default" : selectedResponse?.type ?? "default";
  const project = getProjectForApiName(resolvedApiName);
  const activeProjectSlug = project ? getProjectRouteSlug(project) : null;

  return (
    <div className="flex min-h-screen w-full min-w-0 overflow-x-hidden">
      <Navigation activeProjectSlug={activeProjectSlug} currentApiName={resolvedApiName} onNewProject={() => (window.location.href = "/")} />
      <div className="flex min-h-full min-w-0 flex-1 flex-col overflow-x-hidden">
        <div className="border-border-enabled border-b">
          <ApiExplorerHeader
            title={resolvedApiName}
            currentType={currentType}
            currentResponseValue={selectedResponse?.value ?? null}
            onSettingsClick={() => {
              if (!selectedResponse) return;
              window.location.href = `/api/json?state=edit&apiName=${encodeURIComponent(resolvedApiName)}&type=${currentType}&responseValue=${encodeURIComponent(selectedResponse.value)}`;
            }}
          />
        </div>
        <div className="min-w-0 flex-1 overflow-auto px-6 py-8">
          <ApiResponseSection
            apiName={resolvedApiName}
            checkedValue={checkedValue}
            setCheckedValue={setCheckedValue}
            activeResponse={activeResponse}
            onApplyActiveResponse={handleApplyActiveResponse}
          />
        </div>
      </div>
    </div>
  );
}

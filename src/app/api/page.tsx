"use client";

// React
import { useEffect, useMemo, useState } from "react";

// Components
import Navigation from "@/components/shared/Navigation";
import ApiExplorerHeader from "@/components/api/ApiExplorerHeader";
import MethodTag from "@/components/common/MethodTag";

// Libs
import {
  getApiEndpointByName,
  getProjectForApiName,
  getProjectRouteSlug,
  PROJECT_APIS_CHANGED_EVENT,
} from "@/libs/projects/store";

interface ProjectApiPageProps {
  apiName: string;
}

export default function ProjectApiPage({ apiName }: ProjectApiPageProps) {
  const resolvedApiName = apiName || (typeof window !== "undefined" ? decodeURIComponent(window.location.pathname.replace("/api/", "")) : "");
  const [apisTick, setApisTick] = useState(0);

  useEffect(() => {
    const bump = () => setApisTick((t) => t + 1);
    window.addEventListener(PROJECT_APIS_CHANGED_EVENT, bump);
    return () => window.removeEventListener(PROJECT_APIS_CHANGED_EVENT, bump);
  }, []);

  const endpoint = useMemo(() => getApiEndpointByName(resolvedApiName), [resolvedApiName, apisTick]);
  const project = getProjectForApiName(resolvedApiName);
  const activeProjectSlug = project ? getProjectRouteSlug(project) : null;

  const method = endpoint?.method ?? "GET";

  return (
    <div className="flex min-h-screen w-full min-w-0 overflow-x-hidden">
      <Navigation activeProjectSlug={activeProjectSlug} currentApiName={resolvedApiName} onNewProject={() => (window.location.href = "/")} />
      <div id="app-main" className="relative flex min-h-full min-w-0 flex-1 flex-col overflow-x-hidden">
        <div className="border-border-enabled border-b">
          <ApiExplorerHeader
            title={resolvedApiName}
            subtext={
              endpoint
                ? endpoint.description.trim() || "등록된 설명이 없습니다."
                : "목록에 없는 API입니다. 프로젝트에서 등록했는지 확인해 주세요."
            }
            currentType="default"
            currentResponseValue={null}
            onSettingsClick={() => {
              window.location.href = `/api/json?state=new&apiName=${encodeURIComponent(resolvedApiName)}&type=default`;
            }}
          />
        </div>
        <div className="min-w-0 flex-1 overflow-auto px-6 py-8">
          {endpoint ? (
            <div className="mx-auto w-full max-w-[1600px] space-y-6">
              <section className="border-border-enabled rounded-4 bg-background-white border p-7">
                <h2 className="typo-body-1-normal text-label-normal font-bold">API 정보</h2>
                <dl className="typo-body-2-normal mt-6 grid gap-4 sm:grid-cols-[120px_1fr] sm:gap-x-6 sm:gap-y-3">
                  <dt className="text-label-assistant">메서드</dt>
                  <dd>
                    <MethodTag method={method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH"} className="inline-flex" />
                  </dd>
                  <dt className="text-label-assistant">트랜 이름</dt>
                  <dd className="text-label-normal font-medium break-all">{endpoint.tran?.trim() ? endpoint.tran : "—"}</dd>
                  <dt className="text-label-assistant">설명</dt>
                  <dd className="text-label-normal">{endpoint.description || "—"}</dd>
                </dl>
              </section>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-[1600px] flex-col items-center justify-center px-6 py-20 text-center">
              <p className="typo-body-1-normal text-label-assistant">
                「{resolvedApiName}」에 해당하는 저장된 API를 찾을 수 없습니다. 프로젝트 목록에서 API를 등록했는지 확인해 주세요.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

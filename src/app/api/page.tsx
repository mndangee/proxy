"use client";

// React
import { useEffect, useMemo, useState } from "react";

// Components
import ApiExplorerHeader from "@/components/api/ApiExplorerHeader";
import ApiResponseLatencyField from "@/components/api/ApiResponseLatencyField";
import ApiResponseSection from "@/components/api/ApiResponseSection";
import EmptyApiJsonResponseState from "@/components/api/EmptyApiJsonResponseState";
import { ApiJsonImportModal, NoticeModal } from "@/components/common/modals";
import Navigation from "@/components/shared/Navigation";

// Libs
import type { ApiResponseItem } from "@/libs/datadummy/api";
import {
  clearRegisteredApiJsonFlagIfNoSavedResponses,
  clearStoredActiveApiResponseIfMatches,
  getApiResponseGroups,
  getJsonEditorHrefForSelectedValue,
  getStoredActiveApiResponse,
  hasRegisteredApiJsonResponse,
  markRegisteredApiJsonResponse,
  setStoredActiveApiResponse,
} from "@/libs/datadummy/api";
import {
  deleteSavedApiResponse,
  formatSaveApiResponseUserError,
  getApiEndpointByName,
  getProjectForApiName,
  getProjectHref,
  getProjectRouteSlug,
  getStoredApiLatencyMs,
  PROJECT_APIS_CHANGED_EVENT,
  PROJECT_API_RESPONSES_CHANGED_EVENT,
  setStoredApiLatencyMs,
  upsertSavedApiResponse,
} from "@/libs/projects/store";

function formatLatencyInputDisplay(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0";
  if (ms === 0) return "0";
  const rounded = Math.round(ms * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

interface ProjectApiPageProps {
  apiName: string;
}

export default function ProjectApiPage({ apiName }: ProjectApiPageProps) {
  const resolvedApiName = apiName || (typeof window !== "undefined" ? decodeURIComponent(window.location.pathname.replace("/api/", "")) : "");
  const [apisTick, setApisTick] = useState(0);
  const [responseUiTick, setResponseUiTick] = useState(0);
  const [clientReady, setClientReady] = useState(false);
  const [checkedValue, setCheckedValue] = useState("");
  const [jsonImportOpen, setJsonImportOpen] = useState(false);
  const [deleteErrorNotice, setDeleteErrorNotice] = useState<{ open: boolean; message: string }>({ open: false, message: "" });
  const [latencyInput, setLatencyInput] = useState("0");

  useEffect(() => {
    const bump = () => setApisTick((t) => t + 1);
    window.addEventListener(PROJECT_APIS_CHANGED_EVENT, bump);
    window.addEventListener(PROJECT_API_RESPONSES_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener(PROJECT_APIS_CHANGED_EVENT, bump);
      window.removeEventListener(PROJECT_API_RESPONSES_CHANGED_EVENT, bump);
    };
  }, []);

  useEffect(() => {
    setClientReady(true);
  }, []);

  useEffect(() => {
    setLatencyInput(formatLatencyInputDisplay(getStoredApiLatencyMs(resolvedApiName)));
  }, [resolvedApiName]);

  /** API별 저장·등록 응답이 있을 때만 ApiResponseSection — 없으면 EmptyApiJsonResponseState */
  const hasJsonResponse = useMemo(() => {
    if (!clientReady || !resolvedApiName.trim()) return false;
    return hasRegisteredApiJsonResponse(resolvedApiName);
  }, [clientReady, resolvedApiName, apisTick, responseUiTick]);

  const activeResponse = useMemo(() => getStoredActiveApiResponse(resolvedApiName), [resolvedApiName, apisTick, responseUiTick]);

  useEffect(() => {
    const groups = getApiResponseGroups(resolvedApiName);
    const all = [...groups.localResponses, ...groups.testResponses, ...groups.errorResponses];
    const first = groups.localResponses[0]?.value ?? "";
    const stored = getStoredActiveApiResponse(resolvedApiName);
    const matches = stored.responseValue != null && all.some((i) => i.value === stored.responseValue);
    setCheckedValue(matches ? stored.responseValue! : first);
  }, [resolvedApiName, apisTick, responseUiTick]);

  const endpoint = useMemo(() => getApiEndpointByName(resolvedApiName), [resolvedApiName, apisTick]);
  const project = getProjectForApiName(resolvedApiName);
  const activeProjectSlug = project ? getProjectRouteSlug(project) : null;

  const explorerSubtext = useMemo(() => {
    if (!endpoint) {
      return "목록에 없는 API입니다. 프로젝트에서 등록했는지 확인해 주세요.";
    }
    const tran = endpoint.tran?.trim() || "—";
    const desc = endpoint.description?.trim() || "등록된 설명이 없습니다.";
    return `${tran} · ${desc}`;
  }, [endpoint]);

  const commitLatencyInput = () => {
    const key = resolvedApiName.trim();
    if (!key) return;
    const raw = latencyInput.trim().replace(/,/g, "").replace(/\s/g, "");
    if (raw === "") {
      setStoredApiLatencyMs(key, 0);
      setLatencyInput("0");
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      setLatencyInput(formatLatencyInputDisplay(getStoredApiLatencyMs(key)));
      return;
    }
    setStoredApiLatencyMs(key, n);
    setLatencyInput(formatLatencyInputDisplay(n));
  };

  return (
    <div className="flex min-h-screen w-full min-w-0 overflow-x-hidden">
      <Navigation activeProjectSlug={activeProjectSlug} currentApiName={resolvedApiName} onNewProject={() => (window.location.href = "/")} />
      <div id="app-main" className="relative flex min-h-full min-w-0 flex-1 flex-col overflow-x-hidden">
        <NoticeModal isOpen={deleteErrorNotice.open} onClose={() => setDeleteErrorNotice({ open: false, message: "" })} message={deleteErrorNotice.message} anchorMain />
        <ApiJsonImportModal
          isOpen={jsonImportOpen}
          onClose={() => setJsonImportOpen(false)}
          defaultTitle="가져온 응답"
          onConfirm={async ({ label, description, editorType, configuration }) => {
            if (!endpoint) {
              throw new Error("등록된 API가 아니어서 저장할 수 없습니다.");
            }
            const p = getProjectForApiName(resolvedApiName);
            if (!p) {
              throw new Error("프로젝트에 등록된 API를 찾을 수 없습니다.");
            }
            const result = await upsertSavedApiResponse(p.id, resolvedApiName, {
              value: null,
              label,
              description,
              editorType,
              configuration,
            });
            if (!result.ok) {
              throw new Error(formatSaveApiResponseUserError(result.error));
            }
            const activeType = editorType === "test" ? "test" : editorType === "error" ? "error" : "default";
            setStoredActiveApiResponse(resolvedApiName, {
              apiName: resolvedApiName,
              responseValue: result.value,
              type: activeType,
              title: label,
              description,
              configuration,
            });
            markRegisteredApiJsonResponse(resolvedApiName);
            setCheckedValue(result.value);
            setResponseUiTick((t) => t + 1);
          }}
        />
        <div className="border-border-enabled bg-background-white border-b">
          <div className="mx-auto w-full max-w-[1600px] px-6 pt-6">
            <button
              type="button"
              onClick={() => {
                if (project) {
                  window.location.href = getProjectHref(project);
                  return;
                }
                window.history.back();
              }}
              className="typo-caption-1 text-label-assistant hover:text-label-normal mb-1 w-fit cursor-pointer text-left transition-colors"
            >
              ← 프로젝트로 돌아가기
            </button>
          </div>
          <ApiExplorerHeader
            className="!pt-3"
            title={resolvedApiName}
            subtext={explorerSubtext}
            currentType={activeResponse.type}
            currentResponseValue={activeResponse.responseValue}
            onJsonAddClick={() => setJsonImportOpen(true)}
            onSettingsClick={() => {
              window.location.href = getJsonEditorHrefForSelectedValue(resolvedApiName, checkedValue);
            }}
          />
        </div>
        <div className="min-w-0 flex-1 overflow-auto px-6 py-8">
          <div className="mx-auto w-full max-w-[1600px] space-y-6">
            {endpoint ? (
              <ApiResponseLatencyField value={latencyInput} onValueChange={setLatencyInput} onCommit={commitLatencyInput} />
            ) : null}
            {!endpoint ? (
              <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                <p className="typo-body-1-normal text-label-assistant">
                  「{resolvedApiName}」에 해당하는 저장된 API를 찾을 수 없습니다. 프로젝트 목록에서 API를 등록했는지 확인해 주세요.
                </p>
              </div>
            ) : !clientReady ? (
              <div className="flex min-h-[240px] items-center justify-center">
                <p className="typo-body-2-normal text-label-assistant">불러오는 중…</p>
              </div>
            ) : !hasJsonResponse ? (
              <EmptyApiJsonResponseState apiName={resolvedApiName} />
            ) : (
              <ApiResponseSection
                apiName={resolvedApiName}
                checkedValue={checkedValue}
                setCheckedValue={setCheckedValue}
                activeResponse={activeResponse}
                onApplyActiveResponse={(item: ApiResponseItem) => {
                  setStoredActiveApiResponse(resolvedApiName, {
                    apiName: resolvedApiName,
                    responseValue: item.value,
                    type: item.type === "local" ? "default" : item.type === "test" ? "test" : "error",
                    title: item.label,
                    description: item.description,
                    configuration: item.configuration,
                  });
                  markRegisteredApiJsonResponse(resolvedApiName);
                  setResponseUiTick((t) => t + 1);
                }}
                onDeletePersistedResponse={async (item: ApiResponseItem) => {
                  const p = getProjectForApiName(resolvedApiName);
                  if (!p) {
                    setDeleteErrorNotice({ open: true, message: "프로젝트를 찾을 수 없습니다." });
                    return;
                  }
                  const result = await deleteSavedApiResponse(p.id, resolvedApiName, item.value);
                  if (!result.ok) {
                    setDeleteErrorNotice({ open: true, message: formatSaveApiResponseUserError(result.error) });
                    return;
                  }
                  clearStoredActiveApiResponseIfMatches(resolvedApiName, item.value);
                  clearRegisteredApiJsonFlagIfNoSavedResponses(resolvedApiName);
                  setResponseUiTick((t) => t + 1);
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

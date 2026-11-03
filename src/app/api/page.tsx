"use client";

// React
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// Components
import ApiExplorerHeader from "@/components/api/ApiExplorerHeader";
import ApiResponseLatencyField from "@/components/api/ApiResponseLatencyField";
import ApiResponseSection from "@/components/api/ApiResponseSection";
import EmptyApiJsonResponseState from "@/components/api/EmptyApiJsonResponseState";
import { NoticeModal } from "@/components/common/modals";
import Navigation from "@/components/shared/Navigation";

// Libs
import { getAppPathname, navigateApp } from "@/libs/app-navigation";
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
  tryParseApiResponseExportBundle,
} from "@/libs/datadummy/api";
import { storeApiResponseEditorDraft } from "@/libs/datadummy/editor-draft";
import {
  deleteSavedApiResponse,
  formatSaveApiResponseUserError,
  getApiEndpointByName,
  getProjectForApiName,
  getProjectHref,
  getProjectRouteSlug,
  clearMockActiveApiResponseIfMatches,
  loadStoredApiLatencyMs,
  persistMockActiveApiResponse,
  PROJECT_APIS_CHANGED_EVENT,
  PROJECT_API_RESPONSES_CHANGED_EVENT,
  setStoredApiLatencyMs,
} from "@/libs/projects/store";

const MAX_LATENCY_SECONDS = 300;

function formatLatencySecondsFromMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0";
  const sec = ms / 1000;
  const rounded = Math.round(sec * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function parseLatencySecondsInput(raw: string): number | null {
  const s = raw.trim().replace(/,/g, "").replace(/\s/g, "");
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > MAX_LATENCY_SECONDS) return null;
  return n;
}

interface ProjectApiPageProps {
  apiName: string;
}

function apiNameFromAppPath(): string {
  if (typeof window === "undefined") return "";
  const p = getAppPathname();
  if (!p.startsWith("/api/")) return "";
  const seg = p.slice("/api/".length).split("/")[0] ?? "";
  if (!seg || seg === "json") return "";
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

export default function ProjectApiPage({ apiName }: ProjectApiPageProps) {
  const resolvedApiName = apiName || apiNameFromAppPath();
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const [apisTick, setApisTick] = useState(0);
  const [responseUiTick, setResponseUiTick] = useState(0);
  const [clientReady, setClientReady] = useState(false);
  const [checkedValue, setCheckedValue] = useState("");
  const [deleteErrorNotice, setDeleteErrorNotice] = useState<{ open: boolean; message: string }>({ open: false, message: "" });
  const [latencyInput, setLatencyInput] = useState("0");
  const [latencyApplyBusy, setLatencyApplyBusy] = useState(false);
  const [latencyAppliedHint, setLatencyAppliedHint] = useState<string | null>(null);
  const [responseApplyBusy, setResponseApplyBusy] = useState(false);
  const latencyLoadSeqRef = useRef(0);
  const responseApplyInFlightRef = useRef(false);

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

  useLayoutEffect(() => {
    mainScrollRef.current?.scrollTo(0, 0);
  }, [resolvedApiName]);

  useEffect(() => {
    const loadSeq = ++latencyLoadSeqRef.current;
    const apiKey = resolvedApiName.trim();
    setLatencyInput("0");
    setLatencyAppliedHint(null);
    if (!apiKey) return;
    void (async () => {
      const ms = await loadStoredApiLatencyMs(apiKey);
      if (latencyLoadSeqRef.current !== loadSeq) return;
      setLatencyInput(formatLatencySecondsFromMs(ms));
    })();
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

  const applyLatencyInput = () => {
    const key = resolvedApiName.trim();
    if (!key || latencyApplyBusy) return;
    const seconds = parseLatencySecondsInput(latencyInput);
    if (seconds === null) {
      void loadStoredApiLatencyMs(key).then((ms) => setLatencyInput(formatLatencySecondsFromMs(ms)));
      return;
    }
    const ms = Math.round(seconds * 1000);
    const tran = endpoint?.tran?.trim();
    const alsoKeys = tran && tran !== key ? [tran] : [];
    setLatencyApplyBusy(true);
    void (async () => {
      try {
        await setStoredApiLatencyMs(key, ms, { alsoKeys });
        setLatencyInput(formatLatencySecondsFromMs(ms));
        setLatencyAppliedHint(ms > 0 ? `${formatLatencySecondsFromMs(ms)}초 지연이 적용되었습니다.` : "응답 지연이 해제되었습니다.");
      } finally {
        setLatencyApplyBusy(false);
      }
    })();
  };

  const importJsonFile = async (file: File): Promise<void> => {
    try {
      const text = await file.text();
      if (!text.trim()) {
        setDeleteErrorNotice({ open: true, message: "선택한 JSON 파일이 비어 있습니다." });
        return;
      }

      const parsed = JSON.parse(text) as unknown;
      const bundle = tryParseApiResponseExportBundle(parsed);
      const fileTitle = file.name.replace(/\.json$/i, "").trim() || "가져온 응답";
      const draftId = storeApiResponseEditorDraft(bundle ?? {
        title: fileTitle,
        description: "",
        editorType: "default",
        configuration: JSON.stringify(parsed, null, 2),
        queryParams: {},
      });
      const editorType = bundle?.editorType ?? "default";
      navigateApp(
        `/api/json?state=new&apiName=${encodeURIComponent(resolvedApiName)}&type=${editorType}&draftId=${encodeURIComponent(draftId)}`,
      );
    } catch (error) {
      setDeleteErrorNotice({
        open: true,
        message: error instanceof SyntaxError
          ? "올바른 JSON 파일이 아닙니다. 파일 형식을 확인해 주세요."
          : "JSON 파일을 읽지 못했습니다. 다시 선택해 주세요.",
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 overflow-x-hidden">
      <Navigation activeProjectSlug={activeProjectSlug} currentApiName={resolvedApiName} onNewProject={() => navigateApp("/")} />
      <div id="app-main" className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
        <NoticeModal isOpen={deleteErrorNotice.open} onClose={() => setDeleteErrorNotice({ open: false, message: "" })} message={deleteErrorNotice.message} anchorMain />
        <input
          ref={jsonFileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (file) void importJsonFile(file).finally(() => { input.value = ""; });
          }}
        />
        <div className="border-border-enabled bg-background-white border-b">
          <div className="mx-auto w-full max-w-[1600px] px-6 pt-6">
            <button
              type="button"
              onClick={() => {
                if (project) {
                  navigateApp(getProjectHref(project));
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
            onNewResponseClick={() => {
              navigateApp(`/api/json?state=new&apiName=${encodeURIComponent(resolvedApiName)}&type=default`);
            }}
            onJsonAddClick={() => jsonFileInputRef.current?.click()}
            onSettingsClick={() => {
              navigateApp(getJsonEditorHrefForSelectedValue(resolvedApiName, checkedValue));
            }}
          />
        </div>
        <div ref={mainScrollRef} className="min-w-0 flex-1 overflow-auto px-6 py-8">
          <div className="mx-auto w-full max-w-[1600px] space-y-6">
            {endpoint ? (
              <ApiResponseLatencyField
                value={latencyInput}
                onValueChange={(v) => {
                  setLatencyInput(v);
                  if (latencyAppliedHint) setLatencyAppliedHint(null);
                }}
                onApply={applyLatencyInput}
                applyBusy={latencyApplyBusy}
                appliedHint={latencyAppliedHint}
              />
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
                applyBusy={responseApplyBusy}
                onApplyActiveResponse={async (item: ApiResponseItem) => {
                  if (responseApplyInFlightRef.current) return;
                  responseApplyInFlightRef.current = true;
                  setResponseApplyBusy(true);
                  try {
                    const editorType = item.type === "local" ? "default" : item.type === "test" ? "test" : "error";
                    const applied = await persistMockActiveApiResponse(
                      resolvedApiName,
                      { responseValue: item.value, editorType },
                      { alsoKeys: endpoint?.tran?.trim() && endpoint.tran.trim() !== resolvedApiName ? [endpoint.tran.trim()] : [] },
                    );
                    if (!applied.ok) {
                      setDeleteErrorNotice({ open: true, message: `응답을 적용하지 못했습니다. (${applied.error})` });
                      return;
                    }
                    setStoredActiveApiResponse(resolvedApiName, {
                      apiName: resolvedApiName,
                      responseValue: item.value,
                      type: editorType,
                      title: item.label,
                      description: item.description,
                      configuration: item.configuration,
                    });
                    markRegisteredApiJsonResponse(resolvedApiName);
                    setResponseUiTick((t) => t + 1);
                  } finally {
                    responseApplyInFlightRef.current = false;
                    setResponseApplyBusy(false);
                  }
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
                  const cleared = await clearMockActiveApiResponseIfMatches(resolvedApiName, item.value, {
                    alsoKeys: endpoint?.tran?.trim() && endpoint.tran.trim() !== resolvedApiName ? [endpoint.tran.trim()] : [],
                  });
                  if (!cleared.ok) {
                    setDeleteErrorNotice({
                      open: true,
                      message: `응답은 삭제했지만 사용 설정을 정리하지 못했습니다. 다른 응답을 선택해 적용해 주세요. (${cleared.error})`,
                    });
                  } else {
                    clearStoredActiveApiResponseIfMatches(resolvedApiName, item.value);
                  }
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

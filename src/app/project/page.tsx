"use client";

// React
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// Assets
import DownloadIcon from "@/assets/svg/DownloadIcon";
import PlusIcon from "@/assets/svg/PlusIcon";
// Components
import Btn from "@/components/common/Btn";
import Input from "@/components/common/Input";
import ApiEndpointsTable, { type ApiEndpointsTableHandle } from "@/components/project/ApiEndpointsTable";
import NoApiEndpoints from "@/components/project/NoApiEndpoints";
import { ApiImportConflictModal, ConfirmModal, NoticeModal, RegisterApiModal, type ApiImportConflictPolicy } from "@/components/common/modals";
import Header from "@/components/shared/Header";
import Navigation from "@/components/shared/Navigation";

// Libs
import { navigateApp } from "@/libs/app-navigation";
import { markRegisteredApiJsonResponse } from "@/libs/datadummy/api";
import { getProjectBySlug, getProjectRouteSlug } from "@/libs/datadummy/home";
import {
  formatAddApiUserError,
  clearProjectApiMetadataSources,
  getEndpointsForProject,
  getSavedApiResponsesForProjectApi,
  importProjectApisFromJsonPick,
  reanalyzeProjectApiMetadata,
  PROJECT_APIS_CHANGED_EVENT,
  refreshProjectApisFromDisk,
} from "@/libs/projects/store";
import type { ApiEndpoint } from "@/types";

interface ProjectPageProps {
  projectSlug: string | null;
}

export default function ProjectPage({ projectSlug }: ProjectPageProps) {
  const [apiModalOpen, setApiModalOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<ApiEndpoint | null>(null);
  const [listTick, setListTick] = useState(0);
  const [importNotice, setImportNotice] = useState<{ open: boolean; message: string }>({ open: false, message: "" });
  const [apiSearchQuery, setApiSearchQuery] = useState("");
  const [metadataAnalyzing, setMetadataAnalyzing] = useState(false);
  const [metadataResetConfirmOpen, setMetadataResetConfirmOpen] = useState(false);
  const [importConflict, setImportConflict] = useState<{ sessionId: string; fileNames: string[] } | null>(null);
  const [importConflictBusy, setImportConflictBusy] = useState(false);
  const [importConflictPolicy, setImportConflictPolicy] = useState<ApiImportConflictPolicy | null>(null);
  const [apiImporting, setApiImporting] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const apiTableRef = useRef<ApiEndpointsTableHandle>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const bumpList = useCallback(() => setListTick((t) => t + 1), []);

  const project = useMemo(() => getProjectBySlug(projectSlug), [projectSlug]);

  useLayoutEffect(() => {
    mainScrollRef.current?.scrollTo(0, 0);
  }, [projectSlug]);

  useEffect(() => {
    if (!project?.id) return;
    void refreshProjectApisFromDisk(project.id);
  }, [project?.id]);

  useEffect(() => {
    const onApis = () => bumpList();
    window.addEventListener(PROJECT_APIS_CHANGED_EVENT, onApis);
    return () => window.removeEventListener(PROJECT_APIS_CHANGED_EVENT, onApis);
  }, [bumpList]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !moreMenuRef.current?.contains(event.target)) setMoreMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreMenuOpen]);

  const importSaving = apiImporting || importConflictBusy;
  const importInteractionLocked = importSaving || Boolean(importConflict);

  useEffect(() => {
    if (!importSaving) return;
    const showLeaveNotice = () => {
      setImportNotice({ open: true, message: "API를 가져오는 중입니다. 저장이 끝난 후 이동해 주세요." });
    };
    const onBeforeNavigate = (event: Event) => {
      event.preventDefault();
      showLeaveNotice();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
      showLeaveNotice();
    };
    const onLinkClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      showLeaveNotice();
    };
    window.addEventListener("dataforge-before-navigate", onBeforeNavigate);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onLinkClick, true);
    return () => {
      window.removeEventListener("dataforge-before-navigate", onBeforeNavigate);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onLinkClick, true);
    };
  }, [importSaving]);

  if (!project) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 overflow-x-hidden">
        <Navigation activeProjectSlug={null} onNewProject={() => navigateApp("/")} />
        <div id="app-main" className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
          <div className="border-border-enabled bg-background-white border-b">
            <div className="mx-auto w-full max-w-[1600px] px-6 pt-6">
              <button
                type="button"
                onClick={() => {
                  navigateApp("/");
                }}
                className="typo-caption-1 text-label-assistant hover:text-label-normal mb-1 w-fit cursor-pointer text-left transition-colors"
              >
                ← 홈으로 돌아가기
              </button>
            </div>
            <Header variant="sub" title="프로젝트" className="!pt-3" />
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center px-6 py-16">
            <p className="typo-body-1-normal text-label-assistant text-center">등록된 프로젝트가 없거나 찾을 수 없습니다. 홈에서 프로젝트를 만들어 주세요.</p>
          </div>
        </div>
      </div>
    );
  }

  const endpoints = useMemo(() => getEndpointsForProject(project.id), [project.id, listTick]);
  const filteredEndpoints = useMemo(() => {
    const q = apiSearchQuery.trim().toLowerCase();
    if (!q) return endpoints;
    return endpoints.filter((e) => {
      const name = (e.name ?? "").toLowerCase();
      const tran = (e.tran ?? "").toLowerCase();
      const description = (e.description ?? "").toLowerCase();
      const responseText = getSavedApiResponsesForProjectApi(project.id, e.name)
        .map((response) =>
          [response.label, response.description, ...Object.entries(response.queryParams ?? {}).flat()].join(" "),
        )
        .join(" ")
        .toLowerCase();
      return name.includes(q) || tran.includes(q) || description.includes(q) || responseText.includes(q);
    });
  }, [endpoints, apiSearchQuery, project.id, listTick]);
  const currentProjectSlug = projectSlug ?? getProjectRouteSlug(project);

  const applyImportResult = useCallback((r: Extract<Awaited<ReturnType<typeof importProjectApisFromJsonPick>>, { ok: true }>) => {
    for (const name of new Set(r.touchedApiNames)) markRegisteredApiJsonResponse(name);
    bumpList();
    const lines = r.fileResults.slice(0, 8).map((item) => {
      const label = item.status === "failed" ? "실패" : item.status === "skipped" ? "건너뜀" : "반영";
      return `· ${label}: ${item.fileName}${item.reason ? ` — ${item.reason}` : ""}`;
    });
    const more = r.fileResults.length > lines.length ? [`· 외 ${r.fileResults.length - lines.length}개`] : [];
    setImportNotice({
      open: true,
      message: [
        `새 응답 ${r.imported}개 · 업데이트 ${r.updated}개 · 건너뜀 ${r.skipped}개 · 실패 ${r.errors.length}개`,
        ...(lines.length ? ["", ...lines, ...more] : []),
      ].join("\n"),
    });
  }, [bumpList]);

  const handleImportApiJson = useCallback(async () => {
    if (apiImporting || importConflict) return;
    setApiImporting(true);
    try {
      const r = await importProjectApisFromJsonPick(project.id);
      if (!r.ok) {
        if (r.error === "cancelled") return;
        if (r.error === "changed-file-conflict" && r.sessionId && r.conflictFiles?.length) {
          setImportConflict({ sessionId: r.sessionId, fileNames: r.conflictFiles });
          return;
        }
        const msg = [formatAddApiUserError(r.error), ...(r.errors?.length ? ["", ...r.errors] : [])].join("\n");
        setImportNotice({ open: true, message: msg });
        return;
      }
      applyImportResult(r);
    } finally {
      setApiImporting(false);
    }
  }, [project.id, apiImporting, importConflict, applyImportResult]);

  const handleImportConflict = useCallback(async (policy: ApiImportConflictPolicy) => {
    if (!importConflict || importConflictBusy) return;
    setImportConflictPolicy(policy);
    setImportConflictBusy(true);
    try {
      const r = await importProjectApisFromJsonPick(project.id, { sessionId: importConflict.sessionId, conflictPolicy: policy });
      setImportConflict(null);
      if (!r.ok) {
        setImportNotice({ open: true, message: [formatAddApiUserError(r.error), ...(r.errors?.length ? ["", ...r.errors] : [])].join("\n") });
        return;
      }
      applyImportResult(r);
    } finally {
      setImportConflictBusy(false);
      setImportConflictPolicy(null);
    }
  }, [project.id, importConflict, importConflictBusy, applyImportResult]);

  const handleReanalyzeMetadata = useCallback(async (chooseNewSources = false) => {
    if (metadataAnalyzing) return;
    setMetadataAnalyzing(true);
    try {
      const result = await reanalyzeProjectApiMetadata(project.id, { chooseNewSources });
      if (!result.ok) {
        if (result.error === "cancelled") return;
        const message = result.error === "no-interface-data"
          ? "선택한 파일에서 tranId와 desc 정보를 찾지 못했습니다."
          : result.error === "read-failed"
            ? "모듈 파일을 읽지 못했습니다. 파일 위치와 권한을 확인해 주세요."
            : `API 정보를 다시 분석하지 못했습니다. (${result.error})`;
        setImportNotice({ open: true, message });
        return;
      }
      bumpList();
      const skipped = result.skipped.length > 0 ? `\n변경하지 못한 항목 ${result.skipped.length}개` : "";
      setImportNotice({
        open: true,
        message: result.updated > 0
          ? `API 정보 ${result.updated}개를 다시 연결했습니다.${skipped}`
          : "새로 연결할 API 정보가 없습니다. 현재 데이터가 이미 최신이거나 일치하는 tranId가 없습니다.",
      });
    } finally {
      setMetadataAnalyzing(false);
    }
  }, [project.id, metadataAnalyzing, bumpList]);

  const handleClearMetadataSources = useCallback(async () => {
    if (metadataAnalyzing) return;
    setMetadataAnalyzing(true);
    try {
      const result = await clearProjectApiMetadataSources(project.id);
      setMetadataResetConfirmOpen(false);
      if (!result.ok) {
        setImportNotice({ open: true, message: `API 정보 파일 연결을 해제하지 못했습니다. (${result.error})` });
        return;
      }
      setImportNotice({
        open: true,
        message: result.cleared
          ? "API 정보 파일 연결을 해제했습니다.\n등록된 API와 더미 응답은 그대로 유지됩니다."
          : "현재 연결된 API 정보 파일이 없습니다.",
      });
    } finally {
      setMetadataAnalyzing(false);
    }
  }, [project.id, metadataAnalyzing]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 overflow-x-hidden">
      <NoticeModal isOpen={importNotice.open} onClose={() => setImportNotice({ open: false, message: "" })} message={importNotice.message} anchorMain />
      <ApiImportConflictModal
        isOpen={Boolean(importConflict)}
        fileNames={importConflict?.fileNames ?? []}
        busy={importConflictBusy}
        processingPolicy={importConflictPolicy}
        onClose={() => {
          if (!importConflictBusy) setImportConflict(null);
        }}
        onSelect={(policy) => void handleImportConflict(policy)}
      />
      <ConfirmModal
        isOpen={metadataResetConfirmOpen}
        anchorMain
        title="API 정보 파일 연결을 해제할까요?"
        message={(
          <div className="space-y-2 text-left">
            <p>이 프로젝트에서 API 이름과 설명을 분석할 때 사용한 파일 경로를 제거합니다.</p>
            <p>현재 등록된 API와 더미 응답은 삭제하거나 변경하지 않습니다.</p>
          </div>
        )}
        cancelLabel="취소"
        confirmLabel="연결 해제"
        onClose={() => setMetadataResetConfirmOpen(false)}
        onConfirm={handleClearMetadataSources}
      />
      <RegisterApiModal
        isOpen={apiModalOpen}
        onClose={() => {
          setApiModalOpen(false);
          setEditingEndpoint(null);
        }}
        project={project}
        onRegistered={bumpList}
        initialEndpoint={editingEndpoint}
      />
      <Navigation activeProjectSlug={currentProjectSlug} onNewProject={() => navigateApp("/")} />
      <div id="app-main" className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
        <div className="border-border-enabled bg-background-white shrink-0 border-b">
          <div className="mx-auto w-full max-w-[1600px] px-6 pt-6">
            <button
              type="button"
              onClick={() => {
                navigateApp("/");
              }}
              className="typo-caption-1 text-label-assistant hover:text-label-normal mb-1 w-fit cursor-pointer text-left transition-colors"
            >
              ← 홈으로 돌아가기
            </button>
          </div>
          <Header variant="sub" title={project.name} className="!pt-3" />
        </div>

        <div ref={mainScrollRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-6 py-8">
          <div className="mb-8 flex shrink-0 flex-wrap items-center justify-between gap-4">
            <div className={`typo-title-2 text-label-normal font-bold`}>{project.name}</div>
            <div className="flex flex-wrap gap-3">
              <Btn
                category="primary"
                size="medium"
                disabled={importInteractionLocked}
                startIcon={<PlusIcon />}
                onClick={() => {
                  setEditingEndpoint(null);
                  setApiModalOpen(true);
                }}
                width={160}
              >
                API 직접 등록
              </Btn>
              <Btn
                category="secondary"
                variant
                size="medium"
                startIcon={<DownloadIcon className="h-5 w-5 shrink-0" />}
                disabled={importInteractionLocked}
                onClick={() => {
                  void handleImportApiJson();
                }}
                width={180}
              >
                {apiImporting ? "가져오는 중..." : importConflictBusy ? "반영하는 중..." : "JSON 응답 가져오기"}
              </Btn>
              <div ref={moreMenuRef} className="relative">
                <Btn
                  category="secondary"
                  variant
                  size="medium"
                  width={112}
                  disabled={importInteractionLocked}
                  onClick={() => setMoreMenuOpen((open) => !open)}
                >
                  더보기 ···
                </Btn>
                {moreMenuOpen ? (
                  <div className="border-border-enabled bg-background-white absolute top-[calc(100%+8px)] right-0 z-30 w-[320px] overflow-hidden rounded-xl border py-2 shadow-[0_12px_32px_rgba(15,23,42,0.16)]">
                    <button
                      type="button"
                      disabled={metadataAnalyzing || endpoints.length === 0}
                      onClick={() => {
                        setMoreMenuOpen(false);
                        void handleReanalyzeMetadata();
                      }}
                      className="hover:bg-background-secondary-weak disabled:text-label-assistant w-full cursor-pointer px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="typo-body-2-normal text-label-normal block font-semibold">{metadataAnalyzing ? "분석 중" : "API 정보 다시 분석"}</span>
                      <span className="typo-caption-1 text-label-assistant mt-1 block">연결된 파일에서 API 이름과 설명을 다시 읽습니다.</span>
                    </button>
                    <button
                      type="button"
                      disabled={metadataAnalyzing || endpoints.length === 0}
                      onClick={() => {
                        setMoreMenuOpen(false);
                        void handleReanalyzeMetadata(true);
                      }}
                      className="hover:bg-background-secondary-weak disabled:text-label-assistant w-full cursor-pointer px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="typo-body-2-normal text-label-normal block font-semibold">API 정보 파일 변경</span>
                      <span className="typo-caption-1 text-label-assistant mt-1 block">이름과 설명을 가져올 다른 모듈 파일을 선택합니다.</span>
                    </button>
                    <button
                      type="button"
                      disabled={filteredEndpoints.length === 0}
                      onClick={() => {
                        setMoreMenuOpen(false);
                        apiTableRef.current?.exportSelected();
                      }}
                      className="hover:bg-background-secondary-weak disabled:text-label-assistant w-full cursor-pointer px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="typo-body-2-normal text-label-normal block font-semibold">선택한 API 추출</span>
                      <span className="typo-caption-1 text-label-assistant mt-1 block">테이블에서 선택한 API와 응답을 파일로 저장합니다.</span>
                    </button>
                    <div className="border-border-week my-2 border-t" />
                    <button
                      type="button"
                      disabled={metadataAnalyzing}
                      onClick={() => {
                        setMoreMenuOpen(false);
                        setMetadataResetConfirmOpen(true);
                      }}
                      className="hover:bg-background-negative-weak w-full cursor-pointer px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="typo-body-2-normal text-label-negative block font-semibold">API 정보 연결 해제</span>
                      <span className="typo-caption-1 text-label-assistant mt-1 block">등록 데이터는 유지하고 연결된 파일 경로만 제거합니다.</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {endpoints.length > 0 ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="mb-5 flex justify-end">
                <Input value={apiSearchQuery} onChange={(e) => setApiSearchQuery(e.target.value)} placeholder="트랜, 설명, 응답 조건 검색" size="medium" width="360px" />
              </div>
              {filteredEndpoints.length === 0 ? (
                <p className="typo-body-2-normal text-label-assistant shrink-0 py-10 text-center">검색과 일치하는 API가 없습니다.</p>
              ) : (
                <ApiEndpointsTable
                  ref={apiTableRef}
                  project={project}
                  endpoints={filteredEndpoints}
                  onListChange={bumpList}
                  onEdit={(row) => {
                    setEditingEndpoint(row);
                    setApiModalOpen(true);
                  }}
                />
              )}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
              <NoApiEndpoints
                onRegisterApi={() => {
                  setEditingEndpoint(null);
                  setApiModalOpen(true);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

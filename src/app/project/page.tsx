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
import { NoticeModal, RegisterApiModal } from "@/components/common/modals";
import Header from "@/components/shared/Header";
import Navigation from "@/components/shared/Navigation";

// Libs
import { navigateApp } from "@/libs/app-navigation";
import { markRegisteredApiJsonResponse } from "@/libs/datadummy/api";
import { getProjectBySlug, getProjectRouteSlug } from "@/libs/datadummy/home";
import {
  formatAddApiUserError,
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
  const apiTableRef = useRef<ApiEndpointsTableHandle>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);

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

  const handleImportApiJson = useCallback(async () => {
    const r = await importProjectApisFromJsonPick(project.id);
    if (!r.ok) {
      if (r.error === "cancelled") return;
      const msg = [formatAddApiUserError(r.error), ...(r.errors?.length ? ["", ...r.errors] : [])].join("\n");
      setImportNotice({ open: true, message: msg });
      return;
    }
    for (const name of new Set(r.touchedApiNames)) {
      markRegisteredApiJsonResponse(name);
    }
    bumpList();
    if (r.errors.length > 0) {
      setImportNotice({
        open: true,
        message: [`${r.imported}개 파일을 반영했습니다. 일부는 건너뛰었습니다.`, "", ...r.errors].join("\n"),
      });
    }
  }, [project.id, bumpList]);

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

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 overflow-x-hidden">
      <NoticeModal isOpen={importNotice.open} onClose={() => setImportNotice({ open: false, message: "" })} message={importNotice.message} anchorMain />
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
                startIcon={<PlusIcon />}
                onClick={() => {
                  setEditingEndpoint(null);
                  setApiModalOpen(true);
                }}
                width={180}
              >
                API 등록하기
              </Btn>
              <Btn
                category="secondary"
                variant
                size="medium"
                disabled={metadataAnalyzing || endpoints.length === 0}
                onClick={() => void handleReanalyzeMetadata()}
                width={180}
              >
                {metadataAnalyzing ? "분석 중" : "API 정보 다시 분석"}
              </Btn>
              <Btn
                category="secondary"
                variant
                size="medium"
                disabled={metadataAnalyzing || endpoints.length === 0}
                onClick={() => void handleReanalyzeMetadata(true)}
                width={180}
              >
                API 정보 파일 변경
              </Btn>
              <Btn
                category="secondary"
                variant
                size="medium"
                startIcon={<DownloadIcon className="h-5 w-5 shrink-0" />}
                onClick={() => {
                  void handleImportApiJson();
                }}
                width={180}
              >
                API 가져오기
              </Btn>
              <Btn
                category="secondary"
                variant
                size="medium"
                startIcon={<DownloadIcon className="h-5 w-5 shrink-0" />}
                onClick={() => apiTableRef.current?.exportSelected()}
                width={180}
                disabled={filteredEndpoints.length === 0}
              >
                추출하기
              </Btn>
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

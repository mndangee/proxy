"use client";

// React
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { markRegisteredApiJsonResponse } from "@/libs/datadummy/api";
import { getProjectBySlug, getProjectRouteSlug } from "@/libs/datadummy/home";
import {
  formatAddApiUserError,
  getEndpointsForProject,
  importProjectApisFromJsonPick,
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
  const [projectsTick, setProjectsTick] = useState(0);
  const [importNotice, setImportNotice] = useState<{ open: boolean; message: string }>({ open: false, message: "" });
  const [apiSearchQuery, setApiSearchQuery] = useState("");
  const apiTableRef = useRef<ApiEndpointsTableHandle>(null);

  const bumpList = useCallback(() => setListTick((t) => t + 1), []);

  const project = useMemo(() => getProjectBySlug(projectSlug), [projectSlug, projectsTick]);

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
        <Navigation activeProjectSlug={null} onNewProject={() => (window.location.href = "/")} />
        <div id="app-main" className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
          <div className="border-border-enabled bg-background-white border-b">
            <div className="mx-auto w-full max-w-[1600px] px-6 pt-6">
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/";
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
      return name.includes(q) || tran.includes(q);
    });
  }, [endpoints, apiSearchQuery]);
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
      <Navigation activeProjectSlug={currentProjectSlug} onNewProject={() => (window.location.href = "/")} />
      <div id="app-main" className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
        <div className="border-border-enabled bg-background-white shrink-0 border-b">
          <div className="mx-auto w-full max-w-[1600px] px-6 pt-6">
            <button
              type="button"
              onClick={() => {
                window.location.href = "/";
              }}
              className="typo-caption-1 text-label-assistant hover:text-label-normal mb-1 w-fit cursor-pointer text-left transition-colors"
            >
              ← 홈으로 돌아가기
            </button>
          </div>
          <Header variant="sub" title={project.name} className="!pt-3" />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-6 py-8">
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
                <Input value={apiSearchQuery} onChange={(e) => setApiSearchQuery(e.target.value)} placeholder="API 이름 또는 트랜 이름 검색" size="medium" width="360px" />
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

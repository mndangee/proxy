"use client";

// React
import { useCallback, useEffect, useState } from "react";

// Components
import Header from "@/components/shared/Header";
import ImportProjectIntroModal from "@/components/common/modals/ImportProjectIntroModal";
import { NoticeModal } from "@/components/common/modals";
import Modal from "@/components/common/Modal";
import ProjectsList from "@/components/main/ProjectList";
import ProjectTab, { type ProjectTabValue } from "@/components/main/ProjectTab";
import HistoryList from "@/components/main/HistoryList";
import ProxyServerSettingsCard from "@/components/main/ProxyServerSettingsCard";
// Libs
import {
  DUPLICATE_PROJECT_NAME_MESSAGE,
  getStoredProjects,
  hydrateProjects,
  importSharedProject,
  PROJECTS_CHANGED_EVENT,
  readHomeProjectTabFromUrl,
  requestOpenCreateProjectModal,
} from "@/libs/projects/store";

// Types
import type { Project } from "@/types";

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectTab, setProjectTab] = useState<ProjectTabValue>(() => readHomeProjectTabFromUrl());
  const [importModal, setImportModal] = useState<{ open: boolean; message: string }>({ open: false, message: "" });
  const [importIntroOpen, setImportIntroOpen] = useState(false);
  const [proxySettingsOpen, setProxySettingsOpen] = useState(false);

  const refreshProjects = useCallback(() => {
    setProjects(getStoredProjects());
  }, []);

  /** 즐겨찾기가 1개 이상일 때만 탭 노출 */
  const showProjectTabs = projects.some((p) => p.isFavorite);
  /** 탭을 숨길 땐 항상 전체 목록(즐겨찾기만 보기 상태로 비어 보이지 않도록) */
  const tabForList = showProjectTabs ? projectTab : "all";
  const visibleProjects = tabForList === "favorites" ? projects.filter((p) => p.isFavorite) : projects;

  useEffect(() => {
    if (!showProjectTabs && projectTab !== "all") setProjectTab("all");
  }, [showProjectTabs, projectTab]);

  const showImportModal = useCallback((message: string) => setImportModal({ open: true, message }), []);
  const closeImportModal = useCallback(() => setImportModal({ open: false, message: "" }), []);

  const runImportProject = useCallback(() => {
    void (async () => {
      const r = await importSharedProject();
      if (!r.ok) {
        if (r.error === "cancelled") return;
        if (r.error === "electron-only") showImportModal("Electron 앱에서만 프로젝트를 가져올 수 있습니다.");
        else if (r.error === "no-json-files") showImportModal("project.json을 제외한 .json 이 없습니다. 루트에 두거나, 하위 폴더마다 응답 .json 을 넣어 주세요.");
        else if (r.error === "invalid-manifest") showImportModal("가져올 수 없습니다. 매니페스트 JSON·project.json 폴더, 또는 루트에 JSON 파일이 있는 폴더/ZIP을 사용해 주세요.");
        else if (r.error === "invalid-zip") showImportModal("ZIP을 열거나 압축을 풀 수 없습니다.");
        else if (r.error === "duplicate-name") showImportModal(DUPLICATE_PROJECT_NAME_MESSAGE);
        else showImportModal(`가져오기에 실패했습니다. (${r.error ?? "알 수 없는 오류"})`);
        return;
      }
      showImportModal("프로젝트를 가져왔습니다.");
    })();
  }, [showImportModal]);

  const handleImportIntroContinue = useCallback(() => {
    setImportIntroOpen(false);
    runImportProject();
  }, [runImportProject]);

  useEffect(() => {
    void hydrateProjects();
  }, []);

  useEffect(() => {
    refreshProjects();
    const onChange = () => refreshProjects();
    window.addEventListener(PROJECTS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, onChange);
  }, [refreshProjects]);

  return (
    <>
      <NoticeModal isOpen={importModal.open} onClose={closeImportModal} message={importModal.message} />
      <ImportProjectIntroModal isOpen={importIntroOpen} onClose={() => setImportIntroOpen(false)} onContinue={handleImportIntroContinue} />
      <Modal isOpen={proxySettingsOpen} onClose={() => setProxySettingsOpen(false)} size="large" panelClassName="max-w-[600px]" anchorMain>
        <div className="max-h-[82vh] overflow-y-auto">
          <ProxyServerSettingsCard onClose={() => setProxySettingsOpen(false)} />
        </div>
      </Modal>

      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <Header variant="main" title="Project Management" onImportProject={() => setImportIntroOpen(true)} onCreateProject={requestOpenCreateProjectModal} />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] px-6">
            <div className="mt-8 mb-8">
              <div className="mb-4 flex items-end justify-between gap-3 border-b border-gray-200">
                <div>{showProjectTabs ? <ProjectTab activeTab={projectTab} onTabChange={setProjectTab} /> : null}</div>
                <button
                  type="button"
                  onClick={() => setProxySettingsOpen(true)}
                  className="typo-body-2-normal border-border-enabled text-label-normal rounded-3 mb-2 cursor-pointer border px-4 py-2 transition-colors hover:bg-gray-50"
                >
                  프록시 설정
                </button>
              </div>
              <div className="">
                <ProjectsList folderId="id" projects={visibleProjects} onProjectsChange={refreshProjects} />
                <HistoryList limit={8} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

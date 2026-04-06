"use client";

// React
import { useCallback, useEffect, useState } from "react";

// Components
import Header from "@/components/shared/Header";
import NoticeModal from "@/components/shared/NoticeModal";
import ProjectsList from "@/components/main/ProjectList";
import ProjectTab, { type ProjectTabValue } from "@/components/main/ProjectTab";
import HistoryList from "@/components/main/HistoryList";
// Libs
import {
  DUPLICATE_PROJECT_NAME_MESSAGE,
  getStoredProjects,
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

  const handleImportProject = useCallback(() => {
    void (async () => {
      const r = await importSharedProject();
      if (!r.ok) {
        if (r.error === "cancelled") return;
        if (r.error === "electron-only") showImportModal("Electron 앱에서만 프로젝트를 가져올 수 있습니다.");
        else if (r.error === "invalid-manifest") showImportModal("ZIP 또는 폴더에 유효한 project.json(version 1)이 없습니다.");
        else if (r.error === "invalid-zip") showImportModal("ZIP을 열거나 압축을 풀 수 없습니다.");
        else if (r.error === "duplicate-name") showImportModal(DUPLICATE_PROJECT_NAME_MESSAGE);
        else showImportModal(`가져오기에 실패했습니다. (${r.error ?? "알 수 없는 오류"})`);
        return;
      }
      showImportModal("프로젝트를 가져왔습니다. 공유받은 ZIP·폴더는 그대로 두고 복사본이 앱 데이터에 추가됩니다.");
    })();
  }, [showImportModal]);

  useEffect(() => {
    refreshProjects();
    const onChange = () => refreshProjects();
    window.addEventListener(PROJECTS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, onChange);
  }, [refreshProjects]);

  return (
    <>
      <NoticeModal isOpen={importModal.open} onClose={closeImportModal} message={importModal.message} />

      <Header
        variant="main"
        title="Project Management"
        onImportProject={handleImportProject}
        onCreateProject={requestOpenCreateProjectModal}
      />

      <div className="mx-auto w-full max-w-[1600px] px-6">
        <div className="mt-8 mb-8">
          {showProjectTabs ? <ProjectTab activeTab={projectTab} onTabChange={setProjectTab} /> : null}
          <div className="">
            <ProjectsList folderId="id" projects={visibleProjects} onProjectsChange={refreshProjects} />
            <HistoryList folderId={""} />
          </div>
        </div>
      </div>
    </>
  );
}

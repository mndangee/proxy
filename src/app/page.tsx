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
import { navigateApp } from "@/libs/app-navigation";
import {
  DUPLICATE_PROJECT_NAME_MESSAGE,
  analyzeSharedProjectImport,
  executeSharedProjectImport,
  getStartupProxyRecoveryNotice,
  getProjectHref,
  getStoredProjects,
  hydrateProjects,
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
  const [importComplete, setImportComplete] = useState<{ message: string; projectHref: string } | null>(null);
  const [importIntroOpen, setImportIntroOpen] = useState(false);
  const [proxySettingsOpen, setProxySettingsOpen] = useState(false);
  const [proxySettingsBusy, setProxySettingsBusy] = useState(false);
  const [startupRecoveryMessage, setStartupRecoveryMessage] = useState("");

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

  const showImportError = useCallback((error: string | undefined) => {
    if (error === "electron-only") showImportModal("Electron 앱에서만 더미 데이터를 가져올 수 있습니다.");
    else if (error === "no-json-files") showImportModal("가져올 수 있는 JSON 응답 파일이 없습니다.");
    else if (error === "invalid-manifest") showImportModal("지원하지 않거나 읽을 수 없는 프로젝트 데이터입니다.");
    else if (error === "invalid-zip") showImportModal("ZIP을 열거나 압축을 풀 수 없습니다.");
    else if (error === "duplicate-name") showImportModal(DUPLICATE_PROJECT_NAME_MESSAGE);
    else if (error === "import-session-not-found") showImportModal("가져오기 정보가 만료되었습니다. 파일을 다시 선택해 주세요.");
    else if (error === "app-restart-required") showImportModal("새 가져오기 기능을 사용하려면 앱을 완전히 종료한 후 다시 실행해 주세요.");
    else showImportModal(`가져오기에 실패했습니다. (${error ?? "알 수 없는 오류"})`);
  }, [showImportModal]);

  const importProject = useCallback(() => {
    void (async () => {
      const analyzed = await analyzeSharedProjectImport();
      if (!analyzed.ok) {
        if (analyzed.error === "cancelled") return;
        showImportError(analyzed.error);
        return;
      }

      const analysis = analyzed.analysis;
      const imported = await executeSharedProjectImport(analysis.sessionId);
      if (!imported.ok) {
        showImportError(imported.error);
        return;
      }

      refreshProjects();
      const summary = imported.summary ?? analysis;
      const typeSummary = [
        `Default ${summary.defaultCount ?? 0}`,
        `Test ${summary.testCount ?? 0}`,
        `Error ${summary.errorCount ?? 0}`,
      ].join(" · ");
      const metadataSummary = summary.metadataMappedApiCount == null
        ? ""
        : ` · API 정보 연결 ${summary.metadataMappedApiCount}개 · 정보 미확인 ${summary.metadataUnmappedApiCount ?? 0}개`;
      const unmappedTrans = summary.metadataUnmappedTrans ?? [];
      const visibleUnmapped = unmappedTrans.slice(0, 3);
      const unmappedSummary = visibleUnmapped.length === 0
        ? ""
        : ` (${visibleUnmapped.join(", ")}${unmappedTrans.length > visibleUnmapped.length ? ` 외 ${unmappedTrans.length - visibleUnmapped.length}개` : ""})`;
      setImportComplete({
        message: `더미 응답 ${summary.responseCount}개를 가져왔습니다. API ${summary.apiCount}개 · ${typeSummary}${metadataSummary}${unmappedSummary}${summary.skippedFileCount > 0 ? ` · 제외 ${summary.skippedFileCount}개` : ""}`,
        projectHref: getProjectHref(imported.project),
      });
    })();
  }, [refreshProjects, showImportError]);

  const handleImportIntroContinue = useCallback(() => {
    setImportIntroOpen(false);
    importProject();
  }, [importProject]);

  useEffect(() => {
    void hydrateProjects();
    void getStartupProxyRecoveryNotice().then((notice) => {
      if (notice) setStartupRecoveryMessage(notice.message);
    });
  }, []);

  useEffect(() => {
    refreshProjects();
    const onChange = () => refreshProjects();
    window.addEventListener(PROJECTS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, onChange);
  }, [refreshProjects]);

  return (
    <>
      <NoticeModal
        isOpen={Boolean(startupRecoveryMessage)}
        onClose={() => setStartupRecoveryMessage("")}
        message={startupRecoveryMessage}
        anchorMain
      />
      {importComplete ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-6 left-1/2 z-[1100] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-4 rounded-3 bg-neutral-900 px-5 py-3 text-sm text-white shadow-lg"
        >
          <span>{importComplete.message}</span>
          <button
            type="button"
            className="shrink-0 cursor-pointer font-semibold text-white underline underline-offset-4"
            onClick={() => navigateApp(importComplete.projectHref)}
          >
            가져온 데이터 보기
          </button>
          <button
            type="button"
            className="shrink-0 cursor-pointer text-lg leading-none text-gray-300 hover:text-white"
            aria-label="가져오기 완료 알림 닫기"
            onClick={() => setImportComplete(null)}
          >
            ×
          </button>
        </div>
      ) : null}
      <NoticeModal isOpen={importModal.open} onClose={closeImportModal} message={importModal.message} />
      <ImportProjectIntroModal isOpen={importIntroOpen} onClose={() => setImportIntroOpen(false)} onContinue={handleImportIntroContinue} />
      <Modal isOpen={proxySettingsOpen} onClose={proxySettingsBusy ? undefined : () => setProxySettingsOpen(false)} size="large" panelClassName="max-w-[700px] !overflow-hidden" anchorMain>
        <div className="max-h-[84vh] overflow-y-auto">
          <ProxyServerSettingsCard onClose={proxySettingsBusy ? undefined : () => setProxySettingsOpen(false)} onBusyChange={setProxySettingsBusy} />
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
                  더미 응답 연결
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

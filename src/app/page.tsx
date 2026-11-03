"use client";

// React
import { useCallback, useEffect, useRef, useState } from "react";

// Components
import Header from "@/components/shared/Header";
import ImportProjectIntroModal from "@/components/common/modals/ImportProjectIntroModal";
import { ImportProjectResultModal, NoticeModal } from "@/components/common/modals";
import Modal from "@/components/common/Modal";
import ProjectsList from "@/components/main/ProjectList";
import ProjectTab, { type ProjectTabValue } from "@/components/main/ProjectTab";
import HistoryList from "@/components/main/HistoryList";
import ProxyServerSettingsCard from "@/components/main/ProxyServerSettingsCard";
import DataSettingsCard from "@/components/main/DataSettingsCard";
import Btn from "@/components/common/Btn";
// Libs
import { navigateApp } from "@/libs/app-navigation";
import {
  DUPLICATE_PROJECT_NAME_MESSAGE,
  analyzeSharedProjectImport,
  executeSharedProjectImport,
  getAppProxyConfig,
  getMockProxyStatus,
  getStartupProxyRecoveryNotice,
  getProjectHref,
  getStoredProjects,
  hydrateProjects,
  PROJECTS_CHANGED_EVENT,
  readHomeProjectTabFromUrl,
  requestOpenCreateProjectModal,
  type ProjectImportSummary,
} from "@/libs/projects/store";

// Types
import type { Project } from "@/types";

type HomeProxyConnectionState = "disconnected" | "connected" | "attention";
const IMPORT_GUIDE_HIDDEN_KEY = "dataforge-import-guide-hidden";

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectTab, setProjectTab] = useState<ProjectTabValue>(() => readHomeProjectTabFromUrl());
  const [importModal, setImportModal] = useState<{ open: boolean; message: string }>({ open: false, message: "" });
  const [importComplete, setImportComplete] = useState<{ projectName: string; projectHref: string; summary: ProjectImportSummary } | null>(null);
  const [importIntroOpen, setImportIntroOpen] = useState(false);
  const [proxySettingsOpen, setProxySettingsOpen] = useState(false);
  const [proxySettingsBusy, setProxySettingsBusy] = useState(false);
  const [dataSettingsOpen, setDataSettingsOpen] = useState(false);
  const [dataSettingsBusy, setDataSettingsBusy] = useState(false);
  const [startupRecoveryMessage, setStartupRecoveryMessage] = useState("");
  const [proxyConnectionState, setProxyConnectionState] = useState<HomeProxyConnectionState>("disconnected");
  const [importBusy, setImportBusy] = useState(false);
  const importBusyRef = useRef(false);

  const refreshProxyConnectionState = useCallback(async () => {
    const [config, status] = await Promise.all([getAppProxyConfig(), getMockProxyStatus()]);
    const configured = Boolean(config.proxyServer.enabled && config.interceptGateway?.enabled);
    if (!configured) {
      setProxyConnectionState("disconnected");
      return;
    }
    setProxyConnectionState(status?.listening && status.interceptGateway?.listening ? "connected" : "attention");
  }, []);

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

  const showImportError = useCallback((error: string | undefined, validationIssues: string[] = []) => {
    if (validationIssues.length > 0) {
      const visible = validationIssues.slice(0, 5);
      showImportModal(["가져올 수 있는 JSON 응답이 없습니다.", "", ...visible, ...(validationIssues.length > visible.length ? [`외 ${validationIssues.length - visible.length}개`] : [])].join("\n"));
      return;
    }
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
    if (importBusyRef.current) return;
    importBusyRef.current = true;
    setImportBusy(true);
    void (async () => {
      try {
      const analyzed = await analyzeSharedProjectImport();
      if (!analyzed.ok) {
        if (analyzed.error === "cancelled") return;
        showImportError(analyzed.error, analyzed.validationIssues);
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
      setImportComplete({
        projectName: imported.project.name,
        projectHref: getProjectHref(imported.project),
        summary,
      });
      } finally {
        importBusyRef.current = false;
        setImportBusy(false);
      }
    })();
  }, [refreshProjects, showImportError]);

  const handleImportIntroContinue = useCallback((skipNextTime: boolean) => {
    if (skipNextTime) window.localStorage.setItem(IMPORT_GUIDE_HIDDEN_KEY, "true");
    setImportIntroOpen(false);
    importProject();
  }, [importProject]);

  const requestProjectImport = useCallback(() => {
    if (window.localStorage.getItem(IMPORT_GUIDE_HIDDEN_KEY) === "true") {
      importProject();
      return;
    }
    setImportIntroOpen(true);
  }, [importProject]);

  useEffect(() => {
    void hydrateProjects();
    void refreshProxyConnectionState();
    void getStartupProxyRecoveryNotice().then((notice) => {
      if (notice) setStartupRecoveryMessage(notice.message);
    });
    const timer = window.setInterval(() => void refreshProxyConnectionState(), 1500);
    return () => window.clearInterval(timer);
  }, [refreshProxyConnectionState]);

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
      <ImportProjectResultModal
        isOpen={Boolean(importComplete)}
        projectName={importComplete?.projectName ?? ""}
        summary={importComplete?.summary ?? null}
        onClose={() => setImportComplete(null)}
        onOpenProject={() => {
          if (!importComplete) return;
          navigateApp(importComplete.projectHref);
          setImportComplete(null);
        }}
      />
      <NoticeModal isOpen={importModal.open} onClose={closeImportModal} message={importModal.message} />
      <ImportProjectIntroModal isOpen={importIntroOpen} onClose={() => setImportIntroOpen(false)} onContinue={handleImportIntroContinue} />
      <Modal isOpen={proxySettingsOpen} onClose={proxySettingsBusy ? undefined : () => { setProxySettingsOpen(false); void refreshProxyConnectionState(); }} size="large" panelClassName="max-w-[700px] !overflow-hidden" anchorMain>
        <div className="max-h-[84vh] overflow-y-auto">
          <ProxyServerSettingsCard onClose={proxySettingsBusy ? undefined : () => { setProxySettingsOpen(false); void refreshProxyConnectionState(); }} onBusyChange={setProxySettingsBusy} />
        </div>
      </Modal>
      <Modal isOpen={dataSettingsOpen} onClose={dataSettingsBusy ? undefined : () => setDataSettingsOpen(false)} size="medium" panelClassName="max-w-[620px] !overflow-hidden" anchorMain>
        <DataSettingsCard onClose={() => setDataSettingsOpen(false)} onBusyChange={setDataSettingsBusy} />
      </Modal>

      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <Header variant="main" title="Project Management" onImportProject={requestProjectImport} importBusy={importBusy} onCreateProject={requestOpenCreateProjectModal} />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] px-6">
            <div className="mt-8 mb-8">
              <div className="mb-4 flex items-end justify-between gap-3 border-b border-gray-200">
                <div>{showProjectTabs ? <ProjectTab activeTab={projectTab} onTabChange={setProjectTab} /> : null}</div>
                <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
                  <Btn
                    category="secondary"
                    variant
                    size="medium"
                    width={160}
                    onClick={() => setDataSettingsOpen(true)}
                  >
                    데이터 관리
                  </Btn>
                  <Btn
                    category="secondary"
                    variant
                    size="medium"
                    width={160}
                    className="relative !justify-center"
                    startIcon={(
                      <span
                        role="status"
                        aria-label={proxyConnectionState === "connected" ? "연결됨" : proxyConnectionState === "attention" ? "연결 확인 필요" : "연결 안 됨"}
                        className={`absolute left-5 h-2 w-2 shrink-0 rounded-full ${proxyConnectionState === "connected" ? "bg-emerald-500" : proxyConnectionState === "attention" ? "bg-red-500" : "bg-gray-400"}`}
                      />
                    )}
                    onClick={() => setProxySettingsOpen(true)}
                  >
                    {proxyConnectionState === "connected" ? "연결 설정" : proxyConnectionState === "attention" ? "연결 확인" : "더미 응답 연결"}
                  </Btn>
                </div>
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

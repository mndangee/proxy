"use client";

// React
import { useCallback, useEffect, useMemo, useState } from "react";

// Assets
import PlusIcon from "@/assets/svg/PlusIcon";

// Components
import Btn from "@/components/common/Btn";
import ApiEndpointsTable from "@/components/project/ApiEndpointsTable";
import NoApiEndpoints from "@/components/project/NoApiEndpoints";
import RegisterApiModal from "@/components/main/RegisterApiModal";
import Header from "@/components/shared/Header";
import Navigation from "@/components/shared/Navigation";

// Libs
import { getProjectBySlug, getProjectRouteSlug } from "@/libs/datadummy/home";
import {
  getEndpointsForProject,
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

  const bumpList = useCallback(() => setListTick((t) => t + 1), []);

  const project = getProjectBySlug(projectSlug);

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
      <div className="flex min-h-screen w-full min-w-0 overflow-x-hidden">
        <Navigation activeProjectSlug={null} onNewProject={() => (window.location.href = "/")} />
        <div id="app-main" className="relative flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden">
          <div className="border-border-enabled border-b">
            <Header variant="sub" title="프로젝트" />
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center px-6 py-16">
            <p className="typo-body-1-normal text-label-assistant text-center">등록된 프로젝트가 없거나 찾을 수 없습니다. 홈에서 프로젝트를 만들어 주세요.</p>
          </div>
        </div>
      </div>
    );
  }

  const endpoints = useMemo(() => getEndpointsForProject(project.id), [project.id, listTick]);
  const currentProjectSlug = projectSlug ?? getProjectRouteSlug(project);

  return (
    <div className="flex min-h-screen w-full min-w-0 overflow-x-hidden">
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
      <div id="app-main" className="relative flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden">
        <div className="border-border-enabled border-b">
          <Header variant="sub" title={project.name} />
        </div>

        <div className="min-w-0 flex-1 overflow-auto px-6 py-8">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
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
            </div>
          </div>
          {endpoints.length > 0 ? (
            <ApiEndpointsTable
              project={project}
              endpoints={endpoints}
              onListChange={bumpList}
              onEdit={(row) => {
                setEditingEndpoint(row);
                setApiModalOpen(true);
              }}
            />
          ) : (
            <NoApiEndpoints
              onRegisterApi={() => {
                setEditingEndpoint(null);
                setApiModalOpen(true);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

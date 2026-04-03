"use client";

// Assets
import PlusIcon from "@/assets/svg/PlusIcon";

// Components
import Btn from "@/components/common/Btn";
import ApiEndpointsTable from "@/components/project/ApiEndpointsTable";
import NoApiEndpoints from "@/components/project/NoApiEndpoints";
import Header from "@/components/shared/Header";
import Navigation from "@/components/shared/Navigation";

// Libs
import { getProjectBySlug, getProjectRouteSlug } from "@/libs/datadummy/home";
import { exportProjectToFolder, requestOpenCreateProjectModal } from "@/libs/projects/store";
import { getEndpointsForProject } from "@/libs/datadummy/project";

interface ProjectPageProps {
  projectSlug: string | null;
}

export default function ProjectPage({ projectSlug }: ProjectPageProps) {
  const project = getProjectBySlug(projectSlug);

  if (!project) {
    return (
      <div className="flex min-h-screen w-full min-w-0 overflow-x-hidden">
        <Navigation activeProjectSlug={null} onNewProject={() => (window.location.href = "/")} />
        <div className="flex min-h-full min-w-0 flex-1 flex-col overflow-x-hidden">
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

  const endpoints = getEndpointsForProject(project.id);
  const currentProjectSlug = projectSlug ?? getProjectRouteSlug(project);

  const handleExport = async () => {
    const folder = project.folderName;
    if (!folder) {
      alert("이 프로젝트는 디스크 폴더 정보가 없습니다. Electron에서 만든 프로젝트만보낼 수 있습니다.");
      return;
    }
    const res = await exportProjectToFolder(folder);
    if (!res.ok) {
      if (res.error === "electron-only") alert("Electron 앱에서만 폴더로보낼 수 있습니다.");
      else if (res.error === "cancelled") return;
      else if (res.error === "destination-exists") alert("선택한 위치에 같은 이름의 폴더가 이미 있습니다.");
      else alert(`보내기 실패: ${res.error}`);
      return;
    }
    alert(`프로젝트 폴더를 복사했습니다.\n${res.path ?? ""}\n이 폴더를 압축하거나 통째로 공유하면 다른 PC에서 「프로젝트 가져오기」로 열 수 있습니다.`);
  };

  return (
    <div className="flex min-h-screen w-full min-w-0 overflow-x-hidden">
      <Navigation activeProjectSlug={currentProjectSlug} onNewProject={() => (window.location.href = "/")} />
      <div className="flex min-h-full min-w-0 flex-1 flex-col overflow-x-hidden">
        <div className="border-border-enabled border-b">
          <Header variant="sub" title={project.name} />
        </div>

        <div className="min-w-0 flex-1 overflow-auto px-6 py-8">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div className={`typo-title-2 text-label-normal font-bold`}>{project.name}</div>
            <div className="flex flex-wrap gap-3">
              <Btn category="secondary" variant size="medium" width={160} onClick={() => void handleExport()}>
                폴더로 보내기
              </Btn>
              <Btn category="primary" size="medium" startIcon={<PlusIcon />} onClick={requestOpenCreateProjectModal} width={180}>
                프로젝트 만들기
              </Btn>
            </div>
          </div>
          {endpoints.length > 0 ? <ApiEndpointsTable endpoints={endpoints} /> : <NoApiEndpoints />}
        </div>
      </div>
    </div>
  );
}

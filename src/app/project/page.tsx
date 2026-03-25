// Assets
import PlusIcon from "@/assets/svg/PlusIcon";

// Components
import Btn from "@/components/common/Btn";
import ApiEndpointsTable from "@/components/project/ApiEndpointsTable";
import NoApiEndpoints from "@/components/project/NoApiEndpoints";
import Header from "@/components/shared/Header";
import Navigation from "@/components/shared/Navigation";

// Libs
import { getProjectBySlug, slugify } from "@/libs/data/home";
import { getEndpointsForProject } from "@/libs/data/project";

interface ProjectPageProps {
  projectSlug: string | null;
}

export default function ProjectPage({ projectSlug }: ProjectPageProps) {
  const project = getProjectBySlug(projectSlug);
  const endpoints = getEndpointsForProject(project.id);
  const currentProjectSlug = projectSlug ?? slugify(project.name);

  return (
    <div className="flex min-h-screen w-full min-w-0 overflow-x-hidden">
      <Navigation activeProjectSlug={currentProjectSlug} onNewProject={() => (window.location.href = "/")} />
      <div className="flex min-h-full min-w-0 flex-1 flex-col overflow-x-hidden">
        <div className="border-border-enabled border-b">
          <Header variant="sub" title={project.name} onSearch={(value) => console.log("search", value)} />
        </div>

        <div className="min-w-0 flex-1 overflow-auto px-6 py-8">
          <div className="mb-8 flex items-center justify-between">
            <div className={`typo-title-2 text-label-normal font-bold`}>{project.name}</div>
            <Btn
              category="primary"
              size="medium"
              startIcon={<PlusIcon />}
              onClick={() => {
                alert("click");
              }}
              width={180}
            >
              Create New Project
            </Btn>
          </div>
          {endpoints.length > 0 ? <ApiEndpointsTable endpoints={endpoints} /> : <NoApiEndpoints />}
        </div>
      </div>
    </div>
  );
}

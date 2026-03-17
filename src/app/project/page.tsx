import Header from "../../components/shared/Header";
import { getProjectBySlug } from "../../libs/data/home";

interface ProjectPageProps {
  projectSlug: string | null;
}

export default function ProjectPage({ projectSlug }: ProjectPageProps) {
  const project = getProjectBySlug(projectSlug);

  return (
    <div className="bg-background-white flex min-h-full flex-col">
      <div className="border-border-enabled border-b px-6 py-4">
        <Header variant="sub" title={project.name} onSearch={(value) => console.log("search", value)} />
      </div>
    </div>
  );
}

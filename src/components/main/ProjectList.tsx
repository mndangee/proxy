// React
import { useState } from "react";

// Components
import Loader from "@/components/common/Loader";
import ProjectCard from "@/components/main/ProjectCard";
import NoProject from "@/components/main/NoProject";

// Types
import type { Project } from "@/types";

interface IProjectListProps {
  folderId: string;
  projects: Project[];
  onProjectsChange?: () => void;
}

export default function ProjectsList(props: IProjectListProps) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div className="relative w-full">
      {isLoading && <Loader />}
      {props.projects.length > 0 ? (
        <div className="mt-9 flex flex-wrap gap-6">
          {props.projects.map((project) => (
            <ProjectCard key={project.id} project={project} setIsLoading={setIsLoading} onProjectsChange={props.onProjectsChange} />
          ))}
        </div>
      ) : (
        <>
          <NoProject text={""} buttonText={""} />
        </>
      )}
    </div>
  );
}

// React
import { useState } from "react";

// Components
import Loader from "@/components/common/Loader";
import ProjectCard from "@/components/main/ProjectCard";
import NoProject from "@/components/main/NoProject";

// Libs
import { mockProjects } from "@/libs/data/home";

interface IProjectListProps {
  folderId: string;
}

export default function ProjectsList(props: IProjectListProps) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div className="relative w-full">
      {isLoading && <Loader />}
      {mockProjects.length > 0 ? (
        <div className="mt-9 flex flex-wrap gap-6">
          {mockProjects.map((project) => (
            <ProjectCard key={project.id} projectName={project.name} lastUpdated={project.lastUpdated} setIsLoading={setIsLoading} />
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

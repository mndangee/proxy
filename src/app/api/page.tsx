"use client";

// Components
import Navigation from "@/components/shared/Navigation";
import ApiExplorerHeader from "@/components/api/ApiExplorerHeader";
import ApiResponseSection from "@/components/api/ApiResponseSection";

// Libs
import { getProjectForApiName } from "@/libs/data/project";
import { slugify } from "@/libs/data/home";

interface ProjectApiPageProps {
  apiName: string;
}

export default function ProjectApiPage({ apiName }: ProjectApiPageProps) {
  const resolvedApiName = apiName || (typeof window !== "undefined" ? decodeURIComponent(window.location.pathname.replace("/api/", "")) : "");
  const project = getProjectForApiName(resolvedApiName);
  const activeProjectSlug = project ? slugify(project.name) : null;

  return (
    <div className="flex min-h-screen w-full min-w-0 overflow-x-hidden">
      <Navigation activeProjectSlug={activeProjectSlug} currentApiName={resolvedApiName} onNewProject={() => (window.location.href = "/")} />
      <div className="flex min-h-full min-w-0 flex-1 flex-col overflow-x-hidden">
        <div className="border-border-enabled border-b">
          <ApiExplorerHeader title={resolvedApiName} />
        </div>
        <div className="min-w-0 flex-1 overflow-auto px-6 py-8">
          <ApiResponseSection apiName={resolvedApiName} />
        </div>
      </div>
    </div>
  );
}

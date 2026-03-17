import type { Project } from "../types";

interface ProjectCardProps {
  project: Project;
  href?: string;
}

export default function ProjectCard2({ project, href }: ProjectCardProps) {
  return (
    <article className="rounded-4 border-border-enabled bg-background-white flex flex-col border p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-end">
        <button
          type="button"
          className="text-label-assistant rounded p-1 hover:text-orange-500"
          aria-label={project.isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          {project.isFavorite ? (
            <svg className="h-5 w-5 fill-orange-400 text-orange-400" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          )}
        </button>
      </div>
      <h3 className="typo-body-2-normal text-label-normal mt-1 font-semibold">{project.name}</h3>
      <p className="typo-body-2-normal text-label-assistant mt-1">Last updated {project.lastUpdated}</p>
      <div className="mt-auto flex items-center justify-between pt-4">
        {href ? (
          <a href={href} className="typo-body-2-normal font-medium text-blue-600 hover:underline">
            Open Project →
          </a>
        ) : (
          <button type="button" className="typo-body-2-normal font-medium text-blue-600 hover:underline">
            Open Project →
          </button>
        )}
        <button
          type="button"
          className="text-label-assistant hover:text-label-neutral rounded p-1 hover:bg-gray-200"
          aria-label="Delete project"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </article>
  );
}

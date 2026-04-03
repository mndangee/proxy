"use client";

// React
import { useState } from "react";

// Assets
import FillStarIcon from "@/assets/svg/FillStarIcon";
import StarIcon from "@/assets/svg/StarIcon";
import PlusIcon from "@/assets/svg/PlusIcon";
import ToggleNaviIcon from "@/assets/svg/ToggleNaviIcon";

// Components
import Input from "@/components/common/Input";
import Btn from "@/components/common/Btn";

// Hooks
import useInput from "@/hooks/useInput";

// Libs
import { mockProjects } from "@/libs/data/home";
import { slugify } from "@/libs/data/home";
import { getEndpointsForProject, getProjectForApiName } from "@/libs/data/project";

export interface NavigationProps {
  /** 현재 선택된 프로젝트 slug (경로용, 예: "e-commerce-mock"). 일치하는 항목을 활성 스타일로 표시 */
  activeProjectSlug?: string | null;
  currentApiName?: string | null;
  /** "+ New Project" 클릭 시 */
  onNewProject?: () => void;
}

export default function Navigation({ activeProjectSlug = null, currentApiName = null, onNewProject }: NavigationProps) {
  const [isNavOpen, setIsNavOpen] = useState(true);

  const testInput = useInput();
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const isApiRoute = pathname.startsWith("/api/");
  const fallbackApiName = isApiRoute ? decodeURIComponent(pathname.replace("/api/", "")) : null;
  const resolvedApiName = currentApiName ?? fallbackApiName;
  const currentApiProject = resolvedApiName ? getProjectForApiName(resolvedApiName) : null;
  const apiEndpointItems = currentApiProject ? getEndpointsForProject(currentApiProject.id) : [];

  return (
    <div
      className={`flex min-h-screen self-stretch shrink-0 flex-col border-r bg-[#2D2D2D] transition-[width,padding] duration-200 ease-in-out ${
        isNavOpen ? "w-[280px] p-7" : "w-14 overflow-hidden px-3 py-7"
      }`}
    >
      {/* 상단: 토글 (접기/펼치기) */}
      <div className={isNavOpen ? "" : "flex justify-center"}>
        <button
          type="button"
          onClick={() => setIsNavOpen((open) => !open)}
          className="text-label-common cursor-pointer rounded-md p-1.5 transition-colors hover:bg-white/10"
          aria-expanded={isNavOpen}
          aria-label={isNavOpen ? "네비게이션 접기" : "네비게이션 펼치기"}
        >
          <ToggleNaviIcon />
        </button>
      </div>

      {isNavOpen && (
        <>
          <div className="mt-5">
            <Input {...testInput} width="100%" placeholder="검색" />
          </div>

          {/* 프로젝트 목록 */}
          <div className="my-5 flex min-h-0 flex-1 flex-col overflow-auto">
            {isApiRoute && resolvedApiName ? (
              <div className="flex flex-col gap-2">
                {apiEndpointItems.map((item) => (
                  <a
                    key={item.id}
                    href={`/api/${encodeURIComponent(item.name)}`}
                    className={`typo-body-2-normal rounded-3 px-5 py-4 no-underline transition-colors ${
                      item.name === resolvedApiName ? "bg-[#13A4EC]/10 text-[#13A4EC]" : "bg-white/5 text-label-common hover:bg-white/10"
                    }`}
                  >
                    <div className="truncate font-medium">{item.name}</div>
                    <div className="typo-caption-1 mt-1 truncate text-label-assistant">{item.path}</div>
                  </a>
                ))}
              </div>
            ) : (
              mockProjects.map((project) => {
                const slug = slugify(project.name);
                const isActive = activeProjectSlug != null && slug === activeProjectSlug;
                return (
                  <a
                    key={project.id}
                    href={`/project/${slug}`}
                    className={`typo-body-2-normal flex items-center gap-2 px-5 py-4 font-medium no-underline transition-colors ${
                      isActive ? "bg-[#13A4EC]/10 text-[#13A4EC]" : "text-label-common hover:bg-blue-100/10"
                    }`}
                  >
                    <span className="shrink-0 text-[1rem]">{project.isFavorite ? <FillStarIcon className="h-5 w-5" /> : <StarIcon className="text-label-assistant h-5 w-5" />}</span>
                    <span className="min-w-0 truncate">{project.name}</span>
                  </a>
                );
              })
            )}
          </div>

          {!isApiRoute && (
            <Btn
              category="primary"
              size="medium"
              startIcon={<PlusIcon />}
              onClick={() => {
                alert("click");
              }}
              width={220}
            >
              Create New Project
            </Btn>
          )}
        </>
      )}
    </div>
  );
}

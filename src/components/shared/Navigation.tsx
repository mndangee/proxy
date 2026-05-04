"use client";

// React
import { useEffect, useMemo, useState } from "react";

// Assets
import FillStarIcon from "@/assets/svg/FillStarIcon";
import StarIcon from "@/assets/svg/StarIcon";
import PlusIcon from "@/assets/svg/PlusIcon";
import ToggleNaviIcon from "@/assets/svg/ToggleNaviIcon";
import NavigationTopHomeIcon from "@/assets/svg/NavigationTopHomeIcon";

// Components
import Input from "@/components/common/Input";
import Btn from "@/components/common/Btn";

// Hooks
import useInput from "@/hooks/useInput";

// Libs
import { getApiResponseGroups, type ApiResponseItem } from "@/libs/datadummy/api";
import {
  getEndpointsForProject,
  getProjectForApiName,
  getProjectHref,
  getProjectRouteSlug,
  getStoredProjects,
  PROJECT_APIS_CHANGED_EVENT,
  PROJECTS_CHANGED_EVENT,
  requestOpenCreateProjectModal,
} from "@/libs/projects/store";

// Types
import type { Project } from "@/types";

export interface NavigationProps {
  /** 현재 선택된 프로젝트 slug (경로용, 예: "e-commerce-mock"). 일치하는 항목을 활성 스타일로 표시 */
  activeProjectSlug?: string | null;
  currentApiName?: string | null;
  /** `/api/json` 편집 화면에서 쿼리의 apiName과 맞춰 응답 그룹(LNB) 표시 */
  jsonEditorApiName?: string | null;
  /** "+ New Project" 클릭 시 */
  onNewProject?: () => void;
}

function jsonEditorHref(apiName: string, item: ApiResponseItem, editorType: "default" | "test" | "error") {
  return `/api/json?state=edit&apiName=${encodeURIComponent(apiName)}&type=${editorType}&responseValue=${encodeURIComponent(item.value)}`;
}

function JsonEditorResponseNav({ apiName }: { apiName: string }) {
  const { localResponses, testResponses, errorResponses } = getApiResponseGroups(apiName);
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const currentResponseValue = searchParams?.get("responseValue") ?? "";
  const currentType = searchParams?.get("type") ?? "default";

  const renderGroup = (sectionTitle: string, items: ApiResponseItem[], editorType: "default" | "test" | "error") => (
    <div key={sectionTitle} className="mb-6 last:mb-0">
      <div className="typo-caption-1 text-label-assistant mb-3 px-1 font-medium tracking-wide">{sectionTitle}</div>
      <div className="flex flex-col gap-1.5">
        {items.map((item) => {
          const href = jsonEditorHref(apiName, item, editorType);
          const isActive = currentResponseValue === item.value && currentType === editorType;
          return (
            <a
              key={item.value}
              href={href}
              className={`typo-body-2-normal rounded-3 block px-4 py-3 no-underline transition-colors ${
                isActive ? "bg-[#13A4EC]/10 text-[#13A4EC]" : "text-label-common bg-white/5 hover:bg-white/10"
              }`}
            >
              <div className="truncate font-medium">{item.label}</div>
              {item.infoText ? <div className="typo-caption-1 text-label-assistant mt-1 truncate">{item.infoText}</div> : null}
            </a>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col">
      {renderGroup("로컬 응답", localResponses, "default")}
      {renderGroup("테스트 응답", testResponses, "test")}
      {renderGroup("에러 응답", errorResponses, "error")}
    </div>
  );
}

export default function Navigation({ activeProjectSlug = null, currentApiName = null, jsonEditorApiName = null }: NavigationProps) {
  const [isNavOpen, setIsNavOpen] = useState(true);
  const [navProjects, setNavProjects] = useState<Project[]>([]);
  /** 페이지 이동 없이 LNB 프로젝트 목록만 즐겨찾기로 좁힘 */
  const [favoritesOnlyInNav, setFavoritesOnlyInNav] = useState(false);
  const [apisTick, setApisTick] = useState(0);

  const navSearchInput = useInput();
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const isApiJsonPage = pathname === "/api/json";
  const isApiDetailRoute = pathname.startsWith("/api/") && !isApiJsonPage;
  const fallbackApiName = isApiDetailRoute ? decodeURIComponent(pathname.replace("/api/", "")) : null;
  const resolvedApiName = currentApiName ?? fallbackApiName;
  const currentApiProject = resolvedApiName ? getProjectForApiName(resolvedApiName) : null;
  const apiEndpointItems = useMemo(() => (currentApiProject ? getEndpointsForProject(currentApiProject.id) : []), [currentApiProject?.id, resolvedApiName, apisTick]);
  const filteredApiEndpointItems = useMemo(() => {
    if (!isApiDetailRoute) return apiEndpointItems;
    const q = navSearchInput.value.trim().toLowerCase();
    if (!q) return apiEndpointItems;
    return apiEndpointItems.filter((e) => {
      const name = (e.name ?? "").toLowerCase();
      const tran = (e.tran ?? "").toLowerCase();
      const description = (e.description ?? "").toLowerCase();
      return name.includes(q) || tran.includes(q) || description.includes(q);
    });
  }, [apiEndpointItems, isApiDetailRoute, navSearchInput.value]);

  const showProjectListInNav = !isApiJsonPage && !isApiDetailRoute;
  const hasFavoriteProjects = navProjects.some((p) => p.isFavorite);
  const projectsForNav = showProjectListInNav && favoritesOnlyInNav ? (hasFavoriteProjects ? navProjects.filter((p) => p.isFavorite) : []) : navProjects;

  useEffect(() => {
    const load = () => setNavProjects(getStoredProjects());
    load();
    window.addEventListener(PROJECTS_CHANGED_EVENT, load);
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, load);
  }, []);

  useEffect(() => {
    const bump = () => setApisTick((t) => t + 1);
    window.addEventListener(PROJECT_APIS_CHANGED_EVENT, bump);
    return () => window.removeEventListener(PROJECT_APIS_CHANGED_EVENT, bump);
  }, []);

  return (
    <div
      className={`flex h-full max-h-full min-h-0 shrink-0 flex-col self-stretch overflow-hidden border-r bg-[#2D2D2D] transition-[width,padding] duration-200 ease-in-out ${
        isNavOpen ? "w-[320px] p-7" : "w-14 overflow-hidden px-3 py-7"
      }`}
    >
      {/* 상단: 즐겨찾기·홈 · 토글 */}
      <div className={`shrink-0 ${isNavOpen ? "flex items-center justify-between gap-2" : "flex flex-col items-center gap-6"}`}>
        {isNavOpen ? (
          <div className="flex items-center gap-3">
            <a href="/" className="text-label-assistant hover:text-label-common rounded-md p-2 transition-colors hover:bg-white/10" aria-label="홈">
              <NavigationTopHomeIcon className="h-[18px] w-[18px] shrink-0" />
            </a>
            {showProjectListInNav ? (
              <button
                type="button"
                aria-label="즐겨찾기 프로젝트만 보기"
                aria-pressed={favoritesOnlyInNav}
                onClick={() => setFavoritesOnlyInNav((v) => !v)}
                className={`rounded-md p-2 transition-colors hover:bg-white/10 ${favoritesOnlyInNav ? "" : "text-label-assistant hover:text-label-common"}`}
              >
                {favoritesOnlyInNav ? <FillStarIcon className="h-[22px] w-[22px] shrink-0" /> : <StarIcon className="h-[22px] w-[22px] shrink-0" />}
              </button>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setIsNavOpen((open) => !open)}
          className="text-label-common cursor-pointer rounded-md p-1.5 transition-colors hover:bg-white/10"
          aria-expanded={isNavOpen}
          aria-label={isNavOpen ? "네비게이션 접기" : "네비게이션 펼치기"}
        >
          <ToggleNaviIcon className="h-[18px] w-[18px] shrink-0" />
        </button>
        {!isNavOpen ? (
          <div className="flex flex-col items-center gap-6">
            <a href="/" className="text-label-assistant hover:text-label-common rounded-md p-1.5 transition-colors hover:bg-white/10" aria-label="홈">
              <NavigationTopHomeIcon className="h-[18px] w-[18px] shrink-0" />
            </a>
            {showProjectListInNav ? (
              <button
                type="button"
                aria-label="즐겨찾기 프로젝트만 보기"
                aria-pressed={favoritesOnlyInNav}
                onClick={() => setFavoritesOnlyInNav((v) => !v)}
                className={`rounded-md p-1.5 transition-colors hover:bg-white/10 ${favoritesOnlyInNav ? "" : "text-label-assistant hover:text-label-common"}`}
              >
                {favoritesOnlyInNav ? <FillStarIcon className="h-[22px] w-[22px] shrink-0" /> : <StarIcon className="h-[22px] w-[22px] shrink-0" />}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {!isNavOpen ? <div className="min-h-0 flex-1" aria-hidden /> : null}

      {isNavOpen && (
        <div className="mt-5 flex min-h-0 flex-1 flex-col gap-5">
          <div className="shrink-0">
            <Input
              value={navSearchInput.value}
              onChange={navSearchInput.onChange}
              error={navSearchInput.error}
              width="100%"
              placeholder={isApiDetailRoute ? "API 이름, 트랜, 설명 검색" : "검색"}
            />
          </div>

          {/* 프로젝트 목록 — 뷰포트(최대 1080px) 높이 초과 시 이 영역만 스크롤 */}
          <div className="ds-scrollbar-dark flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">
            {isApiJsonPage && jsonEditorApiName ? (
              <JsonEditorResponseNav apiName={jsonEditorApiName} />
            ) : isApiDetailRoute && resolvedApiName ? (
              <div className="flex flex-col gap-2">
                {apiEndpointItems.length > 0 && filteredApiEndpointItems.length === 0 ? (
                  <p className="typo-body-2-normal text-label-assistant px-5 py-4 text-center">검색과 일치하는 API가 없습니다.</p>
                ) : (
                  filteredApiEndpointItems.map((item) => {
                    const isItemActive = item.name === resolvedApiName;
                    const callFn = item.tran?.trim() || "—";
                    const apiTitle = item.name || "—";
                    const lineClass = `${isItemActive ? "text-[#13A4EC]" : "text-label-assistant"}`;
                    return (
                      <a
                        key={item.id}
                        href={`/api/${encodeURIComponent(item.name)}`}
                        title={`${callFn} · ${apiTitle}${item.description ? ` — ${item.description}` : ""}`}
                        className={`rounded-3 block min-w-0 px-5 py-4 no-underline transition-colors ${
                          isItemActive ? "bg-[#13A4EC]/10" : "text-label-common bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <div className={`flex min-w-0 items-center justify-between`}>
                          <span className={`typo-body-1-normal shrink truncate font-bold ${isItemActive ? "text-[#13A4EC]" : "text-label-common"}`}>{apiTitle}</span>
                          <span className="typo-caption-1 text-label-common truncate font-bold">{callFn}</span>
                        </div>
                        <div className={`${lineClass} text-label-common typo-caption-1 mt-3 truncate font-bold`}>{item.description || "—"}</div>
                      </a>
                    );
                  })
                )}
              </div>
            ) : (
              projectsForNav.map((project) => {
                const routeSlug = getProjectRouteSlug(project);
                const activeNorm =
                  activeProjectSlug == null
                    ? null
                    : (() => {
                        try {
                          return decodeURIComponent(activeProjectSlug);
                        } catch {
                          return activeProjectSlug;
                        }
                      })();
                const isActive = activeNorm != null && (activeNorm === routeSlug || activeProjectSlug === routeSlug);
                return (
                  <a
                    key={project.id}
                    href={getProjectHref(project)}
                    className={`typo-body-1-normal flex items-center gap-3 px-5 py-4 font-medium no-underline transition-colors ${
                      isActive ? "bg-[#13A4EC]/10 text-[#13A4EC]" : "text-label-common hover:bg-blue-100/10"
                    }`}
                  >
                    <span className="shrink-0">{project.isFavorite ? <FillStarIcon className="h-6 w-6" /> : <StarIcon className="text-label-assistant h-6 w-6" />}</span>
                    <span className="min-w-0 truncate">{project.name}</span>
                  </a>
                );
              })
            )}
          </div>

          {!isApiDetailRoute && !isApiJsonPage && (
            <div className="shrink-0">
              <Btn category="primary" size="medium" startIcon={<PlusIcon />} onClick={() => requestOpenCreateProjectModal({ anchorMain: true })} width="100%">
                프로젝트 생성하기
              </Btn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

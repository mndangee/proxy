"use client";

// React
import { useCallback, useEffect, useState } from "react";

// Assets
import HistoryIcon from "@/assets/svg/HistoryIcon";

// Components
import MethodTag from "@/components/common/MethodTag";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

// Libs
import {
  formatProjectUpdatedLabel,
  getRecentModifiedApis,
  PROJECT_APIS_CHANGED_EVENT,
  PROJECT_API_RESPONSES_CHANGED_EVENT,
  PROJECTS_CHANGED_EVENT,
  type RecentModifiedApiItem,
} from "@/libs/projects/store";

const DEFAULT_LIMIT = 8;

function coerceHttpMethod(m: string): HttpMethod {
  const u = m.trim().toUpperCase();
  if (u === "GET" || u === "POST" || u === "PUT" || u === "DELETE" || u === "PATCH") return u;
  return "GET";
}

function HistoryRow({ item }: { item: RecentModifiedApiItem }) {
  const href = `/api/${encodeURIComponent(item.apiName)}`;
  const apiSubtitle = item.description.trim() || item.projectName;

  return (
    <button
      type="button"
      className="flex w-full cursor-pointer items-center justify-between border-b-1 border-gray-200 px-8 py-5 text-left transition-colors last:border-b-0"
      onClick={() => {
        window.location.href = href;
      }}
    >
      <div className="min-w-0 pr-4">
        <div className="typo-body-1-normal truncate font-bold">
          <span>{item.apiName}</span>
          {apiSubtitle ? <span className="text-label-assistant font-normal"> — {apiSubtitle}</span> : null}
        </div>
        <div className="typo-body-2-normal text-label-assistant truncate">{item.tran || "—"}</div>
      </div>
      <div className="flex shrink-0 items-center gap-14">
        <MethodTag method={coerceHttpMethod(item.method)} />
        <div className="typo-body-2-normal text-label-assistant w-24 text-right tabular-nums">{formatProjectUpdatedLabel(item.lastActivityAt)}</div>
      </div>
    </button>
  );
}

export interface HistoryListProps {
  /** 최대 행 수 (기본 8) */
  limit?: number;
}

export default function HistoryList({ limit = DEFAULT_LIMIT }: HistoryListProps) {
  const [items, setItems] = useState<RecentModifiedApiItem[]>([]);

  const refresh = useCallback(() => {
    setItems(getRecentModifiedApis(limit));
  }, [limit]);

  useEffect(() => {
    refresh();
    const bump = () => refresh();
    window.addEventListener(PROJECTS_CHANGED_EVENT, bump);
    window.addEventListener(PROJECT_APIS_CHANGED_EVENT, bump);
    window.addEventListener(PROJECT_API_RESPONSES_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener(PROJECTS_CHANGED_EVENT, bump);
      window.removeEventListener(PROJECT_APIS_CHANGED_EVENT, bump);
      window.removeEventListener(PROJECT_API_RESPONSES_CHANGED_EVENT, bump);
    };
  }, [refresh]);

  return (
    <div className="bg-background-white rounded-5 mt-9 w-full max-w-[1600px] items-center overflow-hidden border-1 border-gray-200">
      <div className="typo-title-3 bg-gray-50 px-8 py-6 font-bold">최근 수정한 API</div>
      {items.length > 0 ? (
        items.map((item) => <HistoryRow key={`${item.projectId}-${item.apiName}`} item={item} />)
      ) : (
        <div className="flex flex-col items-center py-14 text-center">
          <HistoryIcon />
          <div className="typo-body-1-normal mt-5 text-gray-500">아직 수정 이력이 있는 API가 없습니다.</div>
        </div>
      )}
    </div>
  );
}

"use client";

// React
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";

// Assets
import EditIcon from "@/assets/svg/EditIcon";
import DeleteIcon from "@/assets/svg/DeleteIcon";
import ExpandArrowIcon from "@/assets/svg/ExpandArrowIcon";

// Components
import type { checkBoxObjectType } from "@/components/common/CheckBox";
import MethodTag from "@/components/common/MethodTag";
import { ConfirmModal, NoticeModal } from "@/components/common/modals";
import Table from "@/components/shared/Table";

// Libs
import { navigateApp } from "@/libs/app-navigation";
import { slugify } from "@/libs/datadummy/home";
import {
  buildApiEndpointsExportBundle,
  deleteProjectApiEndpoint,
  formatAddApiUserError,
  formatApiEndpointTableDate,
  getAppProxyConfig,
  getSavedApiResponsesForProjectApi,
  persistMockActiveApiResponse,
  PROJECT_API_RESPONSES_CHANGED_EVENT,
  sortApiEndpointsByCreatedAt,
  sortApiEndpointsByModifiedAt,
} from "@/libs/projects/store";
import type { SavedApiResponseRow } from "@/libs/projects/store";
import type { MockActiveApiResponseRef } from "@/types";

// Types
import type { ApiEndpoint } from "@/types";
import type { Project } from "@/types";
import type { TableHeaderType } from "@/types/commonType";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

const apiHeaderRowClass = "typo-body-2-normal border-border-enabled bg-gray-50 text-label-normal flex min-h-12 items-center rounded-t-4 border-b font-semibold";

const apiBodyRowClass = "items-center typo-body-2-normal border-b border-gray-100 text-label-normal flex min-h-14 max-h-none border-t-0 py-3 last:rounded-b-4 last:border-b-0";

function safeExportFileBase(project: Project): string {
  const raw = project.folderName?.trim() || slugify(project.name) || "project";
  return raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 80) || "project";
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  downloadBlob(filename, blob);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeExportApiFileName(name: string): string {
  const t = name.trim() || "api";
  return t.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 160) || "api";
}

export type ApiEndpointsTableHandle = {
  /** Checked rows only — JSON bundle download */
  exportSelected: () => void;
};

interface ApiEndpointsTableProps {
  endpoints: ApiEndpoint[];
  project: Project;
  onListChange?: () => void;
  onEdit: (row: ApiEndpoint) => void;
}

function buildHeader(params: {
  onEdit: (row: ApiEndpoint) => void;
  requestDelete: (row: ApiEndpoint) => void;
  onModifiedSortClick: () => void;
  sortField: "created" | "modified";
  modifiedOrder: "asc" | "desc";
  getResponses: (apiName: string) => SavedApiResponseRow[];
  expandedApiId: string | null;
  toggleExpanded: (apiId: string) => void;
}): TableHeaderType[] {
  const { onEdit, requestDelete, onModifiedSortClick, sortField, modifiedOrder, getResponses, expandedApiId, toggleExpanded } = params;

  return [
    {
      value: "method",
      name: "메서드",
      width: "8%",
      textAlign: "center",
      cellClassName: "flex items-center justify-center",
      render: (row) => <MethodTag method={row.method as HttpMethod} className="inline-flex min-w-0" />,
    },
    {
      value: "name",
      name: "API 이름",
      width: "16%",
      textAlign: "left",
      cellClassName: "min-w-0 overflow-hidden",
      render: (row) => (
        <a
          href={`/api/${encodeURIComponent(row.name || "")}`}
          className="typo-body-2-normal hover:text-label-normal block max-w-full min-w-0 cursor-pointer truncate hover:underline"
          title={row.name || undefined}
        >
          {row.name || "—"}
        </a>
      ),
    },
    {
      value: "tran",
      name: "트랜 이름",
      width: "18%",
      textAlign: "left",
      cellClassName: "min-w-0 overflow-hidden",
      render: (row) => (
        <span className="typo-body-2-normal block max-w-full min-w-0 truncate font-medium" title={row.tran?.trim() || undefined}>
          {row.tran?.trim() ? row.tran : "—"}
        </span>
      ),
    },
    {
      value: "responses",
      name: "응답",
      width: "24%",
      textAlign: "left",
      cellClassName: "min-w-0",
      render: (row) => {
        const responses = getResponses(row.name || "");
        const counts = responses.reduce(
          (acc, response) => {
            acc[response.editorType] += 1;
            if (response.queryParams && Object.keys(response.queryParams).length > 0) acc.conditional += 1;
            return acc;
          },
          { default: 0, test: 0, error: 0, conditional: 0 },
        );
        if (responses.length === 0) return <span className="typo-caption-1 text-label-assistant">응답 없음</span>;
        return (
          <button
            type="button"
            onClick={() => toggleExpanded(row.id)}
            className="flex min-w-0 cursor-pointer flex-wrap items-center gap-1 rounded-3 text-left hover:bg-gray-50"
            title={`전체 응답 ${responses.length}개 · ${expandedApiId === row.id ? "접기" : "펼치기"}`}
            aria-expanded={expandedApiId === row.id}
          >
            {counts.default > 0 ? <span className="typo-body-2-normal font-semibold text-gray-700">Default {counts.default}</span> : null}
            {counts.default > 0 && (counts.test > 0 || counts.error > 0 || counts.conditional > 0) ? <span className="typo-body-2-normal text-gray-300">·</span> : null}
            {counts.test > 0 ? <span className="typo-body-2-normal font-semibold text-blue-700">Test {counts.test}</span> : null}
            {counts.test > 0 && (counts.error > 0 || counts.conditional > 0) ? <span className="typo-body-2-normal text-gray-300">·</span> : null}
            {counts.error > 0 ? <span className="typo-body-2-normal font-semibold text-red-700">Error {counts.error}</span> : null}
            {counts.error > 0 && counts.conditional > 0 ? <span className="typo-body-2-normal text-gray-300">·</span> : null}
            {counts.conditional > 0 ? <span className="typo-body-2-normal font-semibold text-violet-700">조건 {counts.conditional}</span> : null}
            <ExpandArrowIcon className={`text-label-assistant ml-1 h-[7px] w-3 transition-transform ${expandedApiId === row.id ? "rotate-180" : ""}`} />
          </button>
        );
      },
    },
    {
      value: "description",
      name: "설명",
      width: "14%",
      textAlign: "left",
      cellClassName: "min-w-0 overflow-hidden",
      render: (row) => (
        <span className="typo-body-2-normal block max-w-full min-w-0 truncate" title={row.description || undefined}>
          {row.description || "—"}
        </span>
      ),
    },
    {
      value: "lastModified",
      name: (
        <button
          type="button"
          onClick={onModifiedSortClick}
          className="typo-body-2-normal text-label-normal -mx-1 flex cursor-pointer items-center gap-1 rounded px-1 text-left font-semibold hover:underline"
        >
          <span>마지막 변경일</span>
          {sortField === "modified" ? (
            <span className="text-label-assistant font-normal" aria-hidden>
              {modifiedOrder === "asc" ? "↑" : "↓"}
            </span>
          ) : null}
        </button>
      ),
      width: "12%",
      textAlign: "left",
      render: (row) => <span className="whitespace-nowrap">{formatApiEndpointTableDate(row.updatedAt ?? row.lastModified)}</span>,
    },
    {
      value: "actions",
      name: "작업",
      width: "8%",
      textAlign: "left",
      cellClassName: "flex items-center",
      render: (row) => (
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            className="hover:text-label-neutral h-7 w-7 cursor-pointer rounded p-1.5 text-[#94A3B8] transition-colors"
            aria-label="수정"
            onClick={() => onEdit(row)}
          >
            <EditIcon />
          </button>
          <button
            type="button"
            className="hover:text-label-neutral h-7 w-7 cursor-pointer rounded p-1.5 text-[#94A3B8] transition-colors"
            aria-label="삭제"
            onClick={() => requestDelete(row)}
          >
            <DeleteIcon />
          </button>
        </div>
      ),
    },
  ];
}

const ApiEndpointsTable = forwardRef<ApiEndpointsTableHandle, ApiEndpointsTableProps>(function ApiEndpointsTable({ endpoints, project, onListChange, onEdit }, ref) {
  const [deleteTarget, setDeleteTarget] = useState<ApiEndpoint | null>(null);
  const [deleteErrorOpen, setDeleteErrorOpen] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");
  const [sortField, setSortField] = useState<"created" | "modified">("created");
  const [createdSort, setCreatedSort] = useState<"asc" | "desc">("asc");
  const [modifiedSort, setModifiedSort] = useState<"asc" | "desc">("desc");
  const [checkState, setCheckState] = useState<checkBoxObjectType>({});
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");
  const [responsesTick, setResponsesTick] = useState(0);
  const [expandedApiId, setExpandedApiId] = useState<string | null>(null);
  const [activeResponses, setActiveResponses] = useState<Record<string, MockActiveApiResponseRef>>({});
  const [applyingResponseValue, setApplyingResponseValue] = useState<string | null>(null);

  const sortedEndpoints = useMemo(() => {
    if (sortField === "created") return sortApiEndpointsByCreatedAt(endpoints, createdSort);
    return sortApiEndpointsByModifiedAt(endpoints, modifiedSort);
  }, [endpoints, sortField, createdSort, modifiedSort]);

  const onModifiedHeaderClick = useCallback(() => {
    if (sortField === "modified") {
      setModifiedSort((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setModifiedSort("desc");
    }
    setSortField("modified");
  }, [sortField]);
  const sortedIdsKey = useMemo(() => sortedEndpoints.map((e) => e.id).join(","), [sortedEndpoints]);

  useEffect(() => {
    setCheckState((prev) => {
      const next: checkBoxObjectType = {};
      for (const e of sortedEndpoints) {
        next[e.id] = prev[e.id] ?? false;
      }
      return next;
    });
  }, [sortedIdsKey]);

  useEffect(() => {
    const onResponsesChanged = () => setResponsesTick((tick) => tick + 1);
    window.addEventListener(PROJECT_API_RESPONSES_CHANGED_EVENT, onResponsesChanged);
    return () => window.removeEventListener(PROJECT_API_RESPONSES_CHANGED_EVENT, onResponsesChanged);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getAppProxyConfig().then((config) => {
      if (!cancelled) setActiveResponses(config.mockActiveApiResponses ?? {});
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const showNotice = useCallback((message: string) => {
    setNoticeMessage(message);
    setNoticeOpen(true);
  }, []);

  const onExportSelected = useCallback(() => {
    void (async () => {
      const selected = sortedEndpoints.filter((e) => checkState[e.id]);
      if (selected.length === 0) {
        showNotice("추출할 API를 테이블에서 선택해 주세요.");
        return;
      }
      if (selected.length === 1) {
        const bundle = buildApiEndpointsExportBundle(project, selected);
        downloadJson(`${safeExportApiFileName(selected[0].name)}-export.json`, bundle);
        return;
      }
      try {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        const used = new Set<string>();
        for (const e of selected) {
          const one = buildApiEndpointsExportBundle(project, [e]);
          const base = safeExportApiFileName(e.name);
          let fname = `${base}.json`;
          let n = 1;
          while (used.has(fname)) {
            fname = `${base}-${n}.json`;
            n += 1;
          }
          used.add(fname);
          zip.file(fname, JSON.stringify(one, null, 2));
        }
        const blob = await zip.generateAsync({ type: "blob" });
        downloadBlob(`${safeExportFileBase(project)}-apis-export.zip`, blob);
      } catch {
        showNotice("ZIP 파일을 만드는 중 오류가 발생했습니다.");
      }
    })();
  }, [sortedEndpoints, checkState, project, showNotice]);

  useImperativeHandle(ref, () => ({ exportSelected: onExportSelected }), [onExportSelected]);

  const header = useMemo(
    () =>
      buildHeader({
        onEdit,
        requestDelete: (row) => setDeleteTarget(row),
        onModifiedSortClick: onModifiedHeaderClick,
        sortField,
        modifiedOrder: modifiedSort,
        getResponses: (apiName) => getSavedApiResponsesForProjectApi(project.id, apiName),
        expandedApiId,
        toggleExpanded: (apiId) => setExpandedApiId((current) => current === apiId ? null : apiId),
      }),
    [onEdit, onModifiedHeaderClick, sortField, modifiedSort, project.id, responsesTick, expandedApiId],
  );

  const renderExpandedResponses = useCallback((endpoint: ApiEndpoint) => {
    if (expandedApiId !== endpoint.id) return null;
    const responses = getSavedApiResponsesForProjectApi(project.id, endpoint.name);
    const conditionMeta = responses.map((response, index) => {
      const entries = Object.entries(response.queryParams ?? {}).sort(([a], [b]) => a.localeCompare(b));
      return {
        response,
        index,
        conditionCount: entries.length,
        signature: entries.map(([key, value]) => `${key}=${value}`).join("&"),
      };
    });
    const rankedConditions = conditionMeta
      .filter((item) => item.conditionCount > 0)
      .sort((a, b) => b.conditionCount - a.conditionCount || a.index - b.index);
    const priorityByValue = new Map(rankedConditions.map((item, index) => [item.response.value, index + 1]));
    const duplicateConditionCounts = rankedConditions.reduce((counts, item) => {
      counts.set(item.signature, (counts.get(item.signature) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
    return (
      <div className="bg-gray-50 px-6 py-4 pl-[68px]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="typo-body-2-normal text-label-normal font-semibold">{endpoint.tran || endpoint.name} 응답 {responses.length}개</p>
            {rankedConditions.length > 0 ? <p className="typo-caption-1 text-label-assistant mt-1">쿼리 조건이 많은 응답부터 자동으로 선택됩니다.</p> : null}
          </div>
          <button type="button" className="typo-caption-1 text-label-primary cursor-pointer hover:underline" onClick={() => navigateApp(`/api/${encodeURIComponent(endpoint.name)}`)}>
            API 상세 보기
          </button>
        </div>
        <div className="space-y-2">
          {responses.map((response) => {
            const active = activeResponses[endpoint.name] ?? activeResponses[endpoint.tran];
            const isActive = active?.responseValue === response.value;
            const queryText = Object.entries(response.queryParams ?? {}).map(([key, value]) => `${key}=${value}`).join(" · ");
            const conditionCount = Object.keys(response.queryParams ?? {}).length;
            const signature = Object.entries(response.queryParams ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("&");
            const isDuplicateCondition = conditionCount > 0 && (duplicateConditionCounts.get(signature) ?? 0) > 1;
            const conditionPriority = priorityByValue.get(response.value);
            return (
              <div key={response.value} className={`rounded-3 flex flex-wrap items-center gap-3 border px-4 py-3 ${isActive ? "border-emerald-300 bg-emerald-50" : "border-border-enabled bg-background-white"}`}>
                <span
                  className={`typo-caption-1 rounded-8 inline-flex min-w-[80px] justify-center px-4 py-2 text-center font-bold ${
                    response.editorType === "error"
                      ? "bg-red-100 text-red-800"
                      : response.editorType === "test"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {response.editorType === "default" ? "Default" : response.editorType === "test" ? "Test" : "Error"}
                </span>
                <div className="min-w-[180px] flex-1">
                  <p className="typo-body-2-normal text-label-normal font-medium">{response.label || "이름 없는 응답"}</p>
                  {response.description ? <p className="typo-caption-1 text-label-assistant mt-0.5">{response.description}</p> : null}
                  {queryText ? (
                    <p className="typo-caption-1 mt-1 text-violet-700">
                      조건: {queryText} · 조건 {conditionCount}개 · 우선순위 {conditionPriority}
                    </p>
                  ) : null}
                  {isDuplicateCondition ? <p className="typo-caption-1 mt-1 font-medium text-amber-700">동일한 조건이 있습니다. 목록에서 위 응답이 우선됩니다.</p> : null}
                </div>
                {isActive ? <span className="typo-caption-1 font-semibold text-emerald-700">사용 중</span> : (
                  <button
                    type="button"
                    disabled={applyingResponseValue === response.value}
                    className="typo-caption-1 border-border-primary text-label-primary rounded-3 cursor-pointer border px-3 py-2 disabled:cursor-wait disabled:opacity-50"
                    onClick={() => {
                      void (async () => {
                        setApplyingResponseValue(response.value);
                        await persistMockActiveApiResponse(endpoint.name, { responseValue: response.value, editorType: response.editorType }, { alsoKeys: endpoint.tran && endpoint.tran !== endpoint.name ? [endpoint.tran] : [] });
                        const next = { responseValue: response.value, editorType: response.editorType };
                        setActiveResponses((current) => ({ ...current, [endpoint.name]: next, ...(endpoint.tran ? { [endpoint.tran]: next } : {}) }));
                        setApplyingResponseValue(null);
                      })();
                    }}
                  >
                    {applyingResponseValue === response.value ? "적용 중" : "응답으로 사용"}
                  </button>
                )}
                <button type="button" className="typo-caption-1 text-label-assistant cursor-pointer hover:underline" onClick={() => navigateApp(`/api/json?state=edit&apiName=${encodeURIComponent(endpoint.name)}&type=${response.editorType}&responseValue=${encodeURIComponent(response.value)}`)}>
                  상세 보기
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [activeResponses, applyingResponseValue, expandedApiId, project.id]);

  return (
    <>
      <ConfirmModal
        isOpen={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        title="API 삭제"
        message="이 API를 삭제하면 데이터를 다시 복구할 수 없습니다. 삭제할까요?"
        cancelLabel="취소"
        confirmLabel="삭제"
        onConfirm={async () => {
          if (!deleteTarget) return;
          const row = deleteTarget;
          const res = await deleteProjectApiEndpoint(project.id, row.id);
          if (!res.ok) {
            setDeleteTarget(null);
            setDeleteErrorMessage(formatAddApiUserError(res.error));
            setDeleteErrorOpen(true);
            return;
          }
          setDeleteTarget(null);
          onListChange?.();
        }}
      />
      <NoticeModal isOpen={deleteErrorOpen} onClose={() => setDeleteErrorOpen(false)} message={deleteErrorMessage} />
      <NoticeModal isOpen={noticeOpen} onClose={() => setNoticeOpen(false)} message={noticeMessage} />

      <div className="w-full min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="typo-body-2-normal text-label-normal flex flex-wrap items-center gap-2">
            <span className="text-label-assistant shrink-0">생성일 기준</span>
            <select
              value={createdSort}
              onChange={(e) => {
                setSortField("created");
                setCreatedSort(e.target.value === "desc" ? "desc" : "asc");
              }}
              className="typo-body-2-normal border-border-enabled text-label-normal rounded-3 bg-background-white border px-3 py-2 outline-none focus:border-gray-400"
            >
              <option value="asc">오래된 순</option>
              <option value="desc">최근 생성 순</option>
            </select>
          </label>
        </div>

        <div className="rounded-4 border-border-enabled bg-background-white ds-scrollbar-none max-h-[min(65vh,720px)] overflow-auto overscroll-y-contain border">
          <Table
            className="w-full min-w-[980px]"
            header={header}
            data={sortedEndpoints}
            hasCheckBox
            getCheckBoxRowValue={(row) => row.id}
            checkBoxStateList={checkState}
            setCheckBoxStateList={setCheckState}
            headerRowClassName={apiHeaderRowClass}
            bodyRowClassName={apiBodyRowClass}
            stickyHeader
            renderExpandedRow={renderExpandedResponses}
          />
        </div>
      </div>
    </>
  );
});

export default ApiEndpointsTable;

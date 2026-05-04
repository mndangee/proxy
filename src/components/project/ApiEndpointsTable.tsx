"use client";

// React
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";

// Assets
import EditIcon from "@/assets/svg/EditIcon";
import DeleteIcon from "@/assets/svg/DeleteIcon";

// Components
import type { checkBoxObjectType } from "@/components/common/CheckBox";
import MethodTag from "@/components/common/MethodTag";
import { ConfirmModal, NoticeModal } from "@/components/common/modals";
import Table from "@/components/shared/Table";

// Libs
import { slugify } from "@/libs/datadummy/home";
import {
  buildApiEndpointsExportBundle,
  deleteProjectApiEndpoint,
  formatAddApiUserError,
  formatApiEndpointTableDate,
  sortApiEndpointsByCreatedAt,
  sortApiEndpointsByModifiedAt,
} from "@/libs/projects/store";

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
}): TableHeaderType[] {
  const { onEdit, requestDelete, onModifiedSortClick, sortField, modifiedOrder } = params;

  return [
    {
      value: "method",
      name: "메서드",
      width: "10%",
      textAlign: "center",
      cellClassName: "flex items-center justify-center",
      render: (row) => <MethodTag method={row.method as HttpMethod} className="inline-flex min-w-0" />,
    },
    {
      value: "name",
      name: "API 이름",
      width: "20%",
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
      width: "25%",
      textAlign: "left",
      cellClassName: "min-w-0 overflow-hidden",
      render: (row) => (
        <span className="typo-body-2-normal block max-w-full min-w-0 truncate font-medium" title={row.tran?.trim() || undefined}>
          {row.tran?.trim() ? row.tran : "—"}
        </span>
      ),
    },
    {
      value: "description",
      name: "설명",
      width: "25%",
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
      width: "20%",
      textAlign: "left",
      render: (row) => <span className="whitespace-nowrap">{formatApiEndpointTableDate(row.updatedAt ?? row.lastModified)}</span>,
    },
    {
      value: "actions",
      name: "작업",
      width: "10%",
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
      }),
    [onEdit, onModifiedHeaderClick, sortField, modifiedSort],
  );

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
            className="w-full min-w-[720px]"
            header={header}
            data={sortedEndpoints}
            hasCheckBox
            getCheckBoxRowValue={(row) => row.id}
            checkBoxStateList={checkState}
            setCheckBoxStateList={setCheckState}
            headerRowClassName={apiHeaderRowClass}
            bodyRowClassName={apiBodyRowClass}
            stickyHeader
          />
        </div>
      </div>
    </>
  );
});

export default ApiEndpointsTable;

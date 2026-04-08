"use client";

// React
import { useMemo, useState } from "react";

// Assets
import EditIcon from "@/assets/svg/EditIcon";
import DeleteIcon from "@/assets/svg/DeleteIcon";

// Components
import MethodTag from "@/components/common/MethodTag";
import { ConfirmModal, NoticeModal } from "@/components/common/modals";
import Table from "@/components/shared/Table";

// Libs
import { deleteProjectApiEndpoint, formatAddApiUserError, formatApiEndpointTableDate } from "@/libs/projects/store";

// Types
import type { ApiEndpoint } from "@/types";
import type { Project } from "@/types";
import type { TableHeaderType } from "@/types/commonType";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

const apiHeaderRowClass = "typo-body-2-normal border-border-enabled bg-gray-50 text-label-normal flex min-h-12 items-center border-b font-semibold";

const apiBodyRowClass = "items-center typo-body-2-normal border-b border-gray-100 text-label-normal flex min-h-14 max-h-none border-t-0 py-3 last:border-b-0";

interface ApiEndpointsTableProps {
  endpoints: ApiEndpoint[];
  project: Project;
  onListChange?: () => void;
  onEdit: (row: ApiEndpoint) => void;
}

function buildHeader(params: { onEdit: (row: ApiEndpoint) => void; requestDelete: (row: ApiEndpoint) => void }): TableHeaderType[] {
  const { onEdit, requestDelete } = params;

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
          className="typo-body-2-normal hover:text-label-normal block min-w-0 max-w-full cursor-pointer truncate hover:underline"
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
        <span className="typo-body-2-normal block min-w-0 max-w-full truncate font-medium" title={row.tran?.trim() || undefined}>
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
        <span className="typo-body-2-normal block min-w-0 max-w-full truncate" title={row.description || undefined}>
          {row.description || "—"}
        </span>
      ),
    },
    {
      value: "lastModified",
      name: "마지막 변경일",
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

export default function ApiEndpointsTable({ endpoints, project, onListChange, onEdit }: ApiEndpointsTableProps) {
  const [deleteTarget, setDeleteTarget] = useState<ApiEndpoint | null>(null);
  const [deleteErrorOpen, setDeleteErrorOpen] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");

  const header = useMemo(
    () =>
      buildHeader({
        onEdit,
        requestDelete: (row) => setDeleteTarget(row),
      }),
    [onEdit],
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

      <div className="rounded-4 border-border-enabled bg-background-white overflow-hidden border">
        <div className="overflow-x-auto">
          <Table className="w-full min-w-[720px]" header={header} data={endpoints} headerRowClassName={apiHeaderRowClass} bodyRowClassName={apiBodyRowClass} />
        </div>
      </div>
    </>
  );
}

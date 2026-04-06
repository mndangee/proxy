// Assets
import EditIcon from "@/assets/svg/EditIcon";
import DeleteIcon from "@/assets/svg/DeleteIcon";

// Components
import MethodTag from "@/components/common/MethodTag";
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

function buildHeader(params: { project: Project; onEdit: (row: ApiEndpoint) => void; onListChange?: () => void }): TableHeaderType[] {
  const { project, onEdit, onListChange } = params;

  const onDelete = async (row: ApiEndpoint) => {
    if (!window.confirm("이 API를 삭제하면 데이터를 다시 복구할 수 없습니다. 삭제할까요?")) return;
    const res = await deleteProjectApiEndpoint(project.id, row.id);
    if (!res.ok) {
      window.alert(formatAddApiUserError(res.error));
      return;
    }
    onListChange?.();
  };

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
      render: (row) => (
        <a href={`/api/${encodeURIComponent(row.name || "")}`} className="typo-body-2-normal hover:text-label-normal cursor-pointer hover:underline">
          {row.name || "—"}
        </a>
      ),
    },
    {
      value: "path",
      name: "엔드포인트 경로",
      width: "25%",
      textAlign: "left",
      render: (row) => <span className="typo-body-2-normal block font-medium">{row.path?.trim() ? row.path : "—"}</span>,
    },
    {
      value: "description",
      name: "설명",
      width: "25%",
      textAlign: "left",
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
            onClick={() => void onDelete(row)}
          >
            <DeleteIcon />
          </button>
        </div>
      ),
    },
  ];
}

export default function ApiEndpointsTable({ endpoints, project, onListChange, onEdit }: ApiEndpointsTableProps) {
  const header = buildHeader({ project, onEdit, onListChange });

  return (
    <div className="rounded-4 border-border-enabled bg-background-white overflow-hidden border">
      <div className="overflow-x-auto">
        <Table className="w-full min-w-[720px]" header={header} data={endpoints} headerRowClassName={apiHeaderRowClass} bodyRowClassName={apiBodyRowClass} />
      </div>
    </div>
  );
}

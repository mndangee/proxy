// Assets
import EditIcon from "@/assets/svg/EditIcon";
import DeleteIcon from "@/assets/svg/DeleteIcon";

// Components
import MethodTag from "@/components/common/MethodTag";
import Table from "@/components/shared/Table";

// Types
import type { ApiEndpoint } from "@/types";
import type { TableHeaderType } from "@/types/commonType";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

function formatLastModified(value: string): string {
  const parts = value.trim().split(/\s+/);
  if (parts.length >= 3) {
    const datePart = parts.slice(0, 3).join(" ");
    const timePart = parts.slice(3).join(" ");
    return timePart ? `${datePart} · ${timePart}` : value;
  }
  return value;
}

const apiHeaderRowClass = "typo-body-2-normal border-border-enabled bg-gray-50 text-label-normal flex min-h-12 items-center border-b font-semibold";

const apiBodyRowClass = "items-center typo-body-2-normal border-b border-gray-100 text-label-normal flex min-h-14 max-h-none border-t-0 py-3 last:border-b-0";

interface ApiEndpointsTableProps {
  endpoints: ApiEndpoint[];
  // projectSlug는 URL에 포함하지 않고 apiName으로 API 페이지에서 역으로 찾도록 합니다.
}

function buildHeader(): TableHeaderType[] {
  return [
    {
      value: "method",
      name: "METHOD",
      width: "10%",
      textAlign: "center",
      cellClassName: "flex items-center justify-center",
      render: (row) => <MethodTag method={row.method as HttpMethod} className="inline-flex min-w-0" />,
    },
    {
      value: "name",
      name: "API NAME",
      width: "20%",
      textAlign: "left",
      render: (row) => (
        <a href={`/api/${encodeURIComponent(row.name || "")}`} className="typo-body-2-normal hover:text-label-normal cursor-pointer hover:underline">
          {row.name || "-"}
        </a>
      ),
    },
    {
      value: "path",
      name: "ENDPOINT PATH",
      width: "25%",
      textAlign: "left",
      render: (row) => <span className="typo-body-2-normal block font-medium">{row.path}</span>,
    },
    {
      value: "description",
      name: "DESCRIPTION",
      width: "25%",
      textAlign: "left",
    },
    {
      value: "lastModified",
      name: "LAST MODIFIED",
      width: "20%",
      textAlign: "left",
      render: (row) => <span className="whitespace-nowrap">{formatLastModified(row.lastModified)}</span>,
    },
    {
      value: "actions",
      name: "ACTIONS",
      width: "10%",
      textAlign: "left",
      cellClassName: "flex items-center",
      render: () => (
        <div className="flex items-center justify-end gap-3">
          <button type="button" className="text-label-assistant hover:text-label-normal h-7 w-7 cursor-pointer rounded p-1.5 transition-colors" aria-label="수정">
            <EditIcon />
          </button>
          <button type="button" className="hover:text-label-negative h-7 w-7 cursor-pointer rounded p-1.5 text-[#94A3B8] transition-colors" aria-label="삭제">
            <DeleteIcon />
          </button>
        </div>
      ),
    },
  ];
}

export default function ApiEndpointsTable({ endpoints }: ApiEndpointsTableProps) {
  const header = buildHeader();

  return (
    <div className="rounded-4 border-border-enabled bg-background-white overflow-hidden border">
      <div className="overflow-x-auto">
        <Table className="w-full min-w-[720px]" header={header} data={endpoints} headerRowClassName={apiHeaderRowClass} bodyRowClassName={apiBodyRowClass} />
      </div>
    </div>
  );
}

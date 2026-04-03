"use client";

// React
import type { Dispatch, ReactNode, SetStateAction } from "react";

// Assets
import AddBtnIcon from "@/assets/svg/AddBtnIcon";

// Components
import ApiResponseStatus from "@/components/api/ApiResponseStatus";
import Radio from "@/components/common/Radio";

// Libs
import { type ActiveApiResponseState, getApiResponseGroups, type ApiResponseItem } from "@/libs/datadummy/api";

export interface ApiResponseSectionProps {
  apiName: string;
  className?: string;
  checkedValue: string;
  setCheckedValue: Dispatch<SetStateAction<string>>;
  activeResponse: ActiveApiResponseState;
  onApplyActiveResponse: (item: ApiResponseItem) => void;
}

function ApiResponseColumnHeader({ title, apiName, type }: { title: string; apiName: string; type: "default" | "test" | "error" }) {
  return (
    <div className="border-border-enabled flex items-center justify-between border-b pb-5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="typo-body-1-normal text-label-normal font-bold tracking-wide">{title}</span>
      </div>
      <button type="button" onClick={() => (window.location.href = `/api/json?state=new&apiName=${encodeURIComponent(apiName)}&type=${type}`)} className="cursor-pointer">
        <AddBtnIcon />
      </button>
    </div>
  );
}

function ApiResponseRadioList({
  items,
  checkedValue,
  setCheckedValue,
}: {
  items: ApiResponseItem[];
  checkedValue: string;
  setCheckedValue: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <Radio
          key={item.value}
          label={item.label}
          labelColorClassName={item.type === "error" ? "text-label-negative" : undefined}
          value={item.value}
          category="box"
          infoText={item.infoText}
          checkedValue={checkedValue}
          setCheckedValue={setCheckedValue}
        />
      ))}
    </div>
  );
}

function ApiResponseColumn({
  className = "",
  title,
  apiName,
  type,
  withDivider = false,
  children,
}: {
  className?: string;
  title: string;
  apiName: string;
  type: "default" | "test" | "error";
  withDivider?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`${withDivider ? "after:bg-border-enabled relative mr-5 pr-5 after:absolute after:top-0 after:right-0 after:h-full after:w-px after:content-['']" : ""} ${className}`}
    >
      <div className="flex flex-col gap-7">
        <ApiResponseColumnHeader title={title} apiName={apiName} type={type} />
        {children}
      </div>
    </div>
  );
}

export default function ApiResponseSection({ apiName, className = "", checkedValue, setCheckedValue, activeResponse, onApplyActiveResponse }: ApiResponseSectionProps) {
  const { localResponses, testResponses, errorResponses } = getApiResponseGroups(apiName);
  const allItems = [...localResponses, ...testResponses, ...errorResponses];
  const selectedItem = allItems.find((item) => item.value === checkedValue) ?? localResponses[0];
  const isActiveSelection = Boolean(selectedItem && activeResponse.responseValue === selectedItem.value);

  return (
    <div className={`mx-auto w-full max-w-[1600px] space-y-5 ${className}`}>
      <ApiResponseStatus
        title={selectedItem?.label ?? ""}
        status={isActiveSelection ? "사용중" : selectedItem?.description ?? ""}
        showApplyButton={Boolean(selectedItem && !isActiveSelection)}
        onApplyAsActive={selectedItem ? () => onApplyActiveResponse(selectedItem) : undefined}
      />

      {/* Three columns */}
      <div className="border-border-enabled rounded-3 bg-background-white flex border p-7">
        <ApiResponseColumn title="로컬 응답" apiName={apiName} type="default" className="flex-[0_0_25%]" withDivider>
          <ApiResponseRadioList items={localResponses} checkedValue={checkedValue} setCheckedValue={setCheckedValue} />
        </ApiResponseColumn>

        <ApiResponseColumn title="테스트 응답" apiName={apiName} type="test" className="flex-[0_0_30%]" withDivider>
          <ApiResponseRadioList items={testResponses} checkedValue={checkedValue} setCheckedValue={setCheckedValue} />
        </ApiResponseColumn>

        <ApiResponseColumn title="에러 응답" apiName={apiName} type="error" className="flex-[0_0_calc(45%-32px)]">
          <ApiResponseRadioList items={errorResponses} checkedValue={checkedValue} setCheckedValue={setCheckedValue} />
        </ApiResponseColumn>
      </div>
    </div>
  );
}

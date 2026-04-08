"use client";

import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

import DeleteIcon from "@/assets/svg/DeleteIcon";
import Radio from "@/components/common/Radio";
import { ConfirmModal } from "@/components/common/modals";
import { type ApiResponseItem, isPersistedSavedResponseItem } from "@/libs/datadummy/api";

export interface ApiResponseRadioListProps {
  apiName: string;
  items: ApiResponseItem[];
  checkedValue: string;
  setCheckedValue: Dispatch<SetStateAction<string>>;
  onDeletePersistedResponse?: (item: ApiResponseItem) => void | Promise<void>;
}

export default function ApiResponseRadioList({ apiName, items, checkedValue, setCheckedValue, onDeletePersistedResponse }: ApiResponseRadioListProps) {
  const [pendingDelete, setPendingDelete] = useState<ApiResponseItem | null>(null);

  return (
    <>
      <ConfirmModal
        isOpen={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        title="응답 삭제"
        message={
          <>
            <p>이 응답을 삭제하시겠습니까?</p>
            <p className="typo-body-2-normal text-label-negative mt-3">삭제된 데이터는 복구할 수 없습니다.</p>
          </>
        }
        cancelLabel="취소"
        confirmLabel="삭제"
        anchorMain
        onConfirm={async () => {
          const item = pendingDelete;
          setPendingDelete(null);
          if (item) await onDeletePersistedResponse?.(item);
        }}
      />
      <div className="flex flex-col gap-4">
        {items.map((item) => {
          const deletable = Boolean(onDeletePersistedResponse && isPersistedSavedResponseItem(apiName, item.value));
          return (
            <div key={item.value} className="relative w-full">
              <Radio
                className={`w-full min-w-0 ${deletable ? "!pr-14" : ""}`}
                label={item.label}
                labelColorClassName={item.type === "error" ? "text-label-negative" : undefined}
                value={item.value}
                category="box"
                infoText={item.infoText}
                description={item.description}
                checkedValue={checkedValue}
                setCheckedValue={setCheckedValue}
              />
              {deletable && (
                <button
                  type="button"
                  className="hover:text-label-neutral absolute top-1/2 right-5 z-10 h-7 w-7 -translate-y-1/2 cursor-pointer rounded rounded-md p-1.5 text-[#94A3B8] transition-colors transition-opacity"
                  aria-label={`${item.label} 응답 삭제`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPendingDelete(item);
                  }}
                >
                  <DeleteIcon className="h-5 w-5 shrink-0" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

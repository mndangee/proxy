"use client";

// Types
import { ITableProps } from "@/types/commonType";

//Component
import CheckBox from "@/components/common/CheckBox";

export default function Table(props: ITableProps) {
  return (
    <div className={props.className}>
      {/* table header */}
      <div className="typo-body-bold bg-table-normal text-font-normal flex h-10 justify-center text-center">
        {props.hasCheckBox && props.checkBoxStateList && props.setCheckBoxStateList && (
          <CheckBox
            className="w-11 py-4"
            isAllCheckBox
            checkBoxStateList={props.checkBoxStateList}
            setCheckBoxStateList={props.setCheckBoxStateList}
          />
        )}

        {props.header.map((headerItem, headerIdx) => (
          <div
            key={`table-header-${headerItem}-${headerIdx}`}
            className="px-5 py-4"
            style={{
              width: headerItem.width,
              textAlign: headerItem.textAlign ? headerItem.textAlign : "center",
            }}
          >
            {headerItem.name}
          </div>
        ))}
      </div>

      {/* table body */}
      <div className="flex flex-col">
        {props.data.map((bodyItem, bodyIdx) => (
          <div
            key={`table-body-${bodyItem}-${bodyIdx}`}
            className={` ${props.hasInput && "!border-0 !py-0 last:!border-b-1"} typo-body-regular border-t-stroke-dark text-font-normal last:border-b-stroke-dark flex h-full max-h-12 min-h-10 items-center justify-center border-t-1 py-3 text-center last:border-b-1`}
          >
            {props.hasCheckBox && props.checkBoxStateList && props.setCheckBoxStateList && (
              <CheckBox
                className={`${props.hasInput && "border-y-stroke-dark border-t-1 last:border-b-1"} h-10 w-11 py-4`}
                value={bodyIdx}
                checkBoxStateList={props.checkBoxStateList}
                setCheckBoxStateList={props.setCheckBoxStateList}
              />
            )}
            {props.header.map((headerItem, headerIdx) => (
              <div
                key={`table-body-data-${headerItem}-${headerIdx}`}
                className={`px-5`}
                style={{
                  width: headerItem.width,
                  textAlign: headerItem.textAlign ? headerItem.textAlign : "center",
                }}
              >
                {bodyItem[headerItem.value] || "-"}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

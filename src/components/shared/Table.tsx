"use client";

// Components
import CheckBox from "@/components/common/CheckBox";

// Types
import { ITableProps } from "@/types/commonType";

const defaultHeaderRowClass = "typo-body-bold bg-table-normal text-font-normal flex h-10 min-h-10 justify-center text-center";
const defaultBodyRowClass =
  "typo-body-regular border-t-stroke-dark text-font-normal last:border-b-stroke-dark flex h-full max-h-12 min-h-10 items-center justify-center border-t-1 py-3 text-center last:border-b-1";

export default function Table(props: ITableProps) {
  const headerRowClass = props.headerRowClassName ?? defaultHeaderRowClass;
  const bodyRowClass = props.bodyRowClassName ?? defaultBodyRowClass;

  return (
    <div className={props.className}>
      {/* table header */}
      <div className={`${headerRowClass}${props.stickyHeader ? " sticky top-0 z-20 shadow-sm" : ""}`}>
        {props.hasCheckBox && props.checkBoxStateList && props.setCheckBoxStateList && (
          <CheckBox className="w-11 py-4" isAllCheckBox checkBoxStateList={props.checkBoxStateList} setCheckBoxStateList={props.setCheckBoxStateList} />
        )}

        {props.header.map((headerItem, headerIdx) => (
          <div
            key={`table-header-${headerIdx}-${headerItem.value}`}
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
          <div key={`table-body-${bodyItem?.id ?? bodyIdx}`} className={`${props.hasInput && "!border-0 !py-0 last:!border-b-1"} ${bodyRowClass}`}>
            {props.hasCheckBox && props.checkBoxStateList && props.setCheckBoxStateList && (
              <CheckBox
                className={`${props.hasInput && "border-y-stroke-dark border-t-1 last:border-b-1"} h-10 w-11 py-4`}
                value={props.getCheckBoxRowValue ? props.getCheckBoxRowValue(bodyItem, bodyIdx) : bodyIdx}
                checkBoxStateList={props.checkBoxStateList}
                setCheckBoxStateList={props.setCheckBoxStateList}
              />
            )}
            {props.header.map((headerItem, headerIdx) => (
              <div
                key={`table-body-data-${headerItem}-${headerIdx}`}
                className={`px-5 ${headerItem.cellClassName ?? ""}`}
                style={{
                  width: headerItem.width,
                  textAlign: headerItem.textAlign ? headerItem.textAlign : "center",
                }}
              >
                {headerItem.render != null ? headerItem.render(bodyItem, bodyIdx) : (bodyItem[headerItem.value] ?? "-")}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

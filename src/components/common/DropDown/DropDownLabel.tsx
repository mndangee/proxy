import type { DropDownSizeType, IDropDownProps } from "@/components/common/DropDown";

export function DropDownLabel({ className, ...props }: IDropDownProps) {
  const requiredTypeStyle: Record<DropDownSizeType, string> = {
    large: "typo-caption-1",
    medium: "typo-caption-1",
    small: "typo-caption-2",
  };

  return (
    <>
      {props.label && (
        <div className={`${props.error && "!text-negative-500"} ${className}`}>
          {props.label}
          {props.required && (
            <span className={`${requiredTypeStyle[props.size]} ml-1 font-semibold text-negative-500`}>*</span>
          )}
        </div>
      )}
    </>
  );
}

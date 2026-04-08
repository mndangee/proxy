import type { IDropDownProps } from "@/components/common/DropDown";

export function DropDownHelperText({ ...props }: IDropDownProps) {
  if (!props.helperText) return <></>;

  return (
    <div
      className={`${props.error && "!typo-caption-1 !font-regular !text-negative-500"} typo-caption-2 absolute mt-3 flex gap-2 whitespace-pre-line font-medium text-neutral-400`}
    >
      {props.helperText}
    </div>
  );
}

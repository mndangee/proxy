"use client";

// Assets
import DefaultRadioBoxIcon from "@/assets/svg/DefaultRadioBoxIcon";
import SelectedRadioBoxIcon from "@/assets/svg/SelectedRadioBoxIcon";

type RadioCategoryType = "default" | "box";

export interface IRadioProps {
  className?: string;
  labelColorClassName?: string;
  /** 비활성 여부 */
  disabled?: boolean;
  /** 라디오 카테고리, 디자인 시스템(피그마 컨벤션) */
  category?: RadioCategoryType;
  /** 라디오버튼 데이터 */
  label?: string;
  /** 라디오버튼 설명 데이터 */
  infoText?: string;
  /** 라디오 값 */
  value: string;
  /** 선택된 라디오 값 -> const [sample, setSample] = useState<string>("") */
  checkedValue: string;
  /** 선택된 라디오 값 업데이트 -> const [sample, setSample] = useState<string>("") */
  setCheckedValue: React.Dispatch<React.SetStateAction<string>>;
}

export default function Radio({ category = "default", ...props }: IRadioProps) {
  const labelColorClassName = props.labelColorClassName ?? "text-label-normal";

  const radioCategory: Record<RadioCategoryType, string> = {
    default: `
      [&_circle]:stroke-neutral-200
      [&:not(.disabled)_circle]:hover:fill-neutral-50
      [&:not(.disabled)_circle]:hover:stroke-neutral-300
    `,
    box: `
      p-5 bg-white outline outline-1 outline-gray-100
      [&_circle]:stroke-gray-200
      [&:not(.disabled)]:hover:bg-blue-50
      [&:not(.disabled)]:hover:outline-blue-100
      [&:not(.disabled)_circle]:hover:stroke-gray-300
    `,
  };

  const checkedRadioCategory: Record<RadioCategoryType, string> = {
    default: `
      [&_circle]:fill-brand-500
      [&:not(.disabled)_circle]:hover:fill-brand-600
      [&:not(.disabled)_circle]:hover:stroke-brand-600
    `,
    box: `
      p-5 bg-blue-50 outline outline-2 outline-blue-100
      [&_circle]:fill-brand-500
      [&:not(.disabled)]:hover:bg-brand-100
      [&:not(.disabled)]:hover:outline-brand-600
      [&:not(.disabled)_circle]:hover:fill-brand-600
      [&:not(.disabled)_circle]:hover:stroke-brand-600
    `,
  };

  return (
    <div
      className={` ${props.className} cn-center rounded-3 items-center gap-5 [&:not(.disabled)]:cursor-pointer ${props.checkedValue === props.value ? checkedRadioCategory[category] : radioCategory[category]} ${props.disabled && "disabled cursor-no-drop opacity-50"} `}
      onClick={() => !props.disabled && props.setCheckedValue(props.value)}
    >
      <div className="h-6 w-6 flex-[0_0_auto]">
        {props.checkedValue === props.value ? <SelectedRadioBoxIcon className="h-6 w-6" /> : <DefaultRadioBoxIcon className="h-6 w-6" />}
      </div>
      <div className="flex-auto">
        {props.label && <div className={`typo-body-1-normal ${labelColorClassName}`}>{props.label}</div>}
        {props.infoText && <div className={"typo-caption-1 text-label-assistant"}>{props.infoText}</div>}
      </div>
    </div>
  );
}

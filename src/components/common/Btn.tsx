type WidthUnitType = "px" | "%" | "em" | "vh";
type BtnCategoryType = "primary" | "secondary";
type BtnSizeType = "large" | "medium" | "small";

export interface IButtonProps {
  className?: string;
  /** 버튼 내용(텍스트) */
  children: React.ReactNode;
  /** 버튼 카테고리, 디자인 시스템(피그마 컨벤션) */
  category?: BtnCategoryType;
  /** 버튼 사이즈, 디자인 시스템(피그마 컨벤션) */
  size?: BtnSizeType;
  /** 버튼 변형 유무 */
  variant?: boolean;
  /** 버튼 왼쪽 아이콘 */
  startIcon?: React.ReactNode;
  /** 버튼 오른쪽 아이콘 */
  endIcon?: React.ReactNode;
  /** 버튼 가로 길이 */
  width?: `${number}${WidthUnitType}` | number | "auto";
  /** 비활성 여부 */
  disabled?: boolean;
  /** 버튼 클릭 시 이벤트 동작 */
  onClick?: () => void;
}

export default function Btn({ category = "primary", size = "medium", ...props }: IButtonProps) {
  const btnWidth = props.width ? (typeof props.width === "string" ? props.width : `${props.width}px`) : "100%";

  const btnCategory: Record<BtnCategoryType, string> = {
    primary: "text-label-common bg-background-primary [&:not(:disabled)]:hover:bg-background-primary-hover",
    secondary: "text-label-common bg-background-secondary [&:not(:disabled)]:hover:bg-background-secondary-hover",
  };

  const variantCategory: Record<BtnCategoryType, string> = {
    primary: "text-label-primary border-1 border-border-primary bg-background-white [&:not(:disabled)]:hover:bg-background-primary-weak",
    secondary: "text-label-neutral border-1 border-border-enabled bg-background-white [&:not(:disabled)]:hover:bg-background-secondary-weak",
  };

  const btnSize: Record<BtnSizeType, string> = {
    large: "typo-body-2-normal px-5 py-4 h-10 gap-3",
    medium: "typo-body-2-normal px-5 py-3 h-9 gap-3",
    small: "typo-caption-1 px-5 py-3 h-8 gap-2",
  };

  return (
    <button
      type="button"
      className={`${props.variant ? variantCategory[category] : btnCategory[category]} ${btnSize[size]} ${props.className ?? ""} cn-center rounded-3 cursor-pointer font-medium disabled:cursor-no-drop disabled:opacity-50`}
      style={{ width: btnWidth }}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.startIcon ?? ""} {props.children} {props.endIcon ?? ""}
    </button>
  );
}

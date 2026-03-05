type WidthUnitType = "px" | "%" | "em" | "vh";
type BtnCategoryType = "primary" | "secondary" | "ghost" | "link";
type BtnSizeType = "large" | "medium" | "small";

export interface IButtonProps {
  /** 버튼 내용(텍스트) */
  children: React.ReactNode;
  /** 버튼 카테고리, 디자인 시스템(피그마 컨벤션) */
  category?: BtnCategoryType;
  /** 버튼 사이즈, 디자인 시스템(피그마 컨벤션) */
  size?: BtnSizeType;
  /** 버튼 왼쪽 아이콘 */
  startIcon?: React.ReactNode;
  /** 버튼 오른쪽 아이콘 */
  endIcon?: React.ReactNode;
  /** 버튼 가로 길이 */
  width?: `${number}${WidthUnitType}` | number;
  /** 비활성 여부 */
  disabled?: boolean;
  /** 버튼 클릭 시 이벤트 동작 */
  onClick?: () => void;
}

export default function Btn({ category = "primary", size = "medium", ...props }: IButtonProps) {
  const btnWidth = props.width ? (typeof props.width === "string" ? props.width : `${props.width}px`) : "auto";

  const btnCategory: Record<BtnCategoryType, string> = {
    primary: `
      bg-primary-normal border-primary-normal text-fixed-white-fixed
      hover:bg-primary-dark hover:border-primary-normal
      [&_path]:fill-fixed-white-fixed
    `,
    secondary: `
      bg-contents-normal border-contents-normal text-fixed-white-fixed
      hover:bg-contents-dark hover:border-secondary-light
      [&_path]:fill-fixed-white-fixed
    `,
    ghost: `
      bg-transparent border-stroke-normal text-font-normal
      hover:bg-btn-ghost-hover
      [&_path]:fill-font-normal
    `,
    link: `
      text-font-normal hover:text-primary-inverse-var border-transparent
      [&_path]:fill-font-normal hover:[&_path]:fill-font-primary-inverse-var
    `,
  };

  const btnSize: Record<BtnSizeType, string> = {
    large: "typo-h4-regular px-5 py-4 h-10 gap-3",
    medium: "typo-body-regular px-5 py-2 h-8 gap-3",
    small: "typo-label px-3 py-1 h-7 gap-1",
  };

  return (
    <button
      className={` ${btnCategory[category]} ${btnSize[size]} ${props.disabled && "!border-stroke-normal !bg-fixed-disable !text-font-low"} cn-center rounded-2 [&:not(:disabled)]:hover:shadow-lv2 cursor-pointer border-1 disabled:cursor-no-drop [&>*]:mb-1`}
      style={{ width: btnWidth }}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.startIcon ?? ""} {props.children} {props.endIcon ?? ""}
    </button>
  );
}

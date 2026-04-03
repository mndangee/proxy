import type { Dispatch, ReactNode, SetStateAction } from "react";
import { checkBoxObjectType } from "@/components/common/CheckBox";

export type SearchParamsType = {
  page: number;
  size: number;
  start_date?: string;
  end_date?: string;
  orderBy?: string;
  order?: "asc" | "desc";
};

export interface IModalProps {
  /** 모달 오픈 유무 */
  isOpen?: boolean;
  /** 모달 닫기 */
  onClose?: () => void;
  /** 모달 여는 트리거(버튼) */
  children?: ReactNode;
  /** 모달 트리거 영역 ClassName */
  className?: string;
}

export type ColorThemeType = "default" | "pink" | "green" | string;
export type ThemeType = "light" | "dark" | "pink-dark" | "green-dark" | ColorThemeType;

export type TextAlignType = "start" | "end" | "left" | "right" | "center" | "justify" | "match-parent";

export type TableHeaderType = {
  value: string;
  name: string;
  width: string;
  textAlign?: TextAlignType;
  /** 있으면 해당 열은 `render` 결과로 표시 (셀 커스텀) */
  render?: (row: any, rowIndex: number) => ReactNode;
  /** 바디 셀 래퍼에 추가할 클래스 */
  cellClassName?: string;
};

export interface ITableProps {
  data: any[];
  className?: string;
  header: TableHeaderType[];
  searchParams?: SearchParamsType;
  hasCheckBox?: boolean;
  hasInput?: boolean;
  emptyContents?: React.ReactNode;
  checkBoxStateList?: checkBoxObjectType;
  setCheckBoxStateList?: Dispatch<SetStateAction<checkBoxObjectType>>;
  /** 헤더 행 className (미지정 시 기본 스타일) */
  headerRowClassName?: string;
  /** 바디 행 className (미지정 시 기본 스타일) */
  bodyRowClassName?: string;
}

export interface IFetchOption extends RequestInit {
  method: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
  body?: any;
}

export type CanvasTransformUpdateType = {
  itemX?: number;
  itemY?: number;
  itemW?: number;
  itemH?: number;
};

export type BbsCategoryAliasType = "notice" | "personal-inquiry" | "faq";

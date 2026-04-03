// React
import type { ReactNode } from "react";
import { useState } from "react";

// Assets
import PlusIcon from "@/assets/svg/PlusIcon";
import SearchIcon from "@/assets/svg/SearchIcon";

// Components
import Btn from "@/components/common/Btn";

export type HeaderVariant = "main" | "sub";

const MAIN_HEADER_ACTION_BTN_WIDTH = 160;

export interface HeaderProps {
  className?: string;
  /** 'main' = 메인 페이지 헤더, 'sub' = 그 외 (프로젝트 등) */
  variant?: HeaderVariant;
  /** 서비스/페이지 타이틀 (메인: "Project Management", 서브: 프로젝트명) */
  title: string;
  /** 메인 전용: 신규 프로젝트 생성 버튼 클릭 시 */
  onCreateProject?: () => void;
  /** 메인 전용: 「새 프로젝트 만들기」 왼쪽에 표시되는 가져오기 (선택) */
  onImportProject?: () => void;
  /** 서브 전용: 검색 입력 시 (선택) */
  onSearch?: (value: string) => void;
}

export default function Header({ className = "", variant = "sub", ...props }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const inner = (children: ReactNode) => <div className={`mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-6`}>{children}</div>;

  if (variant === "main") {
    return (
      <div className={`bg-background-white w-full min-w-0 py-7 ${className}`}>
        {inner(
          <>
            <div className="typo-title-3 text-label-normal">{props.title}</div>
            {(props.onImportProject != null || props.onCreateProject != null) && (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
                {props.onImportProject != null && (
                  <Btn category="secondary" variant size="medium" width={MAIN_HEADER_ACTION_BTN_WIDTH} onClick={props.onImportProject}>
                    프로젝트 가져오기
                  </Btn>
                )}
                {props.onCreateProject != null && (
                  <Btn category="primary" size="medium" startIcon={<PlusIcon />} onClick={props.onCreateProject} width={MAIN_HEADER_ACTION_BTN_WIDTH}>
                    새 프로젝트 만들기
                  </Btn>
                )}
              </div>
            )}
          </>,
        )}
      </div>
    );
  }

  return (
    <header className={`bg-background-white w-full min-w-0 py-6 ${className}`}>
      {inner(
        <>
          <div className="min-w-0 flex-1 overflow-hidden">
            <a href="/" className="typo-body-1-normal text-label-assistant block truncate font-medium hover:underline hover:decoration-black">
              Projects / <span className="text-label-normal">{props.title}</span>
            </a>
          </div>
          {props.onSearch ? (
            <div className="flex shrink-0 items-center gap-2">
              {searchOpen ? (
                <input
                  type="search"
                  placeholder="검색"
                  value={searchValue}
                  onChange={(e) => {
                    setSearchValue(e.target.value);
                    props.onSearch?.(e.target.value);
                  }}
                  onBlur={() => setSearchOpen(false)}
                  autoFocus
                  className="typo-body-2-normal rounded-3 border-border-enabled bg-background-gray text-label-normal placeholder-label-assistant focus:border-border-primary w-48 border px-3 py-2 outline-none focus:ring-1 focus:ring-blue-500"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="text-label-assistant hover:bg-background-secondary-weak hover:text-label-neutral rounded p-2"
                  aria-label="검색"
                >
                  <SearchIcon className="shrink-0" />
                </button>
              )}
            </div>
          ) : null}
        </>,
      )}
    </header>
  );
}

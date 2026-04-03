"use client";

// React
import { useState } from "react";

// Assets
import StarIcon from "@/assets/svg/StarIcon";

// Components
import Btn from "@/components/common/Btn";

export type ApiExplorerViewMode = "definition" | "settings";

export interface ApiExplorerHeaderProps {
  className?: string;
  /** API 이름 (예: VD.MOVS0001) */
  title: string;
  currentType?: "default" | "test" | "error";
  currentResponseValue?: string | null;
  /** 제목 아래 설명 */
  subtext?: string;
  /** 모드 변경 시 (선택, 더미 토글 외 확장용) */
  onModeChange?: (mode: ApiExplorerViewMode) => void;
  onSettingsClick?: () => void;
}

export default function ApiExplorerHeader({
  className = "",
  title,
  currentType = "default",
  currentResponseValue = null,
  subtext = "회원가입 대상 여부 조회 (Y 가 가입가능대상임 )",
  onModeChange,
  onSettingsClick,
}: ApiExplorerHeaderProps) {
  const [mode, setMode] = useState<ApiExplorerViewMode>("definition");

  const setModeAndNotify = (next: ApiExplorerViewMode) => {
    setMode(next);
    onModeChange?.(next);
  };

  return (
    <header className={`bg-background-white w-full min-w-0 py-6 ${className}`}>
      <div className="mx-auto flex w-full max-w-[1600px] items-start justify-between gap-4 px-6">
        <div className="relative pl-9">
          <div className="text-label-assistant absolute top-3 left-0">
            <StarIcon className="h-[28px] w-[28px]" />
          </div>
          <div className="typo-title-2 text-label-normal truncate font-bold">{title}</div>
          <p className="typo-body-2-normal text-label-assistant mt-1">{subtext}</p>
        </div>

        <div className="flex shrink-0 gap-3">
          <Btn
            category="primary"
            size="medium"
            variant={mode !== "definition"}
            width={140}
            className={mode === "definition" ? "!font-semibold" : ""}
            onClick={() => setModeAndNotify("definition")}
          >
            정의서
          </Btn>
          <Btn
            category="primary"
            size="medium"
            variant
            width={140}
            className=""
            onClick={() => {
              if (onSettingsClick) {
                onSettingsClick();
                return;
              }
              window.location.href = `/api/json?state=edit&apiName=${encodeURIComponent(title)}&type=${currentType}${currentResponseValue ? `&responseValue=${encodeURIComponent(currentResponseValue)}` : ""}`;
            }}
          >
            더미설정
          </Btn>
        </div>
      </div>
    </header>
  );
}

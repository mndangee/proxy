"use client";

// Assets
import StarIcon from "@/assets/svg/StarIcon";

// Components
import Btn from "@/components/common/Btn";

import { navigateApp } from "@/libs/app-navigation";

export interface ApiExplorerHeaderProps {
  className?: string;
  /** API 이름 (예: VD.MOVS0001) */
  title: string;
  currentType?: "default" | "test" | "error";
  currentResponseValue?: string | null;
  /** 제목 아래 설명 */
  subtext?: string;
  /** 빈 응답 편집 화면 열기 */
  onNewResponseClick?: () => void;
  /** JSON 파일 가져오기 */
  onJsonAddClick?: () => void;
  onSettingsClick?: () => void;
}

export default function ApiExplorerHeader({
  className = "",
  title,
  currentType = "default",
  currentResponseValue = null,
  subtext,
  onNewResponseClick,
  onJsonAddClick,
  onSettingsClick,
}: ApiExplorerHeaderProps) {
  return (
    <header className={`bg-background-white w-full min-w-0 py-6 ${className}`}>
      <div className="mx-auto flex w-full max-w-[1600px] flex-col items-stretch justify-between gap-5 px-6 lg:flex-row lg:items-start">
        <div className="relative min-w-0 pl-9">
          <div className="text-label-assistant absolute top-3 left-0">
            <StarIcon className="h-[28px] w-[28px]" />
          </div>
          <div className="typo-title-2 text-label-normal break-all font-bold">{title}</div>
          <p className="typo-body-2-normal text-label-assistant mt-1 break-words">{subtext}</p>
        </div>

        <div className="grid w-full shrink-0 grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto lg:gap-3">
          <Btn
            category="primary"
            size="medium"
            width="100%"
            className="lg:!w-[140px]"
            onClick={() => onNewResponseClick?.()}
          >
            새 응답 추가
          </Btn>
          <Btn
            category="primary"
            size="medium"
            variant
            width="100%"
            className="lg:!w-[150px]"
            onClick={() => onJsonAddClick?.()}
          >
            JSON 파일 가져오기
          </Btn>
          <Btn
            category="primary"
            size="medium"
            variant
            width="100%"
            className="lg:!w-[120px]"
            disabled={!currentResponseValue}
            onClick={() => {
              if (onSettingsClick) {
                onSettingsClick();
                return;
              }
              navigateApp(
                `/api/json?state=edit&apiName=${encodeURIComponent(title)}&type=${currentType}${currentResponseValue ? `&responseValue=${encodeURIComponent(currentResponseValue)}` : ""}`,
              );
            }}
          >
            더미 설정
          </Btn>
        </div>
      </div>
    </header>
  );
}

"use client";

// Assets
import DefaultRadioBoxIcon from "@/assets/svg/DefaultRadioBoxIcon";
import NoActiveIcon from "@/assets/svg/NoActiveIcon";
import SelectedRadioBoxIcon from "@/assets/svg/SelectedRadioBoxIcon";

// Components
import Btn from "@/components/common/Btn";

interface ApiResponseStatusProps {
  className?: string;
  title: string;
  status: string;
  /** 목록에서 선택된 응답 행이 있을 때 true (컬럼에 항목이 전혀 없으면 false) */
  hasSelectedResponse?: boolean;
  /** 현재 선택값이 실제 활성(사용 중) 응답과 일치할 때 true */
  isActiveResponse?: boolean;
  /** 선택 항목이 아직 활성 응답이 아닐 때 표시 */
  showApplyButton?: boolean;
  onApplyAsActive?: () => void;
}

export default function ApiResponseStatus({
  className = "",
  title,
  status,
  hasSelectedResponse = true,
  isActiveResponse = false,
  showApplyButton = false,
  onApplyAsActive,
}: ApiResponseStatusProps) {
  const statusIcon = !hasSelectedResponse ? (
    <NoActiveIcon />
  ) : isActiveResponse ? (
    <SelectedRadioBoxIcon className="h-8 w-8" />
  ) : showApplyButton && onApplyAsActive ? (
    <DefaultRadioBoxIcon className="h-8 w-8" />
  ) : (
    <NoActiveIcon />
  );

  return (
    <div className={`rounded-3 bg-background-white border-border-enabled border p-7 ${className}`}>
      <div className="flex min-w-0 items-center justify-between gap-5">
        <div className="flex min-w-0 flex-1 items-center gap-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center">{statusIcon}</div>
          <div className="min-w-0">
            <div className="typo-heading-2 text-label-normal font-bold">{title}</div>
            <div className="typo-body-2-normal text-label-neutral">{status}</div>
          </div>
        </div>
        {showApplyButton && onApplyAsActive && (
          <Btn category="primary" size="medium" width={132} className="shrink-0" onClick={onApplyAsActive}>
            응답으로 사용
          </Btn>
        )}
      </div>
    </div>
  );
}

"use client";

// Assets
import SelectedRadioBoxIcon from "@/assets/svg/SelectedRadioBoxIcon";

// Components
import Btn from "@/components/common/Btn";

interface ApiResponseStatusProps {
  className?: string;
  title: string;
  status: string;
  /** 선택 항목이 아직 활성 응답이 아닐 때 표시 */
  showApplyButton?: boolean;
  onApplyAsActive?: () => void;
}

export default function ApiResponseStatus({ className = "", title, status, showApplyButton = false, onApplyAsActive }: ApiResponseStatusProps) {
  return (
    <div className={`rounded-3 bg-background-white border-border-enabled border p-7 ${className}`}>
      <div className="flex min-w-0 items-center justify-between gap-5">
        <div className="flex min-w-0 flex-1 items-center gap-5">
          <SelectedRadioBoxIcon />
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

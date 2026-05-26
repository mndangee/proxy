"use client";

import Btn from "@/components/common/Btn";
import Input from "@/components/common/Input";

export interface ApiResponseLatencyFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  onApply: () => void;
  applyBusy?: boolean;
  appliedHint?: string | null;
}

export default function ApiResponseLatencyField({ value, onValueChange, onApply, applyBusy, appliedHint }: ApiResponseLatencyFieldProps) {
  return (
    <div className="w-full max-w-full">
      <div className="typo-caption-1 text-label-assistant mb-2">응답 지연</div>
      <div className="flex flex-wrap items-end gap-3">
        <Input
          width={160}
          size="small"
          suffix="초"
          value={value}
          placeholder="0"
          disabled={applyBusy}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onApply();
          }}
        />
        <Btn category="primary" size="small" width={88} disabled={applyBusy} onClick={onApply}>
          사용
        </Btn>
        {appliedHint ? <span className="typo-caption-1 text-label-primary pb-2">{appliedHint}</span> : null}
      </div>
    </div>
  );
}

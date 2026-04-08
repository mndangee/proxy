"use client";

// Components
import Input from "@/components/common/Input";

export interface ApiResponseLatencyFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  onCommit: () => void;
}

/** API 상세 본문 — 응답 지연(ms), 디자인 시스템 Input과 동일 톤 */
export default function ApiResponseLatencyField({ value, onValueChange, onCommit }: ApiResponseLatencyFieldProps) {
  return (
    <div className="w-full max-w-full">
      <div className="typo-caption-1 text-label-assistant mb-2">응답 지연</div>
      <Input
        width={160}
        size="small"
        suffix="MS"
        value={value}
        placeholder="0"
        onChange={(e) => onValueChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as unknown as HTMLInputElement).blur();
        }}
      />
    </div>
  );
}

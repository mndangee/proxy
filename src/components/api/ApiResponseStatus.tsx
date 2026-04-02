"use client";

// Assets
import SelectedRadioBoxIcon from "@/assets/svg/SelectedRadioBoxIcon";

interface ApiResponseStatusProps {
  className?: string;
  title: string;
  status: string;
}

export default function ApiResponseStatus({ className = "", title, status }: ApiResponseStatusProps) {
  return (
    <div className={`rounded-3 bg-background-white border-border-enabled border p-7 ${className}`}>
      <div className="flex min-w-0 items-center gap-5">
        <SelectedRadioBoxIcon />
        <div className="min-w-0">
          <div className="typo-heading-2 text-label-normal font-bold">{title}</div>
          <div className="typo-body-2-normal text-label-neutral">{status}</div>
        </div>
      </div>
    </div>
  );
}

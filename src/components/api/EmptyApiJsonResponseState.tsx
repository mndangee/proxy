"use client";

// Assets
import EmptyJsonIcon from "@/assets/svg/EmptyJsonIcon";

// Components
import ApiResponseStatus from "@/components/api/ApiResponseStatus";
import Btn from "@/components/common/Btn";

export interface EmptyApiJsonResponseStateProps {
  apiName: string;
}

/**
 * 응답 JSON이 없을 때 — {@link ApiResponseSection}과 동일한 래퍼·상태 카드·하단 흰 카드 형태
 */
export default function EmptyApiJsonResponseState({ apiName }: EmptyApiJsonResponseStateProps) {
  const href = `/api/json?state=new&apiName=${encodeURIComponent(apiName)}&type=default`;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <ApiResponseStatus title="등록된 응답 없음" status="요청을 처리하려면 응답 시나리오를 먼저 설정해 주세요." hasSelectedResponse={false} showApplyButton={false} />

      <div className="border-border-enabled rounded-3 bg-background-white flex min-h-[320px] border p-7">
        <div className="flex w-full flex-col items-center justify-center px-4 py-8 text-center">
          <EmptyJsonIcon className="h-[80px] w-[80px]" />
          <h3 className="typo-heading-1 text-label-normal mt-7 max-w-lg font-bold">이 API에 등록된 응답 시나리오가 없습니다</h3>
          <p className="typo-body-1-normal text-label-assistant mt-3 max-w-md leading-relaxed">첫 응답 시나리오를 추가해 주세요.</p>
          <div className="mt-10">
            <Btn
              category="primary"
              size="medium"
              width={220}
              className="shadow-[0_8px_24px_rgba(19,164,236,0.35)]"
              onClick={() => {
                window.location.href = href;
              }}
            >
              첫 응답 추가하기
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

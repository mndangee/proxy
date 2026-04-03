"use client";

// Assets
import PlusIcon from "@/assets/svg/PlusIcon";
import ApiIcon from "@/assets/svg/ApiIcon";

// Components
import Btn from "@/components/common/Btn";

export default function NoApiEndpoints() {
  return (
    <div className="bg-background-white rounded-5 mt-9 flex w-full max-w-[1600px] flex-col items-center border-1 border-gray-200 py-14 text-center">
      <ApiIcon />
      <div className="typo-title-3 mt-7 mb-8 font-bold">등록된 API가 없습니다</div>
      <Btn category="primary" size="medium" startIcon={<PlusIcon />} onClick={() => {}} width={240}>
        API 등록하기
      </Btn>
    </div>
  );
}

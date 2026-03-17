"use client";

// Assets
import FolderIcon from "@/assets/svg/FolderIcon";
import PlusIcon from "@/assets/svg/PlusIcon";

// Component
import Btn from "@/components/common/Btn";

interface INoHistoryProps {
  text: string;
  buttonText: string;
}

export default function NoProject(props: INoHistoryProps) {
  return (
    <div className="bg-background-white rounded-5 mt-9 flex w-full max-w-[1600px] flex-col items-center border-1 border-gray-200 py-14 text-center">
      <FolderIcon />
      <div className="typo-title-3 mt-7 mb-8 font-bold">프로젝트가 없습니다</div>
      <Btn category="primary" size="medium" startIcon={<PlusIcon />} onClick={() => {}} width={240}>
        프로젝트 생성하기
      </Btn>
    </div>
  );
}

// React
import { useEffect, useState } from "react";

// Assets
import HistoryIcon from "@/assets/svg/HistoryIcon";

// Components
import Loader from "@/components/common/Loader";
import MethodTag from "@/components/common/MethodTag";

interface IHistoryRowProps {
  title: string;
}

interface IHistoryListProps {
  folderId: string;
}

const Historyrow = () => {
  return (
    <div className="flex items-center justify-between border-b-1 border-gray-200 px-8 py-5 last:border-b-0">
      <div>
        <div className="typo-body-1-normal font-bold">
          <span>GetUserData</span> - <span>Auth API</span>
        </div>
        <div className="typo-body-2-normal text-[#64748B]">/v1/users/id</div>
      </div>
      <div className="flex items-center gap-14">
        <MethodTag method={"GET"} />
        <div className="typo-body-2-normal text-[#64748B]">Just now</div>
      </div>
    </div>
  );
};

export default function HistoryList(props: IHistoryListProps) {
  const [isLoading, setIsLoading] = useState(false);

  const historyList: Array<number> = [1, 2, 3];

  return (
    <div className="bg-background-white rounded-5 mt-9 w-full max-w-[1600px] items-center overflow-hidden border-1 border-gray-200">
      {isLoading && <Loader />}
      <div className="typo-title-3 bg-gray-50 px-8 py-6 font-bold">최근 히스토리</div>
      {historyList.length > 0 ? (
        <>
          {historyList.map((data) => (
            <Historyrow key={data} />
          ))}
        </>
      ) : (
        <div className="flex flex-col items-center py-14 text-center">
          <HistoryIcon />
          <div className="typo-body-1-normal mt-5 text-gray-500">히스토리가 없습니다.</div>
        </div>
      )}
    </div>
  );
}

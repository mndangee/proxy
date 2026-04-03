// React
import { useState } from "react";

// Assets
import StarIcon from "@/assets/svg/StarIcon";
import DeleteIcon from "@/assets/svg/DeleteIcon";
import FillStarIcon from "@/assets/svg/FillStarIcon";

// Libs
import { slugify } from "@/libs/data/home";

export interface IProjectCardProps {
  /** 카드 클릭 시 /project/[projectName] 으로 이동하는 프로젝트 이름 */
  projectName: string;
  lastUpdated?: string;
  setIsLoading?: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function ProjectCard(props: IProjectCardProps) {
  const [isFavorites, setIsFavorites] = useState(false);
  const projectPath = `/project/${slugify(props.projectName)}`;

  return (
    <a href={projectPath} className="bg-background-white rounded-5 relative block h-[150px] w-[375px] cursor-pointer border-1 border-gray-200 p-7 no-underline shadow">
      <div className="flex items-center justify-between">
        <div className="typo-heading-2 text-label-normal font-bold">{props.projectName}</div>
        <div
          className="text-label-assistant"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsFavorites(!isFavorites);
          }}
        >
          {isFavorites ? <FillStarIcon /> : <StarIcon />}
        </div>
      </div>
      <div className="typo-body-2-normal text-label-assistant mt-3">마지막 업데이트 {props.lastUpdated ?? "2시간 전"}</div>

      <div
        className="text-label-assistant hover:text-label-neutral absolute right-7 bottom-7 flex h-7 w-7 cursor-pointer items-center justify-center"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          alert("h22");
        }}
      >
        <DeleteIcon />
      </div>
    </a>
  );
}

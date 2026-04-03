// React
import { useEffect, useState } from "react";

// Assets
import StarIcon from "@/assets/svg/StarIcon";
import DeleteIcon from "@/assets/svg/DeleteIcon";
import FillStarIcon from "@/assets/svg/FillStarIcon";

// Components
import ConfirmModal from "@/components/shared/ConfirmModal";

// Libs
import {
  deleteProject,
  formatDeleteProjectUserError,
  formatProjectUpdatedLabel,
  getProjectHref,
  updateProjectFavorite,
} from "@/libs/projects/store";

// Types
import type { Project } from "@/types";

export interface IProjectCardProps {
  project: Project;
  setIsLoading?: React.Dispatch<React.SetStateAction<boolean>>;
  /** 즐겨찾기 변경·삭제 등 목록 갱신이 필요할 때 */
  onProjectsChange?: () => void;
}

export default function ProjectCard(props: IProjectCardProps) {
  const { project } = props;
  const [isFavorite, setIsFavorite] = useState(project.isFavorite);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const projectPath = getProjectHref(project);

  useEffect(() => {
    setIsFavorite(project.isFavorite);
  }, [project.id, project.isFavorite]);

  return (
    <>
      <a
        href={projectPath}
        className="bg-background-white rounded-5 border-border-enabled relative block h-[150px] w-[375px] cursor-pointer border p-7 no-underline shadow-sm transition-shadow hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="typo-heading-2 text-label-normal truncate font-bold">{project.name}</div>
            {project.description ? (
              <p className="typo-caption-1 text-label-assistant mt-1 line-clamp-2">{project.description}</p>
            ) : null}
          </div>
          <div
            className="text-label-assistant shrink-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const next = !isFavorite;
              const prev = isFavorite;
              setIsFavorite(next);
              void (async () => {
                try {
                  await updateProjectFavorite(project.id, next);
                  props.onProjectsChange?.();
                } catch (err) {
                  console.error(err);
                  setIsFavorite(prev);
                }
              })();
            }}
          >
            {isFavorite ? <FillStarIcon /> : <StarIcon />}
          </div>
        </div>
        <div className="typo-body-2-normal text-label-assistant mt-3">마지막 업데이트 {formatProjectUpdatedLabel(project.updatedAt)}</div>

        <div
          className="text-label-assistant hover:text-label-neutral absolute right-7 bottom-7 flex h-7 w-7 cursor-pointer items-center justify-center"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setConfirmDeleteOpen(true);
          }}
        >
          <DeleteIcon />
        </div>
      </a>

      <ConfirmModal
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="프로젝트 삭제"
        message="삭제하면 복구할 수 없습니다. 삭제하시겠습니까?"
        cancelLabel="취소"
        confirmLabel="확인"
        onConfirm={async () => {
          const r = await deleteProject(project.id);
          if (!r.ok) {
            alert(formatDeleteProjectUserError(r.error ?? "delete-failed"));
            return;
          }
          setConfirmDeleteOpen(false);
          props.onProjectsChange?.();
        }}
      />
    </>
  );
}

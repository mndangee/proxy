// React
import { useEffect, useState } from "react";

// Assets
import DeleteIcon from "@/assets/svg/DeleteIcon";
import DownloadIcon from "@/assets/svg/DownloadIcon";
import StarIcon from "@/assets/svg/StarIcon";
import FillStarIcon from "@/assets/svg/FillStarIcon";

// Components
import { ConfirmModal, NoticeModal } from "@/components/common/modals";

// Libs
import {
  deleteProject,
  exportProjectToZip,
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
  const [zipExportModal, setZipExportModal] = useState<{ open: boolean; message: string }>({ open: false, message: "" });
  const [deleteErrorOpen, setDeleteErrorOpen] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");
  const projectPath = getProjectHref(project);

  const showZipExportModal = (message: string) => setZipExportModal({ open: true, message });
  const closeZipExportModal = () => setZipExportModal({ open: false, message: "" });

  const handleExportZip = () => {
    void (async () => {
      const folder = project.folderName;
      if (!folder) {
        showZipExportModal("디스크에 저장된 프로젝트만 ZIP으로 추출할 수 있습니다. Electron에서 만든 프로젝트를 사용해 주세요.");
        return;
      }
      const res = await exportProjectToZip(folder);
      if (!res.ok) {
        if (res.error === "cancelled") return;
        if (res.error === "electron-only") showZipExportModal("Electron 앱에서만 ZIP 추출이 가능합니다.");
        else if (res.error === "zip-write-failed") showZipExportModal("ZIP 파일을 저장하지 못했습니다.");
        else if (res.error === "not-found") showZipExportModal("프로젝트를 찾을 수 없습니다.");
        else showZipExportModal(`추출에 실패했습니다. (${res.error ?? "알 수 없는 오류"})`);
        return;
      }
      showZipExportModal("저장이 완료되었습니다");
    })();
  };

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

        <div className="absolute right-7 bottom-7 flex items-center gap-1">
          <button
            type="button"
            className="text-label-assistant hover:text-label-neutral flex h-7 w-7 cursor-pointer items-center justify-center rounded border-0 bg-transparent p-0"
            aria-label="프로젝트 ZIP 추출"
            title="ZIP 추출"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleExportZip();
            }}
          >
            <DownloadIcon className="shrink-0" />
          </button>
          <div
            className="text-label-assistant hover:text-label-neutral flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setConfirmDeleteOpen(true);
            }}
          >
            <DeleteIcon />
          </div>
        </div>
      </a>

      <NoticeModal isOpen={zipExportModal.open} onClose={closeZipExportModal} message={zipExportModal.message} />
      <NoticeModal
        isOpen={deleteErrorOpen}
        onClose={() => setDeleteErrorOpen(false)}
        message={deleteErrorMessage}
      />

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
            setDeleteErrorMessage(formatDeleteProjectUserError(r.error ?? "delete-failed"));
            setDeleteErrorOpen(true);
            return;
          }
          setConfirmDeleteOpen(false);
          props.onProjectsChange?.();
        }}
      />
    </>
  );
}

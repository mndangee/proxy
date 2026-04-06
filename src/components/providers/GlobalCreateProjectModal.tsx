"use client";

// React
import { useEffect, useState } from "react";

// Components
import CreateProjectModal from "@/components/main/CreateProjectModal";

// Libs
import { OPEN_CREATE_PROJECT_MODAL_EVENT, type OpenCreateProjectModalDetail } from "@/libs/projects/store";

/**
 * 레이아웃에 한 번만 두고, 커스텀 이벤트로 어디서든 프로젝트 생성 모달을 연다.
 * (헤더「새 프로젝트 만들기」, LNB「Create New Project」 등)
 */
export default function GlobalCreateProjectModal() {
  const [open, setOpen] = useState(false);
  const [anchorMain, setAnchorMain] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<OpenCreateProjectModalDetail>).detail;
      setAnchorMain(Boolean(d?.anchorMain));
      setOpen(true);
    };
    window.addEventListener(OPEN_CREATE_PROJECT_MODAL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CREATE_PROJECT_MODAL_EVENT, onOpen);
  }, []);

  return (
    <CreateProjectModal
      isOpen={open}
      anchorMain={anchorMain}
      onClose={() => {
        setOpen(false);
        setAnchorMain(false);
      }}
    />
  );
}

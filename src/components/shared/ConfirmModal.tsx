"use client";

// React
import { useState, type ReactNode } from "react";

// Components
import Btn from "@/components/common/Btn";
import Modal from "@/components/common/Modal";

export interface ConfirmModalProps {
  isOpen: boolean;
  /** 취소·배경 클릭(처리 중이 아닐 때) */
  onClose: () => void;
  title?: string;
  message: ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  /** 확인 클릭 시 (비동기 허용). 닫기/후처리는 호출부에서 처리 */
  onConfirm: () => void | Promise<void>;
  showCloseBtn?: boolean;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  title,
  message,
  cancelLabel = "취소",
  confirmLabel = "확인",
  onConfirm,
  showCloseBtn = false,
}: ConfirmModalProps) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = () => {
    void (async () => {
      setBusy(true);
      try {
        await Promise.resolve(onConfirm());
      } finally {
        setBusy(false);
      }
    })();
  };

  /** X 버튼과 겹치지 않도록 상단 여백 */
  const pad = showCloseBtn ? "px-8 pt-12 pb-8" : "px-8 py-10";

  return (
    <Modal isOpen={isOpen} onClose={busy ? undefined : onClose} size="small" showCloseBtn={showCloseBtn && !busy}>
      <div className={`flex w-full flex-col items-center text-center ${pad}`}>
        {title ? <h2 className="typo-title-3 text-label-normal w-full font-bold">{title}</h2> : null}
        <div className={`typo-body-2-normal text-label-neutral w-full ${title ? "mt-3" : ""}`}>{message}</div>
        <div className="mt-8 flex w-full flex-wrap items-center justify-center gap-3">
          <Btn category="secondary" variant width={100} disabled={busy} onClick={onClose}>
            {cancelLabel}
          </Btn>
          <Btn category="primary" width={100} disabled={busy} onClick={handleConfirm}>
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

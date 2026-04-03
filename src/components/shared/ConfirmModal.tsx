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

  /** 우측 X 버튼이 있을 때만 닫기 영역만큼 오른쪽 여백 */
  const pad = showCloseBtn ? "px-8 pt-10 pb-8 pr-14" : "px-8 py-10";

  return (
    <Modal isOpen={isOpen} onClose={busy ? undefined : onClose} size="small" showCloseBtn={showCloseBtn && !busy}>
      <div className={`w-full ${pad} text-center`}>
        {title ? <h2 className="typo-title-3 text-label-normal font-bold">{title}</h2> : null}
        <div className={`typo-body-2-normal text-label-neutral ${title ? "mt-3" : ""}`}>{message}</div>
        <div className="mt-8 flex justify-center gap-3">
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

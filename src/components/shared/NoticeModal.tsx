"use client";

// Components
import Btn from "@/components/common/Btn";
import Modal from "@/components/common/Modal";

export interface NoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
}

/** 단일 메시지 + 확인 (배경/X 닫기) */
export default function NoticeModal({ isOpen, onClose, message }: NoticeModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="small" showCloseBtn>
      <div className="flex w-full flex-col items-center px-8 pt-12 pb-8 text-center">
        <p className="typo-body-2-normal text-label-neutral w-full whitespace-pre-wrap">{message}</p>
        <div className="mt-8 flex w-full justify-center">
          <Btn category="primary" width={100} onClick={onClose}>
            확인
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

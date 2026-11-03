"use client";

import Btn from "@/components/common/Btn";
import Modal from "@/components/common/Modal";

export type ApiImportConflictPolicy = "overwrite" | "add" | "skip";

interface ApiImportConflictModalProps {
  isOpen: boolean;
  fileNames: string[];
  busy?: boolean;
  processingPolicy?: ApiImportConflictPolicy | null;
  onClose: () => void;
  onSelect: (policy: ApiImportConflictPolicy) => void;
}

export default function ApiImportConflictModal({ isOpen, fileNames, busy = false, processingPolicy = null, onClose, onSelect }: ApiImportConflictModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={busy ? undefined : onClose} size="small" showCloseBtn={!busy} anchorMain>
      <div className="flex w-full flex-col px-8 pt-12 pb-8">
        <h2 className="typo-title-3 text-label-normal text-center font-bold">동일한 이름의 응답이 있습니다</h2>
        <p className="typo-body-2-normal text-label-neutral mt-3 text-center">
          기존 파일과 내용이 다른 파일 {fileNames.length}개를 발견했습니다. 처리 방법을 선택해 주세요.
        </p>
        <div className="bg-background-alternative border-border-enabled mt-5 max-h-28 overflow-y-auto rounded-lg border px-4 py-3">
          {fileNames.map((fileName) => (
            <p key={fileName} className="typo-caption-1 text-label-neutral truncate">{fileName}</p>
          ))}
        </div>
        <div className="mt-7 flex w-full flex-wrap items-center justify-center gap-3">
          <Btn category="secondary" variant width={128} disabled={busy} onClick={() => onSelect("skip")}>
            {busy && processingPolicy === "skip" ? "처리 중..." : "건너뛰기"}
          </Btn>
          <Btn category="secondary" variant width={150} disabled={busy} onClick={() => onSelect("add")}>
            {busy && processingPolicy === "add" ? "추가하는 중..." : "새 응답으로 추가"}
          </Btn>
          <Btn category="primary" width={160} disabled={busy} onClick={() => onSelect("overwrite")}>
            {busy && processingPolicy === "overwrite" ? "덮어쓰는 중..." : "기존 응답 덮어쓰기"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

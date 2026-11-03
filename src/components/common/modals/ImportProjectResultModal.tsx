"use client";

import Btn from "@/components/common/Btn";
import Modal from "@/components/common/Modal";
import type { ProjectImportSummary } from "@/libs/projects/store";

interface ImportProjectResultModalProps {
  isOpen: boolean;
  projectName: string;
  summary: ProjectImportSummary | null;
  onClose: () => void;
  onOpenProject: () => void;
}

export default function ImportProjectResultModal({ isOpen, projectName, summary, onClose, onOpenProject }: ImportProjectResultModalProps) {
  const fileResults = summary?.fileResults ?? [];
  const imported = fileResults.filter((item) => item.status === "imported");
  const skipped = fileResults.filter((item) => item.status === "skipped");
  const failed = fileResults.filter((item) => item.status === "failed");
  const details = [...skipped, ...failed];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="medium" showCloseBtn anchorMain panelClassName="max-w-[680px]">
      <div className="px-8 pt-10 pb-8">
        <h2 className="typo-title-3 text-label-normal pr-10 font-bold">더미 데이터 가져오기 완료</h2>
        <p className="typo-body-2-normal text-label-assistant mt-2">
          <span className="text-label-normal font-semibold">{projectName}</span> 작업 공간에 가져온 결과입니다.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "API", value: summary?.apiCount ?? 0, color: "text-[#3478F6]" },
            { label: "더미 응답", value: summary?.responseCount ?? 0, color: "text-[#16A36A]" },
            { label: "건너뜀", value: skipped.length || summary?.skippedFileCount || 0, color: "text-[#9A6500]" },
            { label: "실패", value: failed.length, color: "text-label-negative" },
          ].map((item) => (
            <div key={item.label} className="border-border-enabled rounded-3 bg-background-white border px-4 py-4 text-center">
              <div className={`typo-title-3 font-bold ${item.color}`}>{item.value}</div>
              <div className="typo-caption-1 text-label-assistant mt-1">{item.label}</div>
            </div>
          ))}
        </div>

        <div className="bg-background-secondary-weak rounded-3 mt-5 px-4 py-3">
          <p className="typo-caption-1 text-label-neutral">
            Default {summary?.defaultCount ?? 0} · Test {summary?.testCount ?? 0} · Error {summary?.errorCount ?? 0}
            {summary?.metadataMappedApiCount != null ? ` · API 정보 연결 ${summary.metadataMappedApiCount}` : ""}
          </p>
        </div>

        {details.length > 0 ? (
          <details className="border-border-enabled mt-5 rounded-lg border">
            <summary className="typo-body-2-normal text-label-normal cursor-pointer px-4 py-3 font-semibold">
              건너뛰거나 실패한 파일 {details.length}개
            </summary>
            <div className="border-border-enabled max-h-48 space-y-3 overflow-y-auto border-t px-4 py-3">
              {details.map((item, index) => (
                <div key={`${item.fileName}-${index}`} className="min-w-0">
                  <p className={`typo-caption-1 truncate font-semibold ${item.status === "failed" ? "text-label-negative" : "text-[#9A6500]"}`} title={item.fileName}>
                    {item.status === "failed" ? "실패" : "건너뜀"} · {item.fileName}
                  </p>
                  {item.reason ? <p className="typo-caption-1 text-label-assistant mt-1">{item.reason}</p> : null}
                </div>
              ))}
            </div>
          </details>
        ) : fileResults.length > 0 && imported.length > 0 ? (
          <p className="typo-caption-1 mt-5 text-center text-[#16A36A]">선택한 파일을 모두 정상적으로 가져왔습니다.</p>
        ) : null}

        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <Btn category="secondary" variant width={100} onClick={onClose}>닫기</Btn>
          <Btn category="primary" width={180} onClick={onOpenProject}>가져온 데이터 보기</Btn>
        </div>
      </div>
    </Modal>
  );
}

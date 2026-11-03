"use client";

import { useEffect, useState, type JSX } from "react";

import CloseIcon from "@/assets/svg/CloseIcon";
import Btn from "@/components/common/Btn";
import Input from "@/components/common/Input";
import Modal from "@/components/common/Modal";
import { ConfirmModal, NoticeModal } from "@/components/common/modals";
import { clearRecentProxyRequests, getRecentProxyRequests, resetAllUserData } from "@/libs/projects/store";

interface DataSettingsCardProps {
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
}

export default function DataSettingsCard({ onClose, onBusyChange }: DataSettingsCardProps): JSX.Element {
  const [recentRequestCount, setRecentRequestCount] = useState(0);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [fullResetConfirmOpen, setFullResetConfirmOpen] = useState(false);
  const [fullResetInputOpen, setFullResetInputOpen] = useState(false);
  const [fullResetText, setFullResetText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getRecentProxyRequests().then((requests) => setRecentRequestCount(requests.length));
  }, []);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const clearRecentRequests = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const cleared = await clearRecentProxyRequests();
      setClearConfirmOpen(false);
      if (!cleared) {
        setNotice("최근 API 요청 기록을 지우지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setRecentRequestCount(0);
      setNotice("최근 API 요청 기록을 모두 지웠습니다.\n프로젝트와 더미 데이터는 그대로 유지됩니다.");
    } finally {
      setBusy(false);
    }
  };

  const resetAllData = async (): Promise<void> => {
    if (busy || fullResetText !== "초기화") return;
    setBusy(true);
    try {
      const result = await resetAllUserData();
      if (!result.ok) {
        const message = result.error.startsWith("restore-failed")
          ? "프로젝트 서버를 원래 포트로 복구하지 못해 전체 초기화를 중단했습니다. 프록시 연결 상태를 확인해 주세요."
          : `전체 사용자 데이터를 초기화하지 못했습니다. (${result.error})`;
        setFullResetInputOpen(false);
        setFullResetText("");
        setNotice(message);
        return;
      }
      setRecentRequestCount(0);
      setFullResetInputOpen(false);
      setFullResetText("");
      setNotice(result.restored
        ? "전체 사용자 데이터를 초기화하고 프로젝트 서버를 원래 포트로 복구했습니다."
        : "전체 사용자 데이터를 초기화했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full bg-white">
      <ConfirmModal
        isOpen={clearConfirmOpen}
        anchorMain
        title="최근 API 요청 기록을 지울까요?"
        message="저장된 최근 요청 기록이 모두 삭제되며 복구할 수 없습니다. 프로젝트와 더미 데이터에는 영향을 주지 않습니다."
        cancelLabel="취소"
        confirmLabel="기록 지우기"
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={clearRecentRequests}
      />
      <NoticeModal
        isOpen={notice != null}
        anchorMain
        message={notice ?? ""}
        onClose={() => setNotice(null)}
      />
      <ConfirmModal
        isOpen={fullResetConfirmOpen}
        anchorMain
        title="모든 사용자 데이터를 초기화할까요?"
        message={(
          <div className="space-y-2 text-left">
            <p>가져온 프로젝트, API, 더미 응답, 최근 요청 기록과 프록시 설정이 모두 삭제됩니다.</p>
            <p className="font-semibold text-red-700">삭제한 데이터는 복구할 수 없습니다.</p>
          </div>
        )}
        cancelLabel="취소"
        confirmLabel="계속"
        onClose={() => setFullResetConfirmOpen(false)}
        onConfirm={() => {
          setFullResetConfirmOpen(false);
          setFullResetText("");
          setFullResetInputOpen(true);
        }}
      />
      <Modal isOpen={fullResetInputOpen} onClose={busy ? undefined : () => setFullResetInputOpen(false)} size="small" anchorMain>
        <div className="px-8 py-10">
          <h2 className="typo-title-3 text-label-normal text-center font-bold">전체 초기화 확인</h2>
          <p className="typo-body-2-normal text-label-neutral mt-3 text-center">계속하려면 아래 입력란에 <strong>초기화</strong>를 입력해 주세요.</p>
          <div className="mt-6">
            <Input value={fullResetText} width="100%" size="medium" placeholder="초기화" disabled={busy} onChange={(event) => setFullResetText(event.target.value)} />
          </div>
          <div className="mt-8 flex justify-center gap-3">
            <Btn category="secondary" variant width={128} disabled={busy} onClick={() => setFullResetInputOpen(false)}>취소</Btn>
            <Btn category="primary" width={128} className="!bg-red-600 hover:!bg-red-700" disabled={busy || fullResetText !== "초기화"} onClick={() => void resetAllData()}>
              {busy ? "초기화 중" : "전체 초기화"}
            </Btn>
          </div>
        </div>
      </Modal>

      <header className="border-border-enabled flex items-start justify-between gap-3 border-b px-6 py-5">
        <div>
          <h2 className="typo-title-2 text-label-normal font-bold">데이터 및 설정 관리</h2>
          <p className="typo-body-2-normal text-label-assistant mt-1">필요한 기록이나 설정만 선택해서 초기화할 수 있습니다.</p>
        </div>
        <button type="button" disabled={busy} className="hover:bg-background-secondary-weak mt-1 cursor-pointer rounded p-1 text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40" aria-label="닫기" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>

      <div className="px-6 py-6">
        <section className="rounded-4 border-border-enabled flex items-center justify-between gap-5 border bg-white p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="typo-body-1-normal text-label-normal font-semibold">최근 API 요청 기록</h3>
              <span className="typo-caption-1 rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700">{recentRequestCount}개</span>
            </div>
            <p className="typo-body-2-normal text-label-assistant mt-2">최근 요청 패널에 보관된 기록만 삭제합니다. 프로젝트와 더미 응답은 유지됩니다.</p>
          </div>
          <Btn category="secondary" variant size="medium" width={120} disabled={busy || recentRequestCount === 0} onClick={() => setClearConfirmOpen(true)}>
            기록 지우기
          </Btn>
        </section>

        <section className="rounded-4 mt-4 flex items-center justify-between gap-5 border border-red-200 bg-red-50/40 p-5">
          <div className="min-w-0">
            <h3 className="typo-body-1-normal font-semibold text-red-900">전체 사용자 데이터 초기화</h3>
            <p className="typo-body-2-normal mt-2 text-red-800">모든 프로젝트, API, 더미 응답, 요청 기록과 프록시 설정을 삭제합니다.</p>
          </div>
          <Btn category="secondary" variant size="medium" width={120} className="!border-red-300 !text-red-700 hover:!bg-red-50" disabled={busy} onClick={() => setFullResetConfirmOpen(true)}>
            전체 초기화
          </Btn>
        </section>
      </div>
    </div>
  );
}

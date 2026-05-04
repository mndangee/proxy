"use client";

import { useEffect, useState } from "react";

import Btn from "@/components/common/Btn";
import Input from "@/components/common/Input";
import Modal from "@/components/common/Modal";
import { setAppProxyConfig } from "@/libs/projects/store";

export interface ImportProjectFollowupModalProps {
  isOpen: boolean;
  onClose: () => void;
  anchorMain?: boolean;
}

/** 프로젝트 가져오기 성공 후 — care mobility 더미 경로를 앱 설정에 연결 */
export default function ImportProjectFollowupModal({ isOpen, onClose, anchorMain = false }: ImportProjectFollowupModalProps) {
  const [mobilityPath, setMobilityPath] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) setMobilityPath("");
  }, [isOpen]);

  const handleSkip = () => {
    onClose();
  };

  const handleSave = async () => {
    const trimmed = mobilityPath.trim();
    if (!trimmed) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      const r = await setAppProxyConfig({ proxyServer: { careDummyMobilityPath: trimmed } });
      if (!r.ok) console.error("[ImportProjectFollowup] save path failed", r);
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleSkip} size="medium" showCloseBtn anchorMain={anchorMain}>
      <div className="px-8 pt-12 pb-8">
        <h2 className="typo-title-3 text-label-normal font-bold">프로젝트를 가져왔습니다</h2>
        <p className="typo-body-2-normal text-label-assistant mt-2">
          모의 서버에서 care mobility 트랜 더미(JSON)를 쓰려면 <code className="bg-gray-100 rounded px-1">server/dummy/mobility</code> 폴더
          경로를 입력한 뒤 경로 저장을 누르세요. 비어 있으면 저장 시 이 단계는 건너뜁니다(기존 경로 설정은 그대로).
        </p>

        <div className="mt-8">
          <div className="typo-caption-1 text-label-assistant mb-2">care mobility 더미 폴더 (선택)</div>
          <Input
            value={mobilityPath}
            width="100%"
            size="medium"
            placeholder="~/git/care/server/dummy/mobility"
            disabled={busy}
            onChange={(e) => setMobilityPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSave();
            }}
          />
          <p className="typo-caption-1 text-label-assistant mt-2">
            절대 경로 또는 <code className="bg-gray-100 rounded px-1">~/</code> 기준. 프로젝트 응답 스토어에 없을 때{" "}
            <code className="bg-gray-100 rounded px-1">/api/VD.MOVS0001</code> 등으로 해당 JSON을 찾습니다.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Btn category="secondary" variant width={120} disabled={busy} onClick={handleSkip}>
            건너뛰기
          </Btn>
          <Btn category="primary" width={140} disabled={busy} onClick={() => void handleSave()}>
            경로 저장 후 닫기
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

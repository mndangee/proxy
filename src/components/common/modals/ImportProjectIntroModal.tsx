"use client";

// Components
import Btn from "@/components/common/Btn";
import Modal from "@/components/common/Modal";

export interface ImportProjectIntroModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 안내 확인 후 — 시스템 파일·폴더 선택 및 가져오기 진행 */
  onContinue: () => void;
}

export default function ImportProjectIntroModal({ isOpen, onClose, onContinue }: ImportProjectIntroModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="medium"
      showCloseBtn
      anchorMain
      panelClassName="max-w-[500px]"
    >
      <div className="flex flex-col">
        <header className="px-7 pt-7 pr-14">
          <h2 id="import-project-intro-title" className="typo-title-3 text-label-strong font-bold">
            더미 데이터 가져오기
          </h2>
        </header>

        <div className="typo-body-2-normal px-7 pt-4 pb-6 leading-relaxed">
          <p className="text-label-normal">파일이나 폴더를 선택하면 구조를 분석해 API별 더미 응답으로 구성합니다.</p>

          <div className="border-border-enabled rounded-3 mt-5 divide-y border">
            <div className="px-4 py-3">
              <p className="text-label-normal font-semibold">DataForge 백업</p>
              <p className="typo-caption-1 text-label-assistant mt-1">내보낸 ZIP 또는 project.json이 포함된 데이터</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-label-normal font-semibold">JSON 응답 데이터</p>
              <p className="typo-caption-1 text-label-assistant mt-1">일반 JSON 파일·폴더 또는 서버 더미 데이터 폴더</p>
            </div>
          </div>

          <div className="bg-background-secondary-weak rounded-3 mt-4 px-4 py-3">
            <p className="typo-caption-1 text-label-assistant leading-relaxed">
              같은 트랜의 서버 더미는 여러 응답으로 묶고 Default·Test·Error 라벨을 자동 분류합니다. 원본은 변경하지 않으며, 읽을 수 없는
              파일은 가져오기 결과에서 알려드립니다.
            </p>
          </div>

          <p className="typo-caption-1 text-label-assistant mt-4">가져온 데이터는 하나의 작업 공간으로 묶어 저장됩니다.</p>
        </div>

        <footer className="border-border-enabled border-t bg-gray-50 px-7 py-4">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Btn category="secondary" variant width={120} onClick={onClose}>
              취소
            </Btn>
            <Btn category="primary" width={168} onClick={onContinue}>
              파일·폴더 선택
            </Btn>
          </div>
        </footer>
      </div>
    </Modal>
  );
}

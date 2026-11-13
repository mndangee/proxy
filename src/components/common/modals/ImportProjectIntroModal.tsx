"use client";

"use client";

import { useState } from "react";

// Components
import Btn from "@/components/common/Btn";
import CheckBox, { type checkBoxObjectType } from "@/components/common/CheckBox";
import Modal from "@/components/common/Modal";

export interface ImportProjectIntroModalProps {
  isOpen: boolean;
  onClose: () => void;
  compact?: boolean;
  /** 가져오기 원본 형태를 선택한 뒤 시스템 선택창을 엽니다. */
  onContinue: (sourceKind: "file" | "folder", skipNextTime: boolean) => void;
}

const SKIP_NEXT_TIME_KEY = "skip-next-time";

export default function ImportProjectIntroModal({ isOpen, onClose, compact = false, onContinue }: ImportProjectIntroModalProps) {
  const [skipNextTime, setSkipNextTime] = useState<checkBoxObjectType>({ [SKIP_NEXT_TIME_KEY]: true });

  const resetAndClose = () => {
    setSkipNextTime({ [SKIP_NEXT_TIME_KEY]: true });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={resetAndClose}
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

          {!compact ? <div className="border-border-enabled rounded-3 mt-5 divide-y border">
            <div className="px-4 py-3">
              <p className="text-label-normal font-semibold">DataForge 백업</p>
              <p className="typo-caption-1 text-label-assistant mt-1">내보낸 ZIP 또는 project.json이 포함된 데이터</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-label-normal font-semibold">JSON 응답 데이터</p>
              <p className="typo-caption-1 text-label-assistant mt-1">일반 JSON 파일·폴더 또는 서버 더미 데이터 폴더</p>
            </div>
          </div> : null}

          {!compact ? <div className="bg-background-secondary-weak rounded-3 mt-4 px-4 py-3">
            <p className="typo-caption-1 text-label-assistant leading-relaxed">
              같은 트랜의 서버 더미는 여러 응답으로 묶고 Default·Test·Error 라벨을 자동 분류합니다. 원본은 변경하지 않으며, 읽을 수 없는
              파일은 가져오기 결과에서 알려드립니다.
            </p>
          </div> : null}

          {!compact ? <p className="typo-caption-1 text-label-assistant mt-4">가져온 데이터는 하나의 작업 공간으로 묶어 저장됩니다.</p> : null}
          {!compact ? <CheckBox
            className="mt-5"
            category="checkbox"
            size="small"
            label="다음부터 설명 간단히 보기"
            value={SKIP_NEXT_TIME_KEY}
            checkBoxStateList={skipNextTime}
            setCheckBoxStateList={setSkipNextTime}
          /> : null}
        </div>

        <footer className="border-border-enabled border-t bg-gray-50 px-7 py-4">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Btn
              category="secondary"
              variant
              width={180}
              onClick={() => {
                const shouldSkip = Boolean(skipNextTime[SKIP_NEXT_TIME_KEY]);
                setSkipNextTime({ [SKIP_NEXT_TIME_KEY]: true });
                onContinue("file", shouldSkip);
              }}
            >
              JSON·ZIP 파일 가져오기
            </Btn>
            <Btn
              category="primary"
              width={140}
              onClick={() => {
                const shouldSkip = Boolean(skipNextTime[SKIP_NEXT_TIME_KEY]);
                setSkipNextTime({ [SKIP_NEXT_TIME_KEY]: true });
                onContinue("folder", shouldSkip);
              }}
            >
              폴더 가져오기
            </Btn>
          </div>
        </footer>
      </div>
    </Modal>
  );
}

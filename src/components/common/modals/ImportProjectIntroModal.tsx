"use client";

import type { ReactNode } from "react";

// Components
import Btn from "@/components/common/Btn";
import Modal from "@/components/common/Modal";

export interface ImportProjectIntroModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 안내 확인 후 — 시스템 파일·폴더 선택 및 가져오기 진행 */
  onContinue: () => void;
}

function FileTag({ children }: { children: ReactNode }) {
  return (
    <code className="typo-caption-1 bg-background-secondary-weak text-label-normal rounded px-1.5 py-0.5 font-medium">{children}</code>
  );
}

const FORMAT_ITEMS: { title: string; body: ReactNode }[] = [
  {
    title: "프로젝트 ZIP",
    body: (
      <>
        앱에서 내보낸 ZIP이거나, 루트에 <FileTag>project.json</FileTag>이 포함된 폴더를 통째로 압축한 파일입니다.
      </>
    ),
  },
  {
    title: "프로젝트 폴더",
    body: (
      <>
        최상위에 <FileTag>project.json</FileTag>이 있는 프로젝트 디렉터리 전체를 선택합니다.
      </>
    ),
  },
  {
    title: "project.json 파일",
    body: <>폴더 대신 <FileTag>project.json</FileTag> 파일만 골라도, 그 프로젝트로 인식합니다.</>,
  },
  {
    title: "JSON만 있는 폴더",
    body: (
      <>
        <FileTag>project.json</FileTag> 없이 응답용 <FileTag>.json</FileTag>만 모여 있으면 새 프로젝트로 묶어 가져옵니다. 형식이 맞지 않으면 오류 메시지로 안내합니다.
      </>
    ),
  },
];

export default function ImportProjectIntroModal({ isOpen, onClose, onContinue }: ImportProjectIntroModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="medium" showCloseBtn anchorMain>
      <div className="px-8 py-8 md:px-10 md:py-10">
        <h2 className="typo-title-3 text-label-normal font-bold">프로젝트 가져오기</h2>

        <div className="typo-body-2-normal text-label-assistant mt-4 space-y-3 leading-relaxed">
          <p>
            아래 네 가지 중 사용할 수 있는 형식을 준비한 뒤,{" "}
            <strong className="text-label-normal">「파일·폴더 선택」</strong>을 누르세요. 시스템 파일 창에서 ZIP, 폴더, 또는 JSON 파일을 고를 수 있습니다.
          </p>
          <p>
            가져온 내용은 앱 사용자 데이터 아래 <strong className="text-label-normal">DataForge-projects</strong> 폴더로 복사됩니다.
          </p>
        </div>

        <div className="mt-6">
          <p className="typo-body-2-normal text-label-normal font-semibold">가져올 수 있는 형식</p>
          <ul className="mt-3 list-none space-y-5 pl-0">
            {FORMAT_ITEMS.map((item) => (
              <li key={item.title}>
                <div className="typo-body-2-normal text-label-normal font-semibold">{item.title}</div>
                <p className="typo-body-2-normal text-label-assistant mt-1.5 leading-relaxed">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>

        <p className="typo-caption-1 text-label-assistant mt-6 leading-relaxed">
          웹 브라우저만으로 실행 중이면 가져오기를 사용할 수 없습니다. DataForge(Electron) 앱에서 진행해 주세요.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
          <Btn category="secondary" variant width={120} onClick={onClose}>
            취소
          </Btn>
          <Btn category="primary" width={160} onClick={onContinue}>
            파일·폴더 선택
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

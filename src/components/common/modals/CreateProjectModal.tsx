"use client";

// React
import { useState } from "react";

// Components
import Btn from "@/components/common/Btn";
import CheckBox, { type checkBoxObjectType } from "@/components/common/CheckBox";
import Input from "@/components/common/Input";
import Modal from "@/components/common/Modal";
import TextArea from "@/components/common/TextArea";

import NoticeModal from "./NoticeModal";

// Libs
import { addProject, formatAddProjectUserError } from "@/libs/projects/store";

const FAVORITE_CHECK_KEY = "favorite";

export interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
  /** LNB에서 열 때 등: `#app-main` 기준 가운데 */
  anchorMain?: boolean;
}

export default function CreateProjectModal({ isOpen, onClose, onCreated, anchorMain = false }: CreateProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [favoriteCheckState, setFavoriteCheckState] = useState<checkBoxObjectType>({ [FAVORITE_CHECK_KEY]: false });
  const [nameError, setNameError] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");

  const reset = () => {
    setName("");
    setDescription("");
    setFavoriteCheckState({ [FAVORITE_CHECK_KEY]: false });
    setNameError(false);
    setNoticeOpen(false);
    setNoticeMessage("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(true);
      return;
    }
    try {
      const result = await addProject({
        name: trimmed,
        description,
        isFavorite: Boolean(favoriteCheckState[FAVORITE_CHECK_KEY]),
      });
      if (!result.ok) {
        setNoticeMessage(formatAddProjectUserError(result.error));
        setNoticeOpen(true);
        return;
      }
      reset();
      onCreated?.();
      onClose();
    } catch (e) {
      console.error(e);
      setNoticeMessage("프로젝트 저장 중 오류가 났습니다.");
      setNoticeOpen(true);
    }
  };

  return (
    <>
      <NoticeModal isOpen={noticeOpen} onClose={() => setNoticeOpen(false)} message={noticeMessage} />
      <Modal isOpen={isOpen} onClose={handleClose} size="medium" showCloseBtn anchorMain={anchorMain}>
        <div className="px-8 pt-12 pb-8">
          <h2 className="typo-title-3 text-label-normal font-bold">새 프로젝트</h2>
          <p className="typo-body-2-normal text-label-assistant mt-2">이름과 설명을 입력하고 저장하면 목록에 반영됩니다.</p>

          <div className="mt-8 space-y-6">
            <div>
              <div className="typo-caption-1 text-label-assistant mb-2">프로젝트 이름</div>
              <Input
                value={name}
                placeholder="예: User Auth API"
                width="100%"
                error={nameError}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(false);
                }}
              />
              {nameError ? <p className="typo-caption-1 text-label-negative mt-2">프로젝트 이름을 입력해 주세요.</p> : null}
            </div>

            <div>
              <div className="typo-caption-1 text-label-assistant mb-2">프로젝트 설명</div>
              <TextArea value={description} placeholder="프로젝트에 대한 간단한 설명" width="100%" onChange={(e) => setDescription(e.target.value)} />
            </div>

            <CheckBox
              category="checkbox"
              size="small"
              label="즐겨찾기에 추가"
              value={FAVORITE_CHECK_KEY}
              checkBoxStateList={favoriteCheckState}
              setCheckBoxStateList={setFavoriteCheckState}
            />
          </div>

          <div className="mt-10 flex justify-center gap-3">
            <Btn category="secondary" variant width={100} onClick={handleClose}>
              취소
            </Btn>
            <Btn category="primary" width={120} onClick={() => void handleSubmit()}>
              만들기
            </Btn>
          </div>
        </div>
      </Modal>
    </>
  );
}

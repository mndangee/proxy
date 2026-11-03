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
import ConfirmModal from "./ConfirmModal";

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
  const [busy, setBusy] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  const reset = () => {
    setName("");
    setDescription("");
    setFavoriteCheckState({ [FAVORITE_CHECK_KEY]: false });
    setNameError(false);
    setNoticeOpen(false);
    setNoticeMessage("");
    setBusy(false);
    setDiscardConfirmOpen(false);
  };

  const closeImmediately = () => {
    reset();
    onClose();
  };

  const handleClose = () => {
    if (busy) return;
    const hasInput = Boolean(name.trim() || description.trim() || favoriteCheckState[FAVORITE_CHECK_KEY]);
    if (hasInput) {
      setDiscardConfirmOpen(true);
      return;
    }
    closeImmediately();
  };

  const handleSubmit = async () => {
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(true);
      return;
    }
    setBusy(true);
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
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <NoticeModal isOpen={noticeOpen} onClose={() => setNoticeOpen(false)} message={noticeMessage} />
      <ConfirmModal
        isOpen={discardConfirmOpen}
        anchorMain={anchorMain}
        title="작성 중인 내용을 지울까요?"
        message="입력한 프로젝트 정보가 저장되지 않습니다."
        cancelLabel="계속 작성"
        confirmLabel="내용 지우기"
        onClose={() => setDiscardConfirmOpen(false)}
        onConfirm={closeImmediately}
      />
      <Modal isOpen={isOpen} onClose={busy ? undefined : handleClose} size="medium" showCloseBtn={!busy} anchorMain={anchorMain}>
        <div className="px-8 pt-12 pb-8">
          <h2 className="typo-title-3 text-label-normal font-bold">빈 프로젝트 만들기</h2>
          <p className="typo-body-2-normal text-label-assistant mt-2">직접 API와 더미 응답을 등록할 빈 작업 공간을 만듭니다.</p>

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
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSubmit();
                  }
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
            <Btn category="secondary" variant width={100} disabled={busy} onClick={handleClose}>
              취소
            </Btn>
            <Btn category="primary" width={120} disabled={busy} onClick={() => void handleSubmit()}>
              {busy ? "만드는 중..." : "만들기"}
            </Btn>
          </div>
        </div>
      </Modal>
    </>
  );
}

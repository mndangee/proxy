"use client";

// React
import { useEffect, useState, type ReactNode } from "react";

// Components
import Btn from "@/components/common/Btn";
import DropDown from "@/components/common/DropDown";
import Input from "@/components/common/Input";
import Modal from "@/components/common/Modal";
import { NoticeModal } from "@/components/common/modals";
import TextArea from "@/components/common/TextArea";

// Libs
import { addProjectApiEndpoint, formatAddApiUserError, updateProjectApiEndpoint } from "@/libs/projects/store";

// Types
import type { ApiEndpoint } from "@/types";
import type { Project } from "@/types";

const METHOD_OPTIONS = [
  { value: "GET", type: "GET" },
  { value: "POST", type: "POST" },
  { value: "PUT", type: "PUT" },
  { value: "PATCH", type: "PATCH" },
  { value: "DELETE", type: "DELETE" },
];

function methodOption(method: string) {
  return METHOD_OPTIONS.find((o) => o.type === method.toUpperCase()) ?? METHOD_OPTIONS[0];
}

export interface RegisterApiModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onRegistered?: () => void;
  initialEndpoint?: ApiEndpoint | null;
}

export default function RegisterApiModal({ isOpen, onClose, project, onRegistered, initialEndpoint }: RegisterApiModalProps) {
  const isEdit = Boolean(initialEndpoint?.id);
  const [method, setMethod] = useState<{ value: string; type: string }>(METHOD_OPTIONS[0]);
  const [apiName, setApiName] = useState("");
  const [trans, setTrans] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState(false);
  const [transError, setTransError] = useState(false);
  const [descriptionError, setDescriptionError] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");

  const reset = () => {
    setMethod(METHOD_OPTIONS[0]);
    setApiName("");
    setTrans("");
    setDescription("");
    setNameError(false);
    setTransError(false);
    setDescriptionError(false);
    setNoticeOpen(false);
    setNoticeMessage("");
  };

  useEffect(() => {
    if (!isOpen) return;
    if (initialEndpoint?.id) {
      setMethod(methodOption(initialEndpoint.method));
      setApiName(initialEndpoint.name);
      setTrans(initialEndpoint.tran ?? "");
      setDescription(initialEndpoint.description ?? "");
      setNameError(false);
      setTransError(false);
      setDescriptionError(false);
    } else {
      setMethod(METHOD_OPTIONS[0]);
      setApiName("");
      setTrans("");
      setDescription("");
      setNameError(false);
      setTransError(false);
      setDescriptionError(false);
    }
    setNoticeOpen(false);
    setNoticeMessage("");
  }, [isOpen, initialEndpoint?.id, initialEndpoint?.tran, initialEndpoint?.name, initialEndpoint?.method, initialEndpoint?.description]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    const n = apiName.trim();
    const transTrim = trans.trim();
    const desc = description.trim();
    let invalid = false;
    if (!n) {
      setNameError(true);
      invalid = true;
    } else {
      setNameError(false);
    }
    if (!transTrim) {
      setTransError(true);
      invalid = true;
    } else {
      setTransError(false);
    }
    if (!desc) {
      setDescriptionError(true);
      invalid = true;
    } else {
      setDescriptionError(false);
    }
    if (invalid) return;
    const body = {
      method: method.type,
      tran: transTrim,
      description: desc,
      name: n,
    };
    const res = isEdit ? await updateProjectApiEndpoint(project.id, initialEndpoint!.id, body) : await addProjectApiEndpoint(project.id, body);
    if (!res.ok) {
      setNoticeMessage(formatAddApiUserError(res.error));
      setNoticeOpen(true);
      return;
    }
    reset();
    onRegistered?.();
    onClose();
  };

  return (
    <>
      <NoticeModal isOpen={noticeOpen} onClose={() => setNoticeOpen(false)} message={noticeMessage} />
      <Modal isOpen={isOpen} onClose={handleClose} size="medium" showCloseBtn anchorMain>
        <div className="px-8 pt-12 pb-8">
          <h2 className="typo-title-3 text-label-normal font-bold">{isEdit ? "API 수정" : "API 등록"}</h2>
          <p className="typo-body-2-normal text-label-assistant mt-2">표시된 필수 항목을 입력하면 프로젝트 폴더의 apis/index.json에 반영됩니다.</p>

          <div className="mt-8 space-y-6">
            <div className="flex flex-row items-start gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <RequiredLabel>API 이름</RequiredLabel>
                <Input
                  value={apiName}
                  placeholder="예: goPinCertRequest"
                  width="100%"
                  error={nameError}
                  onChange={(e) => {
                    setApiName(e.target.value);
                    if (nameError) setNameError(false);
                  }}
                />
                {nameError ? <p className="typo-caption-1 text-label-negative mt-2">API 이름을 입력해 주세요.</p> : null}
              </div>
              <div className="w-[200px] shrink-0">
                <DropDown
                  label="HTTP 메서드"
                  size="medium"
                  width="100%"
                  labelPosition="vertical"
                  data={METHOD_OPTIONS}
                  checkedData={method}
                  setCheckedData={setMethod}
                  placeHolder="선택"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <RequiredLabel>트랜 이름</RequiredLabel>
              <Input
                value={trans}
                placeholder="예: VD.MOVS0001"
                width="100%"
                error={transError}
                onChange={(e) => {
                  setTrans(e.target.value);
                  if (transError) setTransError(false);
                }}
              />
              {transError ? <p className="typo-caption-1 text-label-negative mt-2">트랜 이름을 입력해 주세요.</p> : null}
            </div>

            <div className="flex flex-col gap-3">
              <RequiredLabel>API 설명</RequiredLabel>
              <TextArea
                value={description}
                placeholder="이 API의 역할을 간단히 적어 주세요."
                width="100%"
                error={descriptionError}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (descriptionError) setDescriptionError(false);
                }}
              />
              {descriptionError ? <p className="typo-caption-1 text-label-negative mt-2">API 설명을 입력해 주세요.</p> : null}
            </div>
          </div>

          <div className="mt-10 flex justify-center gap-3">
            <Btn category="secondary" variant width={100} onClick={handleClose}>
              취소
            </Btn>
            <Btn category="primary" width={100} onClick={() => void handleSubmit()}>
              {isEdit ? "저장" : "등록"}
            </Btn>
          </div>
        </div>
      </Modal>
    </>
  );
}

function RequiredLabel({ children }: { children: ReactNode }) {
  return (
    <div className="typo-body-2-normal font-medium text-neutral-500">
      {children}
      <span className="typo-caption-1 ml-1 font-semibold text-red-500">*</span>
    </div>
  );
}

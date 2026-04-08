"use client";

// React
import { useEffect, useRef, useState } from "react";

// Components
import Btn from "@/components/common/Btn";
import DropDown from "@/components/common/DropDown";
import Input from "@/components/common/Input";
import Modal from "@/components/common/Modal";
import TextArea from "@/components/common/TextArea";

// Libs
import { API_RESPONSE_TYPE_OPTIONS, type ApiResponseEditorTypeKey, tryParseApiResponseExportBundle } from "@/libs/datadummy/api";

export interface ApiJsonImportConfirmPayload {
  label: string;
  description: string;
  editorType: ApiResponseEditorTypeKey;
  configuration: string;
}

export interface ApiJsonImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: ApiJsonImportConfirmPayload) => void | Promise<void>;
  /** 제목·번들에 없을 때 최종 폴백 */
  defaultTitle?: string;
}

export default function ApiJsonImportModal({ isOpen, onClose, onConfirm, defaultTitle = "가져온 응답" }: ApiJsonImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [responseType, setResponseType] = useState<(typeof API_RESPONSE_TYPE_OPTIONS)[number]>(API_RESPONSE_TYPE_OPTIONS[0]);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setDescription("");
    setResponseType(API_RESPONSE_TYPE_OPTIONS[0]);
    setRaw("");
    setError(null);
    setBusy(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [isOpen]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setResponseType(API_RESPONSE_TYPE_OPTIONS[0]);
    setRaw("");
    setError(null);
    setBusy(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const applyBundleFromText = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const parsed = JSON.parse(trimmed) as unknown;
    const inner = tryParseApiResponseExportBundle(parsed);
    if (inner) {
      setTitle(inner.title);
      setDescription(inner.description);
      setResponseType(API_RESPONSE_TYPE_OPTIONS.find((x) => x.type === inner.editorType) ?? API_RESPONSE_TYPE_OPTIONS[0]);
      setRaw(inner.configuration);
      setError(null);
      return;
    }
    setRaw(JSON.stringify(parsed, null, 2));
    setError(null);
  };

  const handleFile = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      try {
        applyBundleFromText(text);
      } catch {
        setError("올바른 JSON 형식인지 확인해 주세요.");
      }
    };
    reader.onerror = () => setError("파일을 읽지 못했습니다.");
    reader.readAsText(file, "UTF-8");
  };

  const handleSubmit = async () => {
    setError(null);
    const trimmed = raw.trim();
    if (!trimmed) {
      setError("JSON 내용을 붙여넣거나 파일을 선택해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const inner = tryParseApiResponseExportBundle(parsed);

      let configuration: string;
      let label: string;
      let desc: string;
      let editorType: ApiResponseEditorTypeKey;

      if (inner) {
        configuration = inner.configuration;
        label = title.trim() || inner.title || defaultTitle;
        desc = description.trim() || inner.description;
        editorType = responseType.type;
      } else {
        configuration = JSON.stringify(parsed, null, 2);
        label = title.trim() || defaultTitle;
        desc = description.trim();
        editorType = responseType.type;
      }

      await onConfirm({ label, description: desc, editorType, configuration });
      reset();
      onClose();
    } catch (e) {
      if (e instanceof SyntaxError) {
        setError("올바른 JSON 형식인지 확인해 주세요.");
      } else {
        setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="medium" showCloseBtn anchorMain>
      <div className="px-8 pt-10 pb-8">
        <h2 className="typo-heading-2 text-label-normal pr-10 font-bold">JSON 응답 추가</h2>
        <p className="typo-body-2-normal text-label-assistant mt-2">
          추출한 JSON 파일 형식({`{ title, description, type, configuration }`})을 그대로 선택하거나 붙여 넣을 수 있습니다. 본문만 넣는 경우 아래 제목·설명·TYPE을 직접 입력하면
          됩니다.
        </p>

        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-[180px] shrink-0">
              <DropDown
                label="TYPE"
                size="medium"
                width="100%"
                backgroundClassName="!bg-background-white"
                data={API_RESPONSE_TYPE_OPTIONS}
                checkedData={responseType}
                setCheckedData={setResponseType}
                placeHolder="선택"
              />
            </div>
            <div className="min-w-[200px] flex-1">
              <div className="typo-caption-1 text-label-assistant mb-2">제목</div>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} width="100%" placeholder="번들의 title 또는 직접 입력" />
            </div>
          </div>

          <div>
            <div className="typo-caption-1 text-label-assistant mb-2">응답 설명</div>
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} width="100%" placeholder="번들의 description 또는 직접 입력" />
          </div>

          <div>
            <div className="typo-caption-1 text-label-assistant mb-2">응답 본문 (configuration JSON)</div>
            <textarea
              className="typo-body-2-normal border-border-enabled focus:border-brand-500 rounded-2 bg-background-white min-h-[200px] w-full resize-y border p-4 font-mono outline-none"
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setError(null);
              }}
              placeholder={'{ } 또는 전체 번들 { "title", "description", "type", "configuration" }'}
              spellCheck={false}
            />
          </div>

          <div>
            <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => handleFile(e.target.files)} />
            <Btn category="secondary" variant size="medium" width={160} onClick={() => fileInputRef.current?.click()}>
              JSON 파일 선택
            </Btn>
          </div>

          {error && <p className="typo-caption-1 text-label-negative">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Btn category="secondary" variant size="medium" width={100} disabled={busy} onClick={handleClose}>
              취소
            </Btn>
            <Btn category="primary" size="medium" width={120} disabled={busy} onClick={() => void handleSubmit()}>
              추가
            </Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}

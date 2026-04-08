"use client";

// React
import { useMemo, useState } from "react";

// Components
import Btn from "@/components/common/Btn";
import DropDown from "@/components/common/DropDown";
import Input from "@/components/common/Input";
import TextArea from "@/components/common/TextArea";
import Navigation from "@/components/shared/Navigation";
import { NoticeModal } from "@/components/common/modals";

// Libs
import { API_RESPONSE_TYPE_OPTIONS, getApiResponseItem, markRegisteredApiJsonResponse, setStoredActiveApiResponse } from "@/libs/datadummy/api";
import { formatSaveApiResponseUserError, getProjectForApiName, upsertSavedApiResponse } from "@/libs/projects/store";
import { slugify } from "@/libs/datadummy/home";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightJson(value: string) {
  const escaped = escapeHtml(value);

  return escaped.replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g, (match, stringToken, keySuffix, keywordToken, numberToken) => {
    if (stringToken) {
      if (keySuffix) {
        return `<span class="text-blue-600">${stringToken}</span>${keySuffix}`;
      }
      return `<span class="text-green-600">${stringToken}</span>`;
    }
    if (keywordToken) {
      return `<span class="text-orange-500">${keywordToken}</span>`;
    }
    if (numberToken) {
      return `<span class="text-purple-600">${numberToken}</span>`;
    }
    return match;
  });
}

function createFileName(title: string) {
  const trimmed = title.trim();
  const safeTitle = trimmed.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  return `${safeTitle || "resource"}.json`;
}

const JSON_FORMAT_ALERT_MESSAGE = "형식이 올바른 JSON이 아닙니다. 응답 에디터 내용을 확인해 주세요.";

function isValidConfigurationJson(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function EditableCodeEditor({ value, onChange }: { value: string; onChange: (nextValue: string) => void }) {
  const lines = useMemo(() => value.split("\n"), [value]);

  return (
    <div className="rounded-4 border-border-week bg-background-white overflow-hidden border">
      <div className="grid grid-cols-[56px_minmax(0,1fr)]">
        <div className="bg-background-secondary-weak border-border-week typo-caption-1 text-label-assistant border-r px-4 py-5 text-right">
          {lines.map((_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>
        <div className="relative min-h-[420px]">
          <pre
            className="typo-body-2-normal pointer-events-none min-h-[420px] overflow-auto p-5 font-mono leading-6 break-words whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: `${highlightJson(value)}\n` }}
          />
          <textarea
            className="typo-body-2-normal caret-label-normal absolute inset-0 min-h-[420px] w-full resize-none bg-transparent p-5 font-mono leading-6 text-transparent outline-none"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;

              event.preventDefault();

              const target = event.currentTarget;
              const start = target.selectionStart;
              const end = target.selectionEnd;

              if (event.shiftKey) {
                const removableStart = Math.max(0, start - 4);
                const removableText = value.slice(removableStart, start);

                if (removableText === "    ") {
                  const nextValue = `${value.slice(0, removableStart)}${value.slice(end)}`;

                  onChange(nextValue);

                  requestAnimationFrame(() => {
                    target.selectionStart = removableStart;
                    target.selectionEnd = removableStart;
                  });
                }

                return;
              }

              const nextValue = `${value.slice(0, start)}    ${value.slice(end)}`;

              onChange(nextValue);

              requestAnimationFrame(() => {
                target.selectionStart = start + 4;
                target.selectionEnd = start + 4;
              });
            }}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}

export default function ApiJsonPage() {
  const responseTypeOptions = [
    { value: "기본", type: "default" },
    { value: "테스트", type: "test" },
    { value: "에러", type: "error" },
  ];
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const editorState = searchParams?.get("state") ?? null;
  const sourceApiName = searchParams?.get("apiName") ?? "";
  const sourceType = searchParams?.get("type") ?? "default";
  const responseValue = searchParams?.get("responseValue") ?? null;
  const jsonNavProject = sourceApiName ? getProjectForApiName(sourceApiName) : null;
  const jsonNavActiveProjectSlug = jsonNavProject ? slugify(jsonNavProject.name) : null;
  const isNewState = editorState === "new";
  const selectedResponse = !isNewState && sourceApiName ? getApiResponseItem(sourceApiName, responseValue) : null;
  const initialResourceTitle = isNewState ? "" : (selectedResponse?.label ?? "System.Node.Initialize_MADD0641");
  const initialDescription = isNewState ? "" : (selectedResponse?.description ?? "This resource definition for VDMADD0641 manages node distribution parameters.");
  const initialConfiguration = isNewState
    ? ""
    : (selectedResponse?.configuration ??
      `{
  "resource_id": "VD_MADD0641"
}`);
  const [resourceTitle, setResourceTitle] = useState(initialResourceTitle);
  const [description, setDescription] = useState(initialDescription);
  const [configuration, setConfiguration] = useState(initialConfiguration);
  const [responseType, setResponseType] = useState<(typeof API_RESPONSE_TYPE_OPTIONS)[number]>(
    API_RESPONSE_TYPE_OPTIONS.find((option) => option.type === sourceType) ?? API_RESPONSE_TYPE_OPTIONS[0],
  );
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");
  const [noticeNavigateApi, setNoticeNavigateApi] = useState<string | null>(null);

  const showNotice = (message: string, navigateToApiAfterClose?: string | null) => {
    setNoticeMessage(message);
    setNoticeNavigateApi(navigateToApiAfterClose ?? null);
    setNoticeOpen(true);
  };

  const closeNotice = () => {
    const nav = noticeNavigateApi;
    setNoticeOpen(false);
    setNoticeNavigateApi(null);
    if (nav) window.location.href = `/api/${encodeURIComponent(nav)}`;
  };

  const saveResponse = async () => {
    const apiKey = sourceApiName.trim();
    if (!apiKey) {
      showNotice("API 이름이 없습니다.");
      return;
    }
    if (!isValidConfigurationJson(configuration)) {
      window.alert(JSON_FORMAT_ALERT_MESSAGE);
      return;
    }
    const project = getProjectForApiName(apiKey);
    if (!project) {
      showNotice("프로젝트에 등록된 API를 찾을 수 없습니다.");
      return;
    }
    const editorType = responseType.type === "test" ? "test" : responseType.type === "error" ? "error" : "default";
    const valueForUpsert = isNewState ? null : responseValue;
    const result = await upsertSavedApiResponse(project.id, apiKey, {
      value: valueForUpsert,
      label: resourceTitle.trim() || apiKey,
      description: description.trim(),
      editorType,
      configuration,
    });
    if (!result.ok) {
      showNotice(formatSaveApiResponseUserError(result.error));
      return;
    }
    markRegisteredApiJsonResponse(apiKey);
    showNotice("저장이 완료되었습니다.", apiKey);
  };

  const useAsResponse = () => {
    if (!sourceApiName) return;
    if (!isValidConfigurationJson(configuration)) {
      window.alert(JSON_FORMAT_ALERT_MESSAGE);
      return;
    }

    setStoredActiveApiResponse(sourceApiName, {
      apiName: sourceApiName,
      responseValue,
      type: responseType.type as "default" | "test" | "error",
      title: resourceTitle || sourceApiName,
      description: description || "사용중",
      configuration,
    });
    markRegisteredApiJsonResponse(sourceApiName);

    window.location.href = `/api/${encodeURIComponent(sourceApiName)}`;
  };

  const exportJson = () => {
    if (!isValidConfigurationJson(configuration)) {
      window.alert(JSON_FORMAT_ALERT_MESSAGE);
      return;
    }
    const parsedConfiguration = JSON.parse(configuration.trim());
    const exportPayload = {
      title: resourceTitle,
      description,
      type: responseType.value,
      configuration: parsedConfiguration,
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = createFileName(resourceTitle);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-screen w-full min-w-0 overflow-x-hidden">
      <NoticeModal isOpen={noticeOpen} onClose={closeNotice} message={noticeMessage} />
      <Navigation
        activeProjectSlug={jsonNavActiveProjectSlug}
        currentApiName={sourceApiName || null}
        jsonEditorApiName={sourceApiName || null}
        onNewProject={() => (window.location.href = "/")}
      />

      <div id="app-main" className="relative flex min-h-full min-w-0 flex-1 flex-col overflow-x-hidden">
        <div className="border-border-enabled bg-background-white border-b px-6 py-6">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-1">
            <button
              type="button"
              onClick={() => {
                const key = sourceApiName.trim();
                if (key) {
                  window.location.href = `/api/${encodeURIComponent(key)}`;
                  return;
                }
                window.history.back();
              }}
              className="typo-caption-1 text-label-assistant hover:text-label-normal w-fit cursor-pointer text-left transition-colors"
            >
              ← API 상세로 돌아가기
            </button>
            <div className="typo-title-2 text-label-normal font-bold">{isNewState ? sourceApiName || "New JSON Resource" : "VD.MADD0641"}</div>
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-auto px-6 py-8">
          <div className="mx-auto flex w-full max-w-[1600px] justify-center">
            <div className="flex w-full flex-col gap-6">
              <section className="rounded-4 border-border-enabled bg-background-white border p-6">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-1 items-end gap-4">
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

                    <div className="w-[520px] max-w-full">
                      <div className="typo-caption-1 text-label-assistant mb-2">제목</div>
                      <Input value={resourceTitle} onChange={(event) => setResourceTitle(event.target.value)} width="100%" />
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-3">
                    <Btn
                      category="secondary"
                      variant
                      width={88}
                      onClick={() => {
                        if (sourceApiName) {
                          window.location.href = `/api/${encodeURIComponent(sourceApiName)}`;
                          return;
                        }
                        window.history.back();
                      }}
                    >
                      취소
                    </Btn>
                    <Btn category="primary" width={88} onClick={() => void saveResponse()}>
                      저장
                    </Btn>
                  </div>
                </div>

                <div>
                  <div className="typo-caption-1 text-label-assistant mb-2">응답 설명</div>
                  <TextArea value={description} onChange={(event) => setDescription(event.target.value)} width="100%" />
                </div>
              </section>

              <section className="rounded-4 border-border-enabled bg-background-white border p-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="typo-body-1-normal text-label-normal font-bold">응답 에디터</div>
                    <p className="typo-caption-1 text-label-assistant mt-1">이 영역에는 JSON 문법으로만 작성할 수 있습니다. 저장·추출·응답으로 사용 시 형식이 맞지 않으면 안내됩니다.</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <Btn category="secondary" variant width={160} onClick={exportJson}>
                      JOSN 추출하기
                    </Btn>
                    <Btn category="primary" width={162} onClick={useAsResponse}>
                      응답으로 사용
                    </Btn>
                  </div>
                </div>

                <EditableCodeEditor value={configuration} onChange={setConfiguration} />
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

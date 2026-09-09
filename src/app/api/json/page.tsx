"use client";

// React
import { useCallback, useMemo, useRef, useState } from "react";

// Components
import Btn from "@/components/common/Btn";
import DropDown from "@/components/common/DropDown";
import Input from "@/components/common/Input";
import TextArea from "@/components/common/TextArea";
import Navigation from "@/components/shared/Navigation";
import { NoticeModal } from "@/components/common/modals";

// Libs
import { getAppSearchParams, navigateApp } from "@/libs/app-navigation";
import { API_RESPONSE_TYPE_OPTIONS, getApiResponseItem, markRegisteredApiJsonResponse, setStoredActiveApiResponse } from "@/libs/datadummy/api";
import {
  formatSaveApiResponseUserError,
  getApiEndpointByName,
  getProjectForApiName,
  persistMockActiveApiResponse,
  upsertSavedApiResponse,
} from "@/libs/projects/store";
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

function formatQueryParams(params: Record<string, string> | undefined): string {
  if (!params) return "";
  return new URLSearchParams(params).toString();
}

function parseQueryParamsInput(raw: string): { ok: true; value: Record<string, string> } | { ok: false } {
  const trimmed = raw.trim().replace(/^\?/, "");
  if (!trimmed) return { ok: true, value: {} };
  const params = new URLSearchParams(trimmed);
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    const k = key.trim();
    if (!k || Object.prototype.hasOwnProperty.call(out, k)) return { ok: false };
    out[k] = value;
  }
  return { ok: true, value: out };
}

const JSON_FORMAT_NOTICE_MESSAGE = "형식 오류\n\n형식이 올바른 JSON이 아닙니다. 응답 에디터 내용을 확인해 주세요.";

/** 문자열 리터럴 밖에서만 동작 — 객체·배열 마지막 항목 뒤 후행 쉼표 제거 */
function stripTrailingCommasOutsideStrings(input: string): string {
  const out: string[] = [];
  let i = 0;
  let inString = false;
  let escape = false;
  while (i < input.length) {
    const c = input[i];
    if (escape) {
      out.push(c);
      escape = false;
      i += 1;
      continue;
    }
    if (inString) {
      out.push(c);
      if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      i += 1;
      continue;
    }
    if (c === '"') {
      out.push(c);
      inString = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j]!)) j += 1;
      const next = input[j];
      if (next === "}" || next === "]") {
        i += 1;
        continue;
      }
    }
    out.push(c);
    i += 1;
  }
  return out.join("");
}

/** 닫히지 않은 `{` `[` 를 스택 순서대로 닫아 줌 (누락된 `}` 등) */
function appendMissingClosingBrackets(input: string): string {
  const stack: ("{" | "[")[] = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") stack.push("{");
    else if (c === "[") stack.push("[");
    else if (c === "}") {
      if (stack.length && stack[stack.length - 1] === "{") stack.pop();
    } else if (c === "]") {
      if (stack.length && stack[stack.length - 1] === "[") stack.pop();
    }
  }
  let suffix = "";
  for (let k = stack.length - 1; k >= 0; k -= 1) {
    suffix += stack[k] === "{" ? "}" : "]";
  }
  return input + suffix;
}

type ParseConfigurationResult = { ok: true; parsed: unknown; canonical: string } | { ok: false };

/** 엄격 JSON 실패 시 후행 쉼표·누락 닫는 괄호 보정 후 파싱 */
function parseConfigurationJson(raw: string): ParseConfigurationResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false };

  const candidates = new Set<string>([
    trimmed,
    stripTrailingCommasOutsideStrings(trimmed),
    appendMissingClosingBrackets(trimmed),
    appendMissingClosingBrackets(stripTrailingCommasOutsideStrings(trimmed)),
    stripTrailingCommasOutsideStrings(appendMissingClosingBrackets(trimmed)),
  ]);

  for (const s of candidates) {
    try {
      const parsed: unknown = JSON.parse(s);
      return { ok: true, parsed, canonical: JSON.stringify(parsed, null, 2) };
    } catch {
      /* try next */
    }
  }
  return { ok: false };
}

function EditableCodeEditor({
  value,
  onChange,
  onBlurFormat,
}: {
  value: string;
  onChange: (nextValue: string) => void;
  onBlurFormat?: () => void;
}) {
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
            onBlur={() => onBlurFormat?.()}
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
  const searchParams = typeof window !== "undefined" ? getAppSearchParams() : null;
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
  const [queryParamsInput, setQueryParamsInput] = useState(() => formatQueryParams(selectedResponse?.queryParams));
  const [responseType, setResponseType] = useState<(typeof API_RESPONSE_TYPE_OPTIONS)[number]>(
    API_RESPONSE_TYPE_OPTIONS.find((option) => option.type === sourceType) ?? API_RESPONSE_TYPE_OPTIONS[0],
  );
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");
  const [noticeNavigateApi, setNoticeNavigateApi] = useState<string | null>(null);
  const [responseOperation, setResponseOperation] = useState<"idle" | "saving" | "applying">("idle");
  const responseOperationRef = useRef(false);

  const showNotice = useCallback((message: string, navigateToApiAfterClose?: string | null) => {
    setNoticeMessage(message);
    setNoticeNavigateApi(navigateToApiAfterClose ?? null);
    setNoticeOpen(true);
  }, []);

  const closeNotice = () => {
    const nav = noticeNavigateApi;
    setNoticeOpen(false);
    setNoticeNavigateApi(null);
    if (nav) navigateApp(`/api/${encodeURIComponent(nav)}`);
  };

  const formatConfigurationOnEditorBlur = useCallback(() => {
    const raw = configuration.trim();
    if (!raw) return;
    const r = parseConfigurationJson(configuration);
    if (r.ok) {
      if (r.canonical !== configuration) setConfiguration(r.canonical);
      return;
    }
    showNotice(JSON_FORMAT_NOTICE_MESSAGE);
  }, [configuration, showNotice]);

  const saveResponseDraft = async (): Promise<
    | { ok: true; apiKey: string; responseValue: string; editorType: "default" | "test" | "error"; canonical: string }
    | { ok: false }
  > => {
    const apiKey = sourceApiName.trim();
    if (!apiKey) {
      showNotice("API 이름이 없습니다.");
      return { ok: false };
    }
    const parsedConfig = parseConfigurationJson(configuration);
    if (!parsedConfig.ok) {
      showNotice(JSON_FORMAT_NOTICE_MESSAGE);
      return { ok: false };
    }
    const parsedQueryParams = parseQueryParamsInput(queryParamsInput);
    if (!parsedQueryParams.ok) {
      showNotice("쿼리 파라미터는 key=value&key2=value2 형식으로 입력하고, 같은 키를 중복해서 사용할 수 없습니다.");
      return { ok: false };
    }
    const project = getProjectForApiName(apiKey);
    if (!project) {
      showNotice("프로젝트에 등록된 API를 찾을 수 없습니다.");
      return { ok: false };
    }
    const editorType = responseType.type === "test" ? "test" : responseType.type === "error" ? "error" : "default";
    const valueForUpsert = isNewState ? null : responseValue;
    const result = await upsertSavedApiResponse(project.id, apiKey, {
      value: valueForUpsert,
      label: resourceTitle.trim() || apiKey,
      description: description.trim(),
      editorType,
      configuration: parsedConfig.canonical,
      queryParams: parsedQueryParams.value,
    });
    if (!result.ok) {
      showNotice(formatSaveApiResponseUserError(result.error));
      return { ok: false };
    }
    setConfiguration(parsedConfig.canonical);
    markRegisteredApiJsonResponse(apiKey);
    return { ok: true, apiKey, responseValue: result.value, editorType, canonical: parsedConfig.canonical };
  };

  const saveResponse = async () => {
    if (responseOperationRef.current) return;
    responseOperationRef.current = true;
    setResponseOperation("saving");
    try {
      const saved = await saveResponseDraft();
      if (!saved.ok) return;
      showNotice("저장이 완료되었습니다.", saved.apiKey);
    } finally {
      responseOperationRef.current = false;
      setResponseOperation("idle");
    }
  };

  const useAsResponse = async () => {
    if (responseOperationRef.current) return;
    responseOperationRef.current = true;
    setResponseOperation("saving");
    try {
      const saved = await saveResponseDraft();
      if (!saved.ok) return;

      setResponseOperation("applying");
      const endpoint = getApiEndpointByName(saved.apiKey);
      const tran = endpoint?.tran?.trim();
      const applied = await persistMockActiveApiResponse(
        saved.apiKey,
        { responseValue: saved.responseValue, editorType: saved.editorType },
        { alsoKeys: tran && tran !== saved.apiKey ? [tran] : [] },
      );
      if (!applied.ok) {
        showNotice(`응답은 저장했지만 사용 설정을 적용하지 못했습니다.\n\n${applied.error}`);
        return;
      }
      setStoredActiveApiResponse(saved.apiKey, {
        apiName: saved.apiKey,
        responseValue: saved.responseValue,
        type: saved.editorType,
        title: resourceTitle || saved.apiKey,
        description: description || "사용중",
        configuration: saved.canonical,
      });
      navigateApp(`/api/${encodeURIComponent(saved.apiKey)}`);
    } finally {
      responseOperationRef.current = false;
      setResponseOperation("idle");
    }
  };

  const exportJson = () => {
    const parsedConfig = parseConfigurationJson(configuration);
    if (!parsedConfig.ok) {
      showNotice(JSON_FORMAT_NOTICE_MESSAGE);
      return;
    }
    const parsedQueryParams = parseQueryParamsInput(queryParamsInput);
    if (!parsedQueryParams.ok) {
      showNotice("쿼리 파라미터는 key=value&key2=value2 형식으로 입력하고, 같은 키를 중복해서 사용할 수 없습니다.");
      return;
    }
    const parsedConfiguration = parsedConfig.parsed;
    const exportPayload = {
      title: resourceTitle,
      description,
      type: responseType.value,
      configuration: parsedConfiguration,
      queryParams: parsedQueryParams.value,
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
    <div className="flex h-full min-h-0 w-full min-w-0 overflow-x-hidden">
      <NoticeModal isOpen={noticeOpen} onClose={closeNotice} message={noticeMessage} anchorMain />
      <Navigation
        activeProjectSlug={jsonNavActiveProjectSlug}
        currentApiName={sourceApiName || null}
        jsonEditorApiName={sourceApiName || null}
        onNewProject={() => navigateApp("/")}
      />

      <div id="app-main" className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
        <div className="border-border-enabled bg-background-white border-b px-6 py-6">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-1">
            <button
              type="button"
              onClick={() => {
                const key = sourceApiName.trim();
                if (key) {
                  navigateApp(`/api/${encodeURIComponent(key)}`);
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
                          navigateApp(`/api/${encodeURIComponent(sourceApiName)}`);
                          return;
                        }
                        window.history.back();
                      }}
                    >
                      취소
                    </Btn>
                    <Btn category="primary" width={88} disabled={responseOperation !== "idle"} onClick={() => void saveResponse()}>
                      {responseOperation === "saving" ? "저장 중" : "저장"}
                    </Btn>
                  </div>
                </div>

                <div>
                  <div className="typo-caption-1 text-label-assistant mb-2">응답 설명</div>
                  <TextArea value={description} onChange={(event) => setDescription(event.target.value)} width="100%" />
                </div>

                <div className="mt-5">
                  <div className="typo-caption-1 text-label-assistant mb-2">URL 쿼리 조건 (선택)</div>
                  <Input
                    value={queryParamsInput}
                    onChange={(event) => setQueryParamsInput(event.target.value)}
                    width="100%"
                    placeholder="예: category=book&page=2"
                  />
                  <p className="typo-caption-1 text-label-assistant mt-2">
                    요청 URL에 입력한 조건이 모두 포함되면 이 응답을 사용합니다. 조건이 많을수록 우선 적용됩니다.
                  </p>
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
                    <Btn category="primary" width={162} disabled={responseOperation !== "idle"} onClick={() => void useAsResponse()}>
                      {responseOperation === "saving" ? "저장 중" : responseOperation === "applying" ? "적용 중" : "응답으로 사용"}
                    </Btn>
                  </div>
                </div>

                <EditableCodeEditor value={configuration} onChange={setConfiguration} onBlurFormat={formatConfigurationOnEditorBlur} />
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

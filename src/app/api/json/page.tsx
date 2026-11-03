"use client";

// React
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Components
import Btn from "@/components/common/Btn";
import Input from "@/components/common/Input";
import Navigation from "@/components/shared/Navigation";
import { ConfirmModal, NoticeModal } from "@/components/common/modals";
import DeleteIcon from "@/assets/svg/DeleteIcon";

// Libs
import { getAppSearchParams, navigateApp } from "@/libs/app-navigation";
import { API_RESPONSE_TYPE_OPTIONS, getApiResponseItem, markRegisteredApiJsonResponse, setStoredActiveApiResponse } from "@/libs/datadummy/api";
import { readApiResponseEditorDraft, removeApiResponseEditorDraft } from "@/libs/datadummy/editor-draft";
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

type QueryConditionRow = { id: string; key: string; value: string };

function createQueryConditionRows(params: Record<string, string> | undefined): QueryConditionRow[] {
  return Object.entries(params ?? {}).map(([key, value], index) => ({ id: `${index}-${key}`, key, value }));
}

function parseQueryConditionRows(rows: QueryConditionRow[]): { ok: true; value: Record<string, string> } | { ok: false } {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const k = row.key.trim();
    const value = row.value.trim();
    if (!k && !value) continue;
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
  const draftId = searchParams?.get("draftId") ?? null;
  const isNewState = editorState === "new";
  const importedDraft = isNewState ? readApiResponseEditorDraft(draftId) : null;
  const jsonNavProject = sourceApiName ? getProjectForApiName(sourceApiName) : null;
  const jsonNavActiveProjectSlug = jsonNavProject ? slugify(jsonNavProject.name) : null;
  const selectedResponse = !isNewState && sourceApiName ? getApiResponseItem(sourceApiName, responseValue) : null;
  const initialResourceTitle = isNewState ? (importedDraft?.title ?? "") : ((selectedResponse?.label ?? sourceApiName) || "응답");
  const initialDescription = isNewState ? (importedDraft?.description ?? "") : (selectedResponse?.description ?? "");
  const initialConfiguration = isNewState
    ? (importedDraft?.configuration ?? "")
    : (selectedResponse?.configuration ?? "{}");
  const initialQueryParams = isNewState ? importedDraft?.queryParams : selectedResponse?.queryParams;
  const initialResponseType = importedDraft?.editorType ?? sourceType;
  const [resourceTitle, setResourceTitle] = useState(initialResourceTitle);
  const [description, setDescription] = useState(initialDescription);
  const [configuration, setConfiguration] = useState(initialConfiguration);
  const [queryConditions, setQueryConditions] = useState<QueryConditionRow[]>(() => createQueryConditionRows(initialQueryParams));
  const [queryConditionsOpen, setQueryConditionsOpen] = useState(() => Boolean(initialQueryParams && Object.keys(initialQueryParams).length));
  const [responseType, setResponseType] = useState<(typeof API_RESPONSE_TYPE_OPTIONS)[number]>(
    API_RESPONSE_TYPE_OPTIONS.find((option) => option.type === initialResponseType) ?? API_RESPONSE_TYPE_OPTIONS[0],
  );
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");
  const [noticeNavigateApi, setNoticeNavigateApi] = useState<string | null>(null);
  const [responseOperation, setResponseOperation] = useState<"idle" | "saving" | "applying">("idle");
  const initialEditorSnapshotRef = useRef(importedDraft
    ? JSON.stringify({ importedDraftSaved: false, draftId })
    : JSON.stringify({
        resourceTitle: initialResourceTitle,
        description: initialDescription,
        configuration: initialConfiguration,
        queryConditions: createQueryConditionRows(initialQueryParams).map(({ key, value }) => ({ key, value })),
        responseType: API_RESPONSE_TYPE_OPTIONS.find((option) => option.type === initialResponseType)?.type ?? "default",
      }));
  const [savedEditorSnapshot, setSavedEditorSnapshot] = useState(initialEditorSnapshotRef.current);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const responseOperationRef = useRef(false);
  const pendingLeaveActionRef = useRef<(() => void) | null>(null);

  const currentEditorSnapshot = useMemo(() => JSON.stringify({
    resourceTitle,
    description,
    configuration,
    queryConditions: queryConditions.map(({ key, value }) => ({ key, value })),
    responseType: responseType.type,
  }), [resourceTitle, description, configuration, queryConditions, responseType.type]);
  const hasUnsavedChanges = currentEditorSnapshot !== savedEditorSnapshot;
  const queryConditionCount = useMemo(() => {
    const parsed = parseQueryConditionRows(queryConditions);
    return parsed.ok ? Object.keys(parsed.value).length : null;
  }, [queryConditions]);
  const endpoint = useMemo(() => getApiEndpointByName(sourceApiName), [sourceApiName]);
  const jsonIsValid = useMemo(() => parseConfigurationJson(configuration).ok, [configuration]);

  useEffect(() => {
    removeApiResponseEditorDraft(draftId);
  }, [draftId]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const requestLeaveEditor = (action: () => void): void => {
    if (!hasUnsavedChanges) {
      action();
      return;
    }
    pendingLeaveActionRef.current = action;
    setLeaveConfirmOpen(true);
  };

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
    const parsedQueryParams = parseQueryConditionRows(queryConditions);
    if (!parsedQueryParams.ok) {
      showNotice("쿼리 조건의 키를 입력하고, 같은 키를 중복해서 사용할 수 없습니다.");
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
      expectedUpdatedAt: isNewState ? undefined : selectedResponse?.updatedAt,
    });
    if (!result.ok) {
      showNotice(formatSaveApiResponseUserError(result.error));
      return { ok: false };
    }
    setConfiguration(parsedConfig.canonical);
    setSavedEditorSnapshot(JSON.stringify({
      resourceTitle,
      description,
      configuration: parsedConfig.canonical,
      queryConditions: queryConditions.map(({ key, value }) => ({ key, value })),
      responseType: editorType,
    }));
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
    const parsedQueryParams = parseQueryConditionRows(queryConditions);
    if (!parsedQueryParams.ok) {
      showNotice("쿼리 조건의 키를 입력하고, 같은 키를 중복해서 사용할 수 없습니다.");
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
      <ConfirmModal
        isOpen={leaveConfirmOpen}
        anchorMain
        title="저장하지 않은 변경사항이 있습니다"
        message="이 화면을 나가면 수정한 내용이 사라집니다. 저장하지 않고 나갈까요?"
        cancelLabel="계속 수정"
        confirmLabel="나가기"
        onClose={() => {
          pendingLeaveActionRef.current = null;
          setLeaveConfirmOpen(false);
        }}
        onConfirm={() => {
          const action = pendingLeaveActionRef.current;
          pendingLeaveActionRef.current = null;
          setLeaveConfirmOpen(false);
          action?.();
        }}
      />
      <Navigation
        activeProjectSlug={jsonNavActiveProjectSlug}
        currentApiName={sourceApiName || null}
        jsonEditorApiName={sourceApiName || null}
        onNewProject={() => navigateApp("/")}
      />

      <div id="app-main" className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#F6F8FB]">
        <header className="border-border-enabled bg-background-white shrink-0 border-b px-6 py-5">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                requestLeaveEditor(() => {
                  const key = sourceApiName.trim();
                  if (key) navigateApp(`/api/${encodeURIComponent(key)}`);
                  else window.history.back();
                });
              }}
              className="typo-caption-1 text-label-assistant hover:text-label-normal w-fit cursor-pointer text-left transition-colors"
            >
              API 상세 &gt; 응답 편집
            </button>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 className="typo-title-2 text-label-normal min-w-0 break-all font-bold">{sourceApiName || "새 JSON 응답"}</h1>
              {endpoint?.tran ? <span className="typo-body-2-normal text-label-assistant border-border-enabled min-w-0 break-all border-l pl-4">트랜 ID&nbsp;&nbsp;<strong className="text-label-neutral">{endpoint.tran}</strong></span> : null}
              <span className={`typo-caption-1 rounded-full px-3 py-1 font-medium ${isNewState ? "bg-[#EAF2FF] text-[#3478F6]" : "bg-[#FFF4DD] text-[#9A6500]"}`}>
                {isNewState ? "새 응답 등록" : "기존 응답 수정"}
              </span>
            </div>
          </div>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-auto p-6">
          <div className="mx-auto grid min-h-full w-full max-w-[1600px] grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
            <section className="rounded-4 border-border-enabled bg-background-white h-fit border p-6 xl:sticky xl:top-0">
              <h2 className="typo-title-3 text-label-normal mb-6 font-bold">응답 설정</h2>

              <div className="space-y-5">
                <div>
                  <label className="typo-caption-1 text-label-neutral mb-2 block font-medium">응답 이름</label>
                  <Input value={resourceTitle} onChange={(event) => setResourceTitle(event.target.value)} width="100%" placeholder="응답을 구분할 이름" />
                </div>

                <div>
                  <div className="typo-caption-1 text-label-neutral mb-2 font-medium">응답 유형</div>
                  <div className="border-border-enabled grid grid-cols-3 overflow-hidden rounded-lg border">
                    {API_RESPONSE_TYPE_OPTIONS.map((option) => (
                      <button
                        key={option.type}
                        type="button"
                        onClick={() => setResponseType(option)}
                        className={`typo-body-2-normal relative h-10 cursor-pointer border-r font-medium transition-colors last:border-r-0 focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#3478F6] ${
                          responseType.type === option.type
                            ? "z-10 border-border-enabled bg-[#EEF4FF] text-[#3478F6] shadow-[inset_0_0_0_1px_#3478F6]"
                            : "border-border-enabled text-label-neutral bg-background-white hover:bg-background-secondary-weak"
                        }`}
                      >
                        {option.type === "default" ? "Default" : option.type === "test" ? "Test" : "Error"}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="typo-caption-1 text-label-neutral mb-2 block font-medium">설명</label>
                  <Input value={description} onChange={(event) => setDescription(event.target.value)} width="100%" placeholder="이 응답을 사용하는 상황" />
                </div>

                <div className="border-border-week border-t pt-5">
                  <button
                    type="button"
                    onClick={() => setQueryConditionsOpen((open) => !open)}
                    className="flex w-full cursor-pointer items-center justify-between text-left"
                  >
                    <span className="typo-body-2-normal text-label-normal font-bold">쿼리 조건 <span className="text-label-assistant font-normal">(선택)</span></span>
                    <span className={`text-label-assistant transition-transform ${queryConditionsOpen ? "rotate-180" : ""}`}>⌄</span>
                  </button>
                  <p className="typo-caption-1 text-label-assistant mt-2">조건이 없으면 기본 응답으로 사용됩니다.</p>

                  {queryConditionsOpen ? (
                    <div className="mt-4 space-y-3">
                      {queryConditions.map((row) => (
                        <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_36px] items-center gap-2">
                          <Input
                            size="small"
                            value={row.key}
                            error={queryConditionCount == null}
                            onChange={(event) => setQueryConditions((rows) => rows.map((item) => item.id === row.id ? { ...item, key: event.target.value } : item))}
                            placeholder="키"
                          />
                          <Input
                            size="small"
                            value={row.value}
                            onChange={(event) => setQueryConditions((rows) => rows.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item))}
                            placeholder="값"
                          />
                          <button
                            type="button"
                            aria-label="쿼리 조건 삭제"
                            onClick={() => setQueryConditions((rows) => rows.filter((item) => item.id !== row.id))}
                            className="border-border-enabled text-label-assistant hover:text-label-negative flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border transition-colors"
                          >
                            <DeleteIcon className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <Btn
                        category="secondary"
                        variant
                        size="small"
                        startIcon={<span className="text-[#3478F6]">＋</span>}
                        onClick={() => setQueryConditions((rows) => [...rows, { id: `${Date.now()}-${rows.length}`, key: "", value: "" }])}
                      >
                        조건 추가
                      </Btn>
                      <p className={`typo-caption-1 ${queryConditionCount == null ? "text-label-negative" : "text-label-assistant"}`}>
                        {queryConditionCount == null
                          ? "조건 키를 입력하고 중복된 키가 없는지 확인해 주세요."
                          : queryConditionCount > 0
                            ? `조건 ${queryConditionCount}개 · 요청 값이 모두 일치할 때 사용됩니다.`
                            : "추가된 조건이 없습니다."}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-4 border-border-enabled bg-background-white flex min-h-[620px] min-w-0 flex-col border p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <h2 className="typo-title-3 text-label-normal font-bold">JSON 응답</h2>
                  <span className={`typo-caption-1 flex items-center gap-2 font-medium ${jsonIsValid ? "text-[#16A36A]" : "text-label-negative"}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${jsonIsValid ? "bg-[#20C77A]" : "bg-background-negative"}`} />
                    {jsonIsValid ? "올바른 JSON" : "JSON 형식 확인 필요"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Btn category="secondary" variant width={110} onClick={formatConfigurationOnEditorBlur}>포맷 정리</Btn>
                  <Btn category="secondary" variant width={110} onClick={exportJson}>JSON 추출</Btn>
                </div>
              </div>
              <div className="min-h-0 flex-1">
                <EditableCodeEditor value={configuration} onChange={setConfiguration} />
              </div>
            </section>
          </div>
        </main>

        <footer className="border-border-enabled bg-background-white shrink-0 border-t px-6 py-4">
          <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-4">
            <div className="typo-caption-1 text-label-assistant flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${hasUnsavedChanges ? "bg-[#FFAD0D]" : "bg-[#20C77A]"}`} />
              {hasUnsavedChanges ? "수정된 내용이 있습니다." : "저장된 내용과 같습니다."}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <p className="typo-caption-1 text-label-assistant mr-2 hidden max-w-[360px] text-right 2xl:block">
                저장은 데이터만 보관하고, 응답으로 사용하면 프록시에 즉시 적용됩니다.
              </p>
              <Btn
                category="secondary"
                variant
                width={88}
                disabled={responseOperation !== "idle"}
                onClick={() => requestLeaveEditor(() => sourceApiName ? navigateApp(`/api/${encodeURIComponent(sourceApiName)}`) : window.history.back())}
              >
                취소
              </Btn>
              <Btn category="secondary" variant width={88} disabled={responseOperation !== "idle"} onClick={() => void saveResponse()}>
                {responseOperation === "saving" ? "저장 중" : "저장"}
              </Btn>
              <Btn category="primary" width={190} disabled={responseOperation !== "idle"} onClick={() => void useAsResponse()}>
                {responseOperation === "saving" ? "저장 중" : responseOperation === "applying" ? "적용 중" : "저장하고 응답으로 사용"}
              </Btn>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

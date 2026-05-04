import { getSavedApiResponsesForApi } from "@/libs/projects/store";
import type { SavedApiResponseRow } from "@/libs/projects/store";

export type ApiResponseKind = "local" | "test" | "error";

export interface ApiResponseItem {
  type: ApiResponseKind;
  label: string;
  value: string;
  infoText?: string;
  description: string;
  configuration: string;
}

export interface ApiResponseGroups {
  localResponses: ApiResponseItem[];
  testResponses: ApiResponseItem[];
  errorResponses: ApiResponseItem[];
}

export interface ActiveApiResponseState {
  apiName: string;
  responseValue: string | null;
  type: "default" | "test" | "error";
  title: string;
  description: string;
  configuration: string;
}

/** JSON 추출·가져오기 공통: TYPE 드롭다운과 동일 */
export const API_RESPONSE_TYPE_OPTIONS = [
  { value: "기본", type: "default" as const },
  { value: "테스트", type: "test" as const },
  { value: "에러", type: "error" as const },
];

export type ApiResponseEditorTypeKey = "default" | "test" | "error";

export function normalizeApiResponseEditorType(input: unknown): ApiResponseEditorTypeKey {
  if (input == null) return "default";
  if (typeof input === "string") {
    const t = input.trim().toLowerCase();
    if (t === "test" || t === "테스트") return "test";
    if (t === "error" || t === "에러") return "error";
    if (t === "default" || t === "기본") return "default";
  }
  return "default";
}

/** `title` / `description` / `type` / `configuration` 추출 포맷 (한 번 파싱한 객체에 사용) */
export interface ParsedApiResponseBundle {
  title: string;
  description: string;
  editorType: ApiResponseEditorTypeKey;
  configuration: string;
}

function tryStringifyConfigurationValue(cfg: unknown): string | null {
  if (cfg === null || cfg === undefined) return null;
  try {
    if (typeof cfg === "string") {
      return JSON.stringify(JSON.parse(cfg), null, 2);
    }
    return JSON.stringify(cfg, null, 2);
  } catch {
    return null;
  }
}

export function tryParseApiResponseExportBundle(parsed: unknown): ParsedApiResponseBundle | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(o, "configuration")) return null;
  const configuration = tryStringifyConfigurationValue(o.configuration);
  if (configuration == null) return null;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const description = typeof o.description === "string" ? o.description.trim() : "";
  const editorType = normalizeApiResponseEditorType(o.type ?? o.responseType);
  return {
    title: title || "가져온 응답",
    description,
    editorType,
    configuration,
  };
}

function savedRowToApiItem(row: SavedApiResponseRow): ApiResponseItem {
  const type: ApiResponseKind = row.editorType === "test" ? "test" : row.editorType === "error" ? "error" : "local";
  return {
    type,
    label: row.label,
    value: row.value,
    description: row.description,
    configuration: row.configuration,
  };
}

export function getApiResponseGroups(apiName: string): ApiResponseGroups {
  const saved = getSavedApiResponsesForApi(apiName).map(savedRowToApiItem);
  return {
    localResponses: saved.filter((s) => s.type === "local"),
    testResponses: saved.filter((s) => s.type === "test"),
    errorResponses: saved.filter((s) => s.type === "error"),
  };
}

export function getApiResponseItem(apiName: string, value: string | null): ApiResponseItem | null {
  if (!value) return null;

  const groups = getApiResponseGroups(apiName);
  const items = [...groups.localResponses, ...groups.testResponses, ...groups.errorResponses];

  return items.find((item) => item.value === value) ?? null;
}

export function getDefaultActiveApiResponse(apiName: string): ActiveApiResponseState {
  const groups = getApiResponseGroups(apiName);
  const fallback = groups.localResponses[0] ?? groups.testResponses[0] ?? groups.errorResponses[0];
  const t: "default" | "test" | "error" =
    fallback?.type === "test" ? "test" : fallback?.type === "error" ? "error" : "default";

  return {
    apiName,
    responseValue: fallback?.value ?? null,
    type: t,
    title: fallback?.label ?? apiName,
    description: fallback?.description ?? "",
    configuration: fallback?.configuration ?? "",
  };
}

function getActiveApiResponseStorageKey(apiName: string) {
  return `active-api-response:${apiName}`;
}

export function getStoredActiveApiResponse(apiName: string): ActiveApiResponseState {
  const fallback = getDefaultActiveApiResponse(apiName);

  if (typeof window === "undefined") return fallback;

  try {
    const storedValue = window.localStorage.getItem(getActiveApiResponseStorageKey(apiName));
    if (!storedValue) return fallback;

    const parsed = JSON.parse(storedValue) as ActiveApiResponseState;
    return { ...fallback, ...parsed, apiName };
  } catch {
    return fallback;
  }
}

export function setStoredActiveApiResponse(apiName: string, value: ActiveApiResponseState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getActiveApiResponseStorageKey(apiName), JSON.stringify(value));
}

/** 디스크/브라우저에 저장된 응답 행만 삭제 가능 (내장 템플릿 제외) */
export function isPersistedSavedResponseItem(apiName: string, responseValue: string): boolean {
  const v = responseValue.trim();
  if (!v) return false;
  return getSavedApiResponsesForApi(apiName).some((r) => r.value === v);
}

export function clearStoredActiveApiResponseIfMatches(apiName: string, responseValue: string): void {
  if (typeof window === "undefined") return;
  const key = getActiveApiResponseStorageKey(apiName);
  try {
    const storedValue = window.localStorage.getItem(key);
    if (!storedValue) return;
    const parsed = JSON.parse(storedValue) as ActiveApiResponseState;
    if (parsed.responseValue === responseValue) {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/** LNB 등에서 API를 눌렀을 때 열 JSON 편집 URL (저장된 활성 응답 우선, 없으면 로컬 첫 응답) */
export function getJsonEditorEntryHref(apiName: string): string {
  const active = getStoredActiveApiResponse(apiName);
  if (active.responseValue) {
    return `/api/json?state=edit&apiName=${encodeURIComponent(apiName)}&type=${encodeURIComponent(active.type)}&responseValue=${encodeURIComponent(active.responseValue)}`;
  }
  const { localResponses } = getApiResponseGroups(apiName);
  const first = localResponses[0];
  if (!first) {
    return `/api/json?state=edit&apiName=${encodeURIComponent(apiName)}&type=default`;
  }
  const typeParam = first.type === "local" ? "default" : first.type;
  return `/api/json?state=edit&apiName=${encodeURIComponent(apiName)}&type=${typeParam}&responseValue=${encodeURIComponent(first.value)}`;
}

/** API 상세에서 라디오로 선택한 `value`에 맞는 JSON 편집 URL — 목록에 없으면 신규 추가 */
export function getJsonEditorHrefForSelectedValue(apiName: string, responseValue: string | null | undefined): string {
  const name = apiName.trim();
  if (!name) return `/api/json?state=new&apiName=&type=default`;
  const key = (responseValue ?? "").trim();
  if (!key) {
    return `/api/json?state=new&apiName=${encodeURIComponent(name)}&type=default`;
  }
  const groups = getApiResponseGroups(name);
  const all = [...groups.localResponses, ...groups.testResponses, ...groups.errorResponses];
  const item = all.find((i) => i.value === key);
  if (!item) {
    return `/api/json?state=new&apiName=${encodeURIComponent(name)}&type=default`;
  }
  const typeParam = item.type === "local" ? "default" : item.type === "test" ? "test" : "error";
  return `/api/json?state=edit&apiName=${encodeURIComponent(name)}&type=${typeParam}&responseValue=${encodeURIComponent(key)}`;
}

const REGISTERED_JSON_KEY_PREFIX = "proxy-api-json-registered:";

/** 디스크/브라우저에 저장된 응답이 있을 때만 (내장 더미/템플릿 없음) */
export function hasRegisteredApiJsonResponse(apiName: string): boolean {
  if (typeof window === "undefined" || !apiName.trim()) return false;
  return getSavedApiResponsesForApi(apiName).length > 0;
}

export function markRegisteredApiJsonResponse(apiName: string): void {
  if (typeof window === "undefined" || !apiName.trim()) return;
  window.localStorage.setItem(`${REGISTERED_JSON_KEY_PREFIX}${apiName.trim()}`, "1");
}

/** 저장된 응답이 하나도 없으면 등록 플래그 제거 (삭제 후 빈 화면 분기) */
export function clearRegisteredApiJsonFlagIfNoSavedResponses(apiName: string): void {
  if (typeof window === "undefined" || !apiName.trim()) return;
  if (getSavedApiResponsesForApi(apiName).length > 0) return;
  window.localStorage.removeItem(`${REGISTERED_JSON_KEY_PREFIX}${apiName.trim()}`);
}

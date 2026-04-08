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

function stringifyConfiguration(value: unknown) {
  return JSON.stringify(value, null, 2);
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

/** 내장 더미 시나리오를 붙이지 않고 디스크/저장소에 있는 응답만 사용하는 API 이름 */
const API_NAMES_SAVED_RESPONSES_ONLY = new Set(
  ["gopincert", "gopincertrequest", "goprivatepkicertgen"].map((s) => s.toLowerCase()),
);

function isSavedResponsesOnlyApiName(apiName: string): boolean {
  return API_NAMES_SAVED_RESPONSES_ONLY.has(apiName.trim().toLowerCase());
}

function buildDefaultApiResponseGroups(apiName: string): ApiResponseGroups {
  return {
    localResponses: [
      {
        type: "local",
        label: "기본 응답",
        value: `${apiName}-local-default`,
        infoText: `${apiName}.json`,
        description: `${apiName}의 기본 로컬 응답입니다.`,
        configuration: stringifyConfiguration({
          resource_id: apiName,
          response_type: "default",
          source: "local",
          enabled: true,
          payload: { status: "ok", code: 200 },
        }),
      },
      {
        type: "local",
        label: "대체 응답",
        value: `${apiName}-local-alt`,
        infoText: `${apiName}_v2.json`,
        description: `${apiName}의 대체 로컬 응답입니다.`,
        configuration: stringifyConfiguration({
          resource_id: apiName,
          response_type: "alternative",
          source: "local",
          enabled: true,
          payload: { status: "ok", code: 202 },
        }),
      },
      {
        type: "local",
        label: "레거시 응답",
        value: `${apiName}-local-legacy`,
        infoText: `${apiName}_legacy.json`,
        description: `${apiName}의 레거시 로컬 응답입니다.`,
        configuration: stringifyConfiguration({
          resource_id: apiName,
          response_type: "legacy",
          source: "local",
          enabled: false,
          payload: { status: "legacy", code: 200 },
        }),
      },
    ],
    testResponses: [
      {
        type: "test",
        label: "임시 응답",
        value: `${apiName}-test-temp`,
        infoText: "저장되지 않은 잠시 테스트용으로 사용할 응답",
        description: `${apiName}의 임시 테스트 응답입니다.`,
        configuration: stringifyConfiguration({
          resource_id: apiName,
          response_type: "temp",
          source: "test",
          enabled: true,
          payload: { status: "sandbox", code: 200 },
        }),
      },
      {
        type: "test",
        label: "QA 검증 응답",
        value: `${apiName}-test-qa`,
        infoText: "QA 환경 검증용 응답 시나리오",
        description: `${apiName}의 QA 검증용 테스트 응답입니다.`,
        configuration: stringifyConfiguration({
          resource_id: apiName,
          response_type: "qa",
          source: "test",
          enabled: true,
          payload: { status: "qa", code: 206 },
        }),
      },
      {
        type: "test",
        label: "조건부 응답",
        value: `${apiName}-test-condition`,
        infoText: "특정 파라미터 조건에서만 사용하는 응답",
        description: `${apiName}의 조건부 테스트 응답입니다.`,
        configuration: stringifyConfiguration({
          resource_id: apiName,
          response_type: "conditional",
          source: "test",
          enabled: true,
          conditions: { env: "staging", region: "seoul" },
          payload: { status: "conditional", code: 200 },
        }),
      },
    ],
    errorResponses: [
      {
        type: "error",
        label: "BVD0030020",
        value: `${apiName}-error-session`,
        infoText: "Session이 끊겼습니다.",
        description: `${apiName}의 세션 만료 에러 응답입니다.`,
        configuration: stringifyConfiguration({
          resource_id: apiName,
          response_type: "session_error",
          source: "error",
          enabled: true,
          error: { code: "BVD0030020", message: "Session expired" },
        }),
      },
      {
        type: "error",
        label: "BVD0030066",
        value: `${apiName}-error-range`,
        infoText: "유효하지 않은 기간 범위입니다.",
        description: `${apiName}의 범위 검증 에러 응답입니다.`,
        configuration: stringifyConfiguration({
          resource_id: apiName,
          response_type: "range_error",
          source: "error",
          enabled: true,
          error: { code: "BVD0030066", message: "Invalid date range" },
        }),
      },
      {
        type: "error",
        label: "404.TIMEOUT",
        value: `${apiName}-error-timeout`,
        infoText: "응답 대기 시간이 초과되었습니다.",
        description: `${apiName}의 타임아웃 에러 응답입니다.`,
        configuration: stringifyConfiguration({
          resource_id: apiName,
          response_type: "timeout_error",
          source: "error",
          enabled: true,
          error: { code: "404.TIMEOUT", message: "Gateway timeout" },
        }),
      },
    ],
  };
}

export function getApiResponseGroups(apiName: string): ApiResponseGroups {
  const saved = getSavedApiResponsesForApi(apiName).map(savedRowToApiItem);
  const savedLocal = saved.filter((s) => s.type === "local");
  const savedTest = saved.filter((s) => s.type === "test");
  const savedErr = saved.filter((s) => s.type === "error");

  if (isSavedResponsesOnlyApiName(apiName)) {
    return {
      localResponses: savedLocal,
      testResponses: savedTest,
      errorResponses: savedErr,
    };
  }

  const base = buildDefaultApiResponseGroups(apiName);
  return {
    localResponses: [...savedLocal, ...base.localResponses],
    testResponses: [...savedTest, ...base.testResponses],
    errorResponses: [...savedErr, ...base.errorResponses],
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
  const fallback = groups.localResponses[0];

  return {
    apiName,
    responseValue: fallback?.value ?? null,
    type: "default",
    title: fallback?.label ?? apiName,
    description: fallback?.description ?? "사용중",
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

/** JSON 편집기에서 「응답으로 사용」으로 저장한 적이 있는지 (API 상세 빈 화면 분기) */
export function hasRegisteredApiJsonResponse(apiName: string): boolean {
  if (typeof window === "undefined" || !apiName.trim()) return false;
  if (getSavedApiResponsesForApi(apiName).length > 0) return true;
  /** pin 계열은 디스크/브라우저 스토어에 저장된 시나리오만 인정 (구버전 localStorage 등록 플래그 무시) */
  if (isSavedResponsesOnlyApiName(apiName)) return false;
  return window.localStorage.getItem(`${REGISTERED_JSON_KEY_PREFIX}${apiName.trim()}`) === "1";
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

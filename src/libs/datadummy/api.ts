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

function stringifyConfiguration(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function getApiResponseGroups(apiName: string): ApiResponseGroups {
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


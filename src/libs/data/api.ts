export type ApiResponseKind = "local" | "test" | "error";

export interface ApiResponseItem {
  type: ApiResponseKind;
  label: string;
  value: string;
  infoText?: string;
}

export interface ApiResponseGroups {
  localResponses: ApiResponseItem[];
  testResponses: ApiResponseItem[];
  errorResponses: ApiResponseItem[];
}

export function getApiResponseGroups(apiName: string): ApiResponseGroups {
  return {
    localResponses: [
      { type: "local", label: "기본 응답", value: `${apiName}-local-default`, infoText: `${apiName}.json` },
      { type: "local", label: "대체 응답", value: `${apiName}-local-alt`, infoText: `${apiName}_v2.json` },
      { type: "local", label: "레거시 응답", value: `${apiName}-local-legacy`, infoText: `${apiName}_legacy.json` },
    ],
    testResponses: [
      { type: "test", label: "임시 응답", value: `${apiName}-test-temp`, infoText: "저장되지 않은 잠시 테스트용으로 사용할 응답" },
      { type: "test", label: "QA 검증 응답", value: `${apiName}-test-qa`, infoText: "QA 환경 검증용 응답 시나리오" },
      { type: "test", label: "조건부 응답", value: `${apiName}-test-condition`, infoText: "특정 파라미터 조건에서만 사용하는 응답" },
    ],
    errorResponses: [
      { type: "error", label: "BVD0030020", value: `${apiName}-error-session`, infoText: "Session이 끊겼습니다." },
      { type: "error", label: "BVD0030066", value: `${apiName}-error-range`, infoText: "유효하지 않은 기간 범위입니다." },
      { type: "error", label: "404.TIMEOUT", value: `${apiName}-error-timeout`, infoText: "응답 대기 시간이 초과되었습니다." },
    ],
  };
}

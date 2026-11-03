import type { ApiResponseEditorTypeKey } from "@/libs/datadummy/api";

export interface ApiResponseEditorDraft {
  title: string;
  description: string;
  editorType: ApiResponseEditorTypeKey;
  configuration: string;
  queryParams: Record<string, string>;
}

const STORAGE_PREFIX = "dataforge-api-response-editor-draft:";

function getStorageKey(id: string): string {
  return `${STORAGE_PREFIX}${id}`;
}

function isEditorType(value: unknown): value is ApiResponseEditorTypeKey {
  return value === "default" || value === "test" || value === "error";
}

export function storeApiResponseEditorDraft(draft: ApiResponseEditorDraft): string {
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  window.sessionStorage.setItem(getStorageKey(id), JSON.stringify(draft));
  return id;
}

export function readApiResponseEditorDraft(id: string | null): ApiResponseEditorDraft | null {
  if (!id || typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(getStorageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ApiResponseEditorDraft>;
    if (
      typeof parsed.title !== "string"
      || typeof parsed.description !== "string"
      || !isEditorType(parsed.editorType)
      || typeof parsed.configuration !== "string"
      || !parsed.queryParams
      || typeof parsed.queryParams !== "object"
      || Array.isArray(parsed.queryParams)
    ) {
      return null;
    }

    const queryParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.queryParams)) {
      if (typeof value === "string") queryParams[key] = value;
    }

    return {
      title: parsed.title,
      description: parsed.description,
      editorType: parsed.editorType,
      configuration: parsed.configuration,
      queryParams,
    };
  } catch {
    return null;
  }
}

export function removeApiResponseEditorDraft(id: string | null): void {
  if (!id || typeof window === "undefined") return;
  window.sessionStorage.removeItem(getStorageKey(id));
}

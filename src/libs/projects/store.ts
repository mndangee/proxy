import type { ApiEndpoint, AppProxyConfig, AppProxyInterceptGatewayConfig, LinkedClientEntry, MockProfileType, Project } from "@/types";

import { buildCareTranLookup, findCareForProxyApi, parseSfdModuleInterfaces } from "@/libs/care/sfdModuleInterfaces";
import { slugify } from "@/libs/slugify";

const LEGACY_STORAGE_KEY = "proxy-app-projects-v1";

/** Electron 미사용(브라우저) 시 프로젝트별 API 목록 — `apis/index.json`과 동형 row */
const BROWSER_APIS_STORAGE_KEY = "proxy-app-project-apis-v1";

/** API 상세 화면에서 설정하는 응답 지연(ms), 표시 이름(apiName) 기준 */
const BROWSER_API_LATENCY_STORAGE_KEY = "proxy-app-api-latency-ms-v1";

const BROWSER_API_HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

const BROWSER_APP_PROXY_CONFIG_KEY = "proxy-app-config-v1";
const BROWSER_PROJECT_LINKED_CLIENTS_KEY = "proxy-project-linked-clients-v1";
const APP_PROXY_CONFIG_FILE_VERSION = 2;
const APP_PROXY_CONFIG_LEGACY_V1 = 1;

function migrateCareGatewayBrowser(g: Record<string, unknown>): AppProxyInterceptGatewayConfig {
  const lp = typeof g.listenPort === "number" && Number.isFinite(g.listenPort) ? Math.floor(g.listenPort) : 7777;
  const bp = typeof g.backendPort === "number" && Number.isFinite(g.backendPort) ? Math.floor(g.backendPort) : 7778;
  let upstreamWorkdir: string | null = null;
  if ("dummyServerDirectory" in g) {
    if (g.dummyServerDirectory === null || g.dummyServerDirectory === "") upstreamWorkdir = null;
    else if (typeof g.dummyServerDirectory === "string") {
      const t = g.dummyServerDirectory.trim();
      upstreamWorkdir = t || null;
    }
  }
  return {
    enabled: Boolean(g.enabled),
    clientPort: Math.min(65535, Math.max(1, lp)),
    upstreamPort: Math.min(65535, Math.max(1, bp)),
    autoStartUpstream: Boolean(g.autoStartDummy),
    upstreamWorkdir,
  };
}

function parseInterceptGatewayBrowser(o: Record<string, unknown>): AppProxyInterceptGatewayConfig {
  const igRaw = o.interceptGateway;
  if (igRaw != null && typeof igRaw === "object" && !Array.isArray(igRaw)) {
    const g = igRaw as Record<string, unknown>;
    const cp =
      typeof g.clientPort === "number" && Number.isFinite(g.clientPort)
        ? Math.floor(g.clientPort)
        : typeof g.listenPort === "number" && Number.isFinite(g.listenPort)
          ? Math.floor(g.listenPort)
          : 7777;
    const up =
      typeof g.upstreamPort === "number" && Number.isFinite(g.upstreamPort)
        ? Math.floor(g.upstreamPort)
        : typeof g.backendPort === "number" && Number.isFinite(g.backendPort)
          ? Math.floor(g.backendPort)
          : 7778;
    let upstreamWorkdir: string | null = null;
    if ("upstreamWorkdir" in g) {
      if (g.upstreamWorkdir === null || g.upstreamWorkdir === "") upstreamWorkdir = null;
      else if (typeof g.upstreamWorkdir === "string") {
        const t = g.upstreamWorkdir.trim();
        upstreamWorkdir = t || null;
      }
    } else if ("dummyServerDirectory" in g) {
      if (g.dummyServerDirectory === null || g.dummyServerDirectory === "") upstreamWorkdir = null;
      else if (typeof g.dummyServerDirectory === "string") {
        const t = g.dummyServerDirectory.trim();
        upstreamWorkdir = t || null;
      }
    }
    const auto =
      typeof g.autoStartUpstream === "boolean" ? g.autoStartUpstream : typeof g.autoStartDummy === "boolean" ? g.autoStartDummy : false;
    return {
      enabled: Boolean(g.enabled),
      clientPort: Math.min(65535, Math.max(1, cp)),
      upstreamPort: Math.min(65535, Math.max(1, up)),
      autoStartUpstream: Boolean(auto),
      upstreamWorkdir,
    };
  }
  const cgRaw = o.careGateway;
  if (cgRaw != null && typeof cgRaw === "object" && !Array.isArray(cgRaw)) {
    return migrateCareGatewayBrowser(cgRaw as Record<string, unknown>);
  }
  return {
    enabled: false,
    clientPort: 7777,
    upstreamPort: 7778,
    autoStartUpstream: false,
    upstreamWorkdir: null,
  };
}
const DEFAULT_PROXY_SERVER_PORT = 4780;

function coerceBrowserMockTranAliases(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const ks = String(k).trim();
    const vs = typeof v === "string" ? v.trim() : "";
    if (ks && vs) out[ks] = vs;
  }
  return out;
}

function coerceBrowserMockProfile(raw: unknown): MockProfileType {
  return raw === "generic-json" ? "generic-json" : "legacy-tran-envelope";
}

function defaultAppProxyConfig(): AppProxyConfig {
  return {
    version: APP_PROXY_CONFIG_FILE_VERSION,
    proxyServer: {
      port: DEFAULT_PROXY_SERVER_PORT,
      enabled: false,
      servingFolderName: null,
      careDummyMobilityPath: null,
      upstreamAutoStart: false,
      upstreamServerWorkdir: null,
      upstreamServerPort: 7778,
      upstreamServerCommand: null,
      upstreamNodePath: null,
      careDummyAutoStart: false,
      careDummyServerWorkdir: null,
      careDummyServerPort: 7778,
    },
    interceptGateway: {
      enabled: false,
      clientPort: 7777,
      upstreamPort: 7778,
      autoStartUpstream: false,
      upstreamWorkdir: null,
    },
    mockProfile: "legacy-tran-envelope",
    mockTranAliases: {},
  };
}

function coerceLinkedClientsLocal(raw: unknown): LinkedClientEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: LinkedClientEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!id || !label) continue;
    const allowedOrigins = Array.isArray(o.allowedOrigins)
      ? o.allowedOrigins.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean)
      : [];
    const notesRaw = typeof o.notes === "string" ? o.notes.trim() : "";
    out.push({ id, label, allowedOrigins, ...(notesRaw ? { notes: notesRaw } : {}) });
  }
  return out.length ? out : undefined;
}

function readBrowserAppProxyConfig(): AppProxyConfig {
  if (typeof window === "undefined") return defaultAppProxyConfig();
  try {
    const raw = window.localStorage.getItem(BROWSER_APP_PROXY_CONFIG_KEY);
    if (!raw) return defaultAppProxyConfig();
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return defaultAppProxyConfig();
    const o = data as Record<string, unknown>;
    if (o.version !== APP_PROXY_CONFIG_FILE_VERSION && o.version !== APP_PROXY_CONFIG_LEGACY_V1) {
      return defaultAppProxyConfig();
    }
    const ps = o.proxyServer;
    if (!ps || typeof ps !== "object") return defaultAppProxyConfig();
    const p = ps as Record<string, unknown>;
    const port = typeof p.port === "number" && Number.isFinite(p.port) ? Math.floor(p.port) : DEFAULT_PROXY_SERVER_PORT;
    const enabled = Boolean(p.enabled);
    let servingFolderName: string | null = null;
    if ("servingFolderName" in p) {
      if (p.servingFolderName === null || p.servingFolderName === "") servingFolderName = null;
      else if (typeof p.servingFolderName === "string") {
        const t = p.servingFolderName.trim();
        servingFolderName = t || null;
      }
    }
    let careDummyMobilityPath: string | null = null;
    if ("careDummyMobilityPath" in p) {
      if (p.careDummyMobilityPath === null || p.careDummyMobilityPath === "") careDummyMobilityPath = null;
      else if (typeof p.careDummyMobilityPath === "string") {
        const t = p.careDummyMobilityPath.trim();
        careDummyMobilityPath = t || null;
      }
    }
    const careDummyAutoStart = Boolean(p.careDummyAutoStart);
    let careDummyServerWorkdir: string | null = null;
    if ("careDummyServerWorkdir" in p) {
      if (p.careDummyServerWorkdir === null || p.careDummyServerWorkdir === "") careDummyServerWorkdir = null;
      else if (typeof p.careDummyServerWorkdir === "string") {
        const t = p.careDummyServerWorkdir.trim();
        careDummyServerWorkdir = t || null;
      }
    }
    let careDummyServerPort = 7778;
    if (typeof p.careDummyServerPort === "number" && Number.isFinite(p.careDummyServerPort)) {
      careDummyServerPort = Math.min(65535, Math.max(1, Math.floor(p.careDummyServerPort)));
    }
    const upstreamAutoStart = typeof p.upstreamAutoStart === "boolean" ? p.upstreamAutoStart : careDummyAutoStart;
    let upstreamServerWorkdir: string | null = null;
    if ("upstreamServerWorkdir" in p) {
      if (p.upstreamServerWorkdir === null || p.upstreamServerWorkdir === "") upstreamServerWorkdir = null;
      else if (typeof p.upstreamServerWorkdir === "string") {
        const t = p.upstreamServerWorkdir.trim();
        upstreamServerWorkdir = t || null;
      }
    } else {
      upstreamServerWorkdir = careDummyServerWorkdir;
    }
    let upstreamServerPort = careDummyServerPort;
    if (typeof p.upstreamServerPort === "number" && Number.isFinite(p.upstreamServerPort)) {
      upstreamServerPort = Math.min(65535, Math.max(1, Math.floor(p.upstreamServerPort)));
    }
    let upstreamServerCommand: string | null = null;
    if ("upstreamServerCommand" in p) {
      if (p.upstreamServerCommand === null || p.upstreamServerCommand === "") upstreamServerCommand = null;
      else if (typeof p.upstreamServerCommand === "string") {
        const t = p.upstreamServerCommand.trim();
        upstreamServerCommand = t || null;
      }
    }
    let upstreamNodePath: string | null = null;
    if ("upstreamNodePath" in p) {
      if (p.upstreamNodePath === null || p.upstreamNodePath === "") upstreamNodePath = null;
      else if (typeof p.upstreamNodePath === "string") {
        const t = p.upstreamNodePath.trim();
        upstreamNodePath = t || null;
      }
    }
    const interceptGateway = parseInterceptGatewayBrowser(o);

    const mockTranAliases = coerceBrowserMockTranAliases(o.mockTranAliases);
    const mockProfile = coerceBrowserMockProfile(o.mockProfile);

    return {
      version: APP_PROXY_CONFIG_FILE_VERSION,
      proxyServer: {
        port: Math.min(65535, Math.max(1, port)),
        enabled,
        servingFolderName,
        careDummyMobilityPath,
        upstreamAutoStart,
        upstreamServerWorkdir,
        upstreamServerPort,
        upstreamServerCommand,
        upstreamNodePath,
        careDummyAutoStart,
        careDummyServerWorkdir,
        careDummyServerPort,
      },
      interceptGateway,
      mockProfile,
      mockTranAliases,
    };
  } catch {
    return defaultAppProxyConfig();
  }
}

function writeBrowserAppProxyConfig(config: AppProxyConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BROWSER_APP_PROXY_CONFIG_KEY, JSON.stringify(config));
}

function readBrowserLinkedClientsMap(): Record<string, LinkedClientEntry[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(BROWSER_PROJECT_LINKED_CLIENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, LinkedClientEntry[]> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const arr = coerceLinkedClientsLocal(v);
      if (arr?.length) out[k] = arr;
    }
    return out;
  } catch {
    return {};
  }
}

function writeBrowserLinkedClientsMap(map: Record<string, LinkedClientEntry[]>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BROWSER_PROJECT_LINKED_CLIENTS_KEY, JSON.stringify(map));
}

export const PROJECTS_CHANGED_EVENT = "proxy-projects-changed";

/** 헤더·LNB 등 어디서든 프로젝트 생성 모달을 열 때 사용 */
export const OPEN_CREATE_PROJECT_MODAL_EVENT = "open-create-project-modal";

export type OpenCreateProjectModalDetail = { anchorMain?: boolean };

let projectsCache: Project[] | null = null;

/** 디스크에서 읽은 API 목록 캐시 (projectId → 엔드포인트) */
const diskEndpointsCache: Record<string, ApiEndpoint[]> = {};

export const PROJECT_APIS_CHANGED_EVENT = "proxy-project-apis-changed";

/** API별 저장 응답(JSON 편집기) 갱신 시 — 상세·섹션 목록 리프레시용 */
export const PROJECT_API_RESPONSES_CHANGED_EVENT = "proxy-project-api-responses-changed";

export type SavedApiResponseEditorType = "default" | "test" | "error";

/** `apis/responses-store.json` 행 (IPC·브라우저 저장 공통) */
export interface SavedApiResponseRow {
  id: string;
  value: string;
  label: string;
  description: string;
  editorType: SavedApiResponseEditorType;
  configuration: string;
  createdAt: string;
  updatedAt: string;
}

/** `hydrateProjects` 동시 호출 시 한 번만 디스크/마이그레이션 수행 */
let hydrateInFlight: Promise<void> | null = null;

const BROWSER_API_RESPONSES_STORAGE_KEY = "proxy-app-api-responses-v1";

/** projectId → apiName(api 표시 이름) → 저장된 응답 목록 */
const savedResponsesCache: Record<string, Record<string, SavedApiResponseRow[]>> = {};

/** preload `window.api.projects` 또는 `window.electron.ipcRenderer.invoke` 로 동일 IPC 사용 */
interface ProjectsDiskApi {
  list: () => Promise<unknown>;
  create: (input: { name: string; description: string; isFavorite: boolean }) => Promise<unknown>;
  updateFavorite: (input: { folderName: string; isFavorite: boolean }) => Promise<unknown>;
  export: (folderName: string) => Promise<unknown>;
  exportZip: (folderName: string) => Promise<unknown>;
  import: () => Promise<unknown>;
  migrateFromLegacy: (legacy: unknown[]) => Promise<unknown>;
  getRootPath: () => Promise<unknown>;
  deleteFolder: (folderName: string) => Promise<unknown>;
  listApis: (folderName: string) => Promise<unknown>;
  addApi: (folderName: string, payload: { method: string; tran: string; description: string; name: string }) => Promise<unknown>;
  updateApi: (folderName: string, apiId: string, payload: { method: string; tran: string; description: string; name: string }) => Promise<unknown>;
  syncApisFromSfdModule: (folderName: string, sfdAbsolutePath: string) => Promise<unknown>;
  deleteApi: (folderName: string, apiId: string) => Promise<unknown>;
  getResponsesStore: (folderName: string) => Promise<unknown>;
  upsertApiResponse: (
    folderName: string,
    apiName: string,
    payload: {
      value: string | null;
      label: string;
      description: string;
      editorType: string;
      configuration: string;
    },
  ) => Promise<unknown>;
  deleteApiResponse: (folderName: string, apiName: string, responseValue: string) => Promise<unknown>;
  importApisJsonPick: (
    folderName: string,
  ) => Promise<
    | { ok: true; imported: number; touchedApiNames: string[]; errors: string[] }
    | { ok: false; error: string; errors?: string[] }
  >;
  getAppProxyConfig: () => Promise<unknown>;
  setAppProxyConfig: (partial: {
    proxyServer?: {
      port?: number;
      enabled?: boolean;
      servingFolderName?: string | null;
      careDummyMobilityPath?: string | null;
      upstreamAutoStart?: boolean;
      upstreamServerWorkdir?: string | null;
      upstreamServerPort?: number;
      upstreamServerCommand?: string | null;
      upstreamNodePath?: string | null;
      careDummyAutoStart?: boolean;
      careDummyServerWorkdir?: string | null;
      careDummyServerPort?: number;
    };
    interceptGateway?: {
      enabled?: boolean;
      clientPort?: number;
      upstreamPort?: number;
      autoStartUpstream?: boolean;
      upstreamWorkdir?: string | null;
    };
    careGateway?: Record<string, unknown>;
    mockTranAliases?: Record<string, string> | null;
    mockProfile?: MockProfileType;
  }) => Promise<unknown>;
  setLinkedClients: (payload: { folderName: string; linkedClients: LinkedClientEntry[] }) => Promise<unknown>;
  getMockProxyStatus: () => Promise<unknown>;
}

function isFullProjectsDiskApi(x: unknown): x is ProjectsDiskApi {
  if (x == null || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  return (
    typeof p.list === "function" &&
    typeof p.create === "function" &&
    typeof p.updateFavorite === "function" &&
    typeof p.export === "function" &&
    typeof p.exportZip === "function" &&
    typeof p.import === "function" &&
    typeof p.migrateFromLegacy === "function" &&
    typeof p.getRootPath === "function" &&
    typeof p.deleteFolder === "function" &&
    typeof p.listApis === "function" &&
    typeof p.addApi === "function" &&
    typeof p.updateApi === "function" &&
    typeof p.deleteApi === "function" &&
    typeof p.syncApisFromSfdModule === "function" &&
    typeof p.getResponsesStore === "function" &&
    typeof p.upsertApiResponse === "function" &&
    typeof p.deleteApiResponse === "function" &&
    typeof p.importApisJsonPick === "function" &&
    typeof p.getAppProxyConfig === "function" &&
    typeof p.setAppProxyConfig === "function" &&
    typeof p.setLinkedClients === "function"
  );
}

function getProjectsApi(): ProjectsDiskApi | null {
  if (typeof window === "undefined") return null;
  const direct = window.api?.projects;
  if (isFullProjectsDiskApi(direct)) {
    return direct;
  }
  const ipc = window.electron?.ipcRenderer;
  if (!ipc || typeof ipc.invoke !== "function") return null;
  return {
    list: () => ipc.invoke("project-fs:list"),
    create: (payload) => ipc.invoke("project-fs:create", payload),
    updateFavorite: (payload) => ipc.invoke("project-fs:updateFavorite", payload),
    export: (folderName) => ipc.invoke("project-fs:export", folderName),
    exportZip: (folderName) => ipc.invoke("project-fs:exportZip", folderName),
    import: () => ipc.invoke("project-fs:import"),
    migrateFromLegacy: (legacy) => ipc.invoke("project-fs:migrateFromLegacy", legacy),
    getRootPath: () => ipc.invoke("project-fs:getRootPath"),
    deleteFolder: (folderName) => ipc.invoke("project-fs:delete", folderName),
    listApis: (folderName) => ipc.invoke("project-fs:listApis", folderName),
    addApi: (folderName, payload) => ipc.invoke("project-fs:addApi", folderName, payload),
    updateApi: (folderName, apiId, payload) => ipc.invoke("project-fs:updateApi", folderName, apiId, payload),
    syncApisFromSfdModule: (folderName, sfdAbsolutePath) =>
      ipc.invoke("project-fs:syncApisFromSfdModule", folderName, sfdAbsolutePath),
    deleteApi: (folderName, apiId) => ipc.invoke("project-fs:deleteApi", folderName, apiId),
    getResponsesStore: (folderName) => ipc.invoke("project-fs:getResponsesStore", folderName),
    upsertApiResponse: (folderName, apiName, payload) => ipc.invoke("project-fs:upsertApiResponse", folderName, apiName, payload),
    deleteApiResponse: (folderName, apiName, responseValue) => ipc.invoke("project-fs:deleteApiResponse", folderName, apiName, responseValue),
    importApisJsonPick: (folderName) => ipc.invoke("project-fs:importApisJsonPick", folderName),
    getAppProxyConfig: () => ipc.invoke("project-fs:getAppProxyConfig"),
    setAppProxyConfig: (partial) => ipc.invoke("project-fs:setAppProxyConfig", partial),
    setLinkedClients: (payload) => ipc.invoke("project-fs:setLinkedClients", payload),
    getMockProxyStatus: () => ipc.invoke("mock-proxy:status"),
  };
}

function readLegacyList(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as Project[];
  } catch {
    return [];
  }
}

function writeLegacyList(projects: Project[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(projects));
}

function clearLegacyList() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}

type ManifestLike = {
  version: number;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  folderName: string;
  linkedClients?: LinkedClientEntry[];
};

function manifestToProject(m: ManifestLike): Project {
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    isFavorite: m.isFavorite,
    folderName: m.folderName,
    ...(m.linkedClients?.length ? { linkedClients: m.linkedClients } : {}),
  };
}

export function requestOpenCreateProjectModal(detail: OpenCreateProjectModalDetail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_CREATE_PROJECT_MODAL_EVENT, { detail }));
}

export function notifyProjectsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROJECTS_CHANGED_EVENT));
}

type DiskApiRow = {
  id: string;
  method: string;
  tran: string;
  description: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

/** IPC·localStorage 레거시 `path` 필드를 `tran`으로 정규화 */
function coerceDiskApiRow(item: unknown): DiskApiRow | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.method !== "string") return null;
  const fromTran = typeof o.tran === "string" ? o.tran.trim() : "";
  const fromPath = typeof o.path === "string" ? String(o.path).trim() : "";
  const tran = fromTran || fromPath;
  return {
    id: o.id,
    method: String(o.method).toUpperCase(),
    tran,
    description: typeof o.description === "string" ? o.description : "",
    name: typeof o.name === "string" ? o.name : "",
    createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
  };
}

function diskRowToEndpoint(row: DiskApiRow): ApiEndpoint {
  return {
    id: row.id,
    method: row.method,
    tran: row.tran ?? "",
    description: row.description,
    name: row.name,
    lastModified: row.updatedAt,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}

function compareEndpointsByCreatedAt(a: ApiEndpoint, b: ApiEndpoint): number {
  const ta = Date.parse(a.createdAt?.trim() ?? "") || 0;
  const tb = Date.parse(b.createdAt?.trim() ?? "") || 0;
  if (ta !== tb) return ta - tb;
  return a.id.localeCompare(b.id);
}

/** API 등록일(`createdAt`) 기준 정렬 — 목록 UI용 */
export function sortApiEndpointsByCreatedAt(endpoints: ApiEndpoint[], order: "asc" | "desc"): ApiEndpoint[] {
  return [...endpoints].sort((a, b) => {
    const cmp = compareEndpointsByCreatedAt(a, b);
    return order === "asc" ? cmp : -cmp;
  });
}

function compareEndpointsByModifiedAt(a: ApiEndpoint, b: ApiEndpoint): number {
  const ta = Date.parse((a.updatedAt ?? a.lastModified)?.trim() ?? "") || 0;
  const tb = Date.parse((b.updatedAt ?? b.lastModified)?.trim() ?? "") || 0;
  if (ta !== tb) return ta - tb;
  return a.id.localeCompare(b.id);
}

/** Sort by last modified (`updatedAt` / `lastModified`). */
export function sortApiEndpointsByModifiedAt(endpoints: ApiEndpoint[], order: "asc" | "desc"): ApiEndpoint[] {
  return [...endpoints].sort((a, b) => {
    const cmp = compareEndpointsByModifiedAt(a, b);
    return order === "asc" ? cmp : -cmp;
  });
}

/** Selected API metadata and saved responses for JSON export. */
export interface ApiEndpointsExportBundle {
  version: 1;
  format: "dataforge-api-bundle";
  exportedAt: string;
  projectId: string;
  projectName: string;
  items: {
    method: string;
    tran: string;
    description: string;
    name: string;
    createdAt?: string;
    updatedAt?: string;
    responses: SavedApiResponseRow[];
  }[];
}

export function buildApiEndpointsExportBundle(project: Pick<Project, "id" | "name">, endpoints: ApiEndpoint[]): ApiEndpointsExportBundle {
  return {
    version: 1,
    format: "dataforge-api-bundle",
    exportedAt: new Date().toISOString(),
    projectId: project.id,
    projectName: project.name,
    items: endpoints.map((e) => ({
      method: e.method,
      tran: e.tran,
      description: e.description,
      name: e.name,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt ?? e.lastModified,
      responses: getSavedApiResponsesForApi(e.name),
    })),
  };
}

function readAllBrowserApisMap(): Record<string, DiskApiRow[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(BROWSER_APIS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, DiskApiRow[]>;
  } catch {
    return {};
  }
}

function writeAllBrowserApisMap(map: Record<string, DiskApiRow[]>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BROWSER_APIS_STORAGE_KEY, JSON.stringify(map));
}

function readBrowserApisRows(projectId: string): DiskApiRow[] {
  const all = readAllBrowserApisMap();
  const arr = all[projectId];
  if (!Array.isArray(arr)) return [];
  return arr.map((raw) => coerceDiskApiRow(raw)).filter((x): x is DiskApiRow => x != null);
}

function writeBrowserApisRows(projectId: string, rows: DiskApiRow[]) {
  const all = readAllBrowserApisMap();
  all[projectId] = rows;
  writeAllBrowserApisMap(all);
}

function removeBrowserApisForProject(projectId: string) {
  const all = readAllBrowserApisMap();
  delete all[projectId];
  writeAllBrowserApisMap(all);
}

function newDiskApiRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function validateBrowserApiPayload(input: { method: string; tran: string; description: string; name: string }): string | null {
  const methodRaw = input.method.trim().toUpperCase();
  if (!BROWSER_API_HTTP_METHODS.has(methodRaw)) return "invalid-method";
  if (!input.name.trim()) return "empty-name";
  if (!input.description.trim()) return "empty-description";
  if (!input.tran.trim()) return "empty-tran";
  return null;
}

function browserHasDuplicateEndpoint(items: DiskApiRow[], method: string, tranTrim: string, excludeId?: string): boolean {
  return items.some((x) => x.id !== excludeId && x.method === method && x.tran.trim() === tranTrim);
}

function browserHasDuplicateName(items: DiskApiRow[], nameTrim: string, excludeId?: string): boolean {
  return items.some((x) => x.id !== excludeId && x.name.trim() === nameTrim);
}

/** API 목록「마지막 변경」열 — `YYYY.MM.DD HH:MM` (24h) */
export function formatApiEndpointTableDate(value: string | undefined): string {
  if (!value?.trim()) return "—";
  const t = Date.parse(value);
  if (Number.isNaN(t)) return value.trim();
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${h}:${min}`;
}

export function notifyProjectApisChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROJECT_APIS_CHANGED_EVENT));
}

function newSavedResponseRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `saved-${crypto.randomUUID()}`;
  return `saved-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function coerceSavedResponseRow(o: unknown): SavedApiResponseRow | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  if (typeof r.value !== "string" || typeof r.label !== "string" || typeof r.configuration !== "string") return null;
  const ed = String(r.editorType ?? "default").toLowerCase();
  const editorType: SavedApiResponseEditorType = ed === "test" ? "test" : ed === "error" ? "error" : "default";
  const v = r.value;
  return {
    id: typeof r.id === "string" ? r.id : v,
    value: v,
    label: r.label,
    description: typeof r.description === "string" ? r.description : "",
    editorType,
    configuration: r.configuration,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date().toISOString(),
  };
}

function normalizeResponsesByApiName(raw: unknown): Record<string, SavedApiResponseRow[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, SavedApiResponseRow[]> = {};
  for (const [apiKey, rows] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(rows)) continue;
    const list = rows.map((x) => coerceSavedResponseRow(x)).filter((x): x is SavedApiResponseRow => x != null);
    if (list.length) out[apiKey] = list;
  }
  return out;
}

function readAllBrowserResponsesMap(): Record<string, Record<string, SavedApiResponseRow[]>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(BROWSER_API_RESPONSES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const top = parsed as Record<string, unknown>;
    const out: Record<string, Record<string, SavedApiResponseRow[]>> = {};
    for (const [projectId, inner] of Object.entries(top)) {
      if (!inner || typeof inner !== "object" || Array.isArray(inner)) continue;
      out[projectId] = normalizeResponsesByApiName(inner);
    }
    return out;
  } catch {
    return {};
  }
}

function writeAllBrowserResponsesMap(map: Record<string, Record<string, SavedApiResponseRow[]>>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BROWSER_API_RESPONSES_STORAGE_KEY, JSON.stringify(map));
}

function removeBrowserSavedResponsesForProject(projectId: string) {
  const all = readAllBrowserResponsesMap();
  delete all[projectId];
  writeAllBrowserResponsesMap(all);
  delete savedResponsesCache[projectId];
}

export function notifySavedApiResponsesChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROJECT_API_RESPONSES_CHANGED_EVENT));
}

/** `apiName`(API 표시 이름) 기준 저장된 응답 JSON 목록 — UI 목록 병합용 */
export function getSavedApiResponsesForApi(apiName: string): SavedApiResponseRow[] {
  const key = apiName.trim();
  if (!key) return [];
  const project = getProjectForApiName(key);
  if (!project) return [];
  return savedResponsesCache[project.id]?.[key] ?? [];
}

function parseActivityTimeMs(isoLike: string | undefined): number {
  if (!isoLike?.trim()) return 0;
  const t = new Date(isoLike).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** 메인 화면 등: API 메타·저장 응답 갱신 시각 기준 최근 수정 API (apiName 중복 시 더 최근 활동 1건) */
export interface RecentModifiedApiItem {
  projectId: string;
  projectName: string;
  apiName: string;
  /** API 등록 시 설명 (없으면 빈 문자열) */
  description: string;
  method: string;
  tran: string;
  lastActivityAt: string;
}

export function getRecentModifiedApis(limit: number): RecentModifiedApiItem[] {
  const cap = Math.max(1, Math.min(100, Math.floor(limit)));
  const projects = getStoredProjects();
  const candidates: RecentModifiedApiItem[] = [];

  for (const p of projects) {
    const endpoints = getEndpointsForProject(p.id);
    for (const e of endpoints) {
      const nameKey = e.name.trim();
      if (!nameKey) continue;
      const rows = savedResponsesCache[p.id]?.[nameKey] ?? [];
      let latestMs = 0;
      for (const r of rows) {
        latestMs = Math.max(latestMs, parseActivityTimeMs(r.updatedAt), parseActivityTimeMs(r.createdAt));
      }
      const epMs = Math.max(parseActivityTimeMs(e.updatedAt), parseActivityTimeMs(e.lastModified));
      const activityMs = Math.max(latestMs, epMs);
      if (activityMs <= 0) continue;

      candidates.push({
        projectId: p.id,
        projectName: p.name,
        apiName: e.name,
        description: e.description?.trim() ?? "",
        method: e.method,
        tran: e.tran,
        lastActivityAt: new Date(activityMs).toISOString(),
      });
    }
  }

  candidates.sort((a, b) => parseActivityTimeMs(b.lastActivityAt) - parseActivityTimeMs(a.lastActivityAt));

  const seenName = new Set<string>();
  const out: RecentModifiedApiItem[] = [];
  for (const c of candidates) {
    const k = c.apiName.trim();
    if (seenName.has(k)) continue;
    seenName.add(k);
    out.push(c);
    if (out.length >= cap) break;
  }
  return out;
}

export async function refreshSavedResponsesFromDisk(projectId: string): Promise<void> {
  const p = getStoredProjects().find((x) => x.id === projectId);
  if (!p) {
    delete savedResponsesCache[projectId];
    notifySavedApiResponsesChanged();
    return;
  }

  const disk = getProjectsApi();
  if (!disk) {
    const all = readAllBrowserResponsesMap();
    savedResponsesCache[projectId] = all[projectId] ?? {};
    notifySavedApiResponsesChanged();
    return;
  }

  const folder = p.folderName?.trim();
  if (!folder) {
    delete savedResponsesCache[projectId];
    notifySavedApiResponsesChanged();
    return;
  }
  try {
    const raw = (await disk.getResponsesStore(folder)) as { version?: number; byApiName?: unknown };
    savedResponsesCache[projectId] = normalizeResponsesByApiName(raw?.byApiName ?? {});
  } catch {
    savedResponsesCache[projectId] = {};
  }
  notifySavedApiResponsesChanged();
}

export function formatSaveApiResponseUserError(code: string): string {
  const ko: Record<string, string> = {
    "not-found": "프로젝트를 찾을 수 없습니다.",
    "no-folder": "프로젝트 폴더 정보가 없어 저장할 수 없습니다.",
    "invalid-folder": "프로젝트를 찾을 수 없습니다.",
    "empty-api-name": "API 이름이 없습니다.",
    "save-failed": "응답을 저장하지 못했습니다.",
    "ipc-not-registered": "저장 기능이 연결되지 않았습니다. 앱을 다시 실행해 주세요.",
    "empty-value": "삭제할 응답이 지정되지 않았습니다.",
    "response-not-found": "삭제할 응답을 찾을 수 없습니다.",
    "delete-failed": "응답을 삭제하지 못했습니다.",
  };
  return ko[code] ?? `요청을 처리할 수 없습니다. (${code})`;
}

export async function upsertSavedApiResponse(
  projectId: string,
  apiName: string,
  input: {
    value: string | null;
    label: string;
    description: string;
    editorType: SavedApiResponseEditorType;
    configuration: string;
  },
): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  const p = getStoredProjects().find((x) => x.id === projectId);
  if (!p) return { ok: false, error: "not-found" };

  const apiKey = apiName.trim();
  if (!apiKey) return { ok: false, error: "empty-api-name" };

  const disk = getProjectsApi();
  const now = new Date().toISOString();

  if (!disk) {
    const all = readAllBrowserResponsesMap();
    const proj = { ...(all[projectId] ?? {}) };
    const list = [...(proj[apiKey] ?? [])];
    const existing = input.value?.trim() || null;
    let outValue: string;

    if (existing) {
      const idx = list.findIndex((r) => r.value === existing);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          label: input.label.trim() || apiKey,
          description: input.description.trim(),
          editorType: input.editorType,
          configuration: input.configuration,
          updatedAt: now,
        };
        outValue = list[idx].value;
      } else {
        outValue = newSavedResponseRowId();
        list.push({
          id: outValue,
          value: outValue,
          label: input.label.trim() || apiKey,
          description: input.description.trim(),
          editorType: input.editorType,
          configuration: input.configuration,
          createdAt: now,
          updatedAt: now,
        });
      }
    } else {
      outValue = newSavedResponseRowId();
      list.push({
        id: outValue,
        value: outValue,
        label: input.label.trim() || apiKey,
        description: input.description.trim(),
        editorType: input.editorType,
        configuration: input.configuration,
        createdAt: now,
        updatedAt: now,
      });
    }

    proj[apiKey] = list;
    all[projectId] = proj;
    writeAllBrowserResponsesMap(all);
    savedResponsesCache[projectId] = proj;
    notifySavedApiResponsesChanged();
    return { ok: true, value: outValue };
  }

  const folder = p.folderName?.trim();
  if (!folder) return { ok: false, error: "no-folder" };

  try {
    const raw = await disk.upsertApiResponse(folder, apiKey, {
      value: input.value,
      label: input.label.trim() || apiKey,
      description: input.description.trim(),
      editorType: input.editorType,
      configuration: input.configuration,
    });
    const res = raw as { ok?: boolean; value?: string; error?: string };
    if (!res.ok) {
      const err = res.error ?? "save-failed";
      if (/no handler registered/i.test(String(err))) return { ok: false, error: "ipc-not-registered" };
      return { ok: false, error: err };
    }
    await refreshSavedResponsesFromDisk(projectId);
    return { ok: true, value: String(res.value ?? "") };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/no handler registered/i.test(msg)) return { ok: false, error: "ipc-not-registered" };
    return { ok: false, error: msg };
  }
}

export async function deleteSavedApiResponse(projectId: string, apiName: string, responseValue: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = getStoredProjects().find((x) => x.id === projectId);
  if (!p) return { ok: false, error: "not-found" };

  const apiKey = apiName.trim();
  if (!apiKey) return { ok: false, error: "empty-api-name" };

  const val = responseValue.trim();
  if (!val) return { ok: false, error: "empty-value" };

  const disk = getProjectsApi();

  if (!disk) {
    const all = readAllBrowserResponsesMap();
    const proj = { ...(all[projectId] ?? {}) };
    const list = [...(proj[apiKey] ?? [])];
    const idx = list.findIndex((r) => r.value === val);
    if (idx < 0) return { ok: false, error: "response-not-found" };
    list.splice(idx, 1);
    if (list.length) proj[apiKey] = list;
    else delete proj[apiKey];
    all[projectId] = proj;
    writeAllBrowserResponsesMap(all);
    savedResponsesCache[projectId] = proj;
    notifySavedApiResponsesChanged();
    return { ok: true };
  }

  const folder = p.folderName?.trim();
  if (!folder) return { ok: false, error: "no-folder" };

  try {
    if (typeof disk.deleteApiResponse !== "function") {
      return { ok: false, error: "ipc-not-registered" };
    }
    const raw = await disk.deleteApiResponse(folder, apiKey, val);
    const res = raw as { ok?: boolean; error?: string };
    if (!res.ok) {
      const err = res.error ?? "delete-failed";
      if (/no handler registered/i.test(String(err))) return { ok: false, error: "ipc-not-registered" };
      return { ok: false, error: err };
    }
    await refreshSavedResponsesFromDisk(projectId);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/no handler registered/i.test(msg)) return { ok: false, error: "ipc-not-registered" };
    return { ok: false, error: msg };
  }
}

/** 디스크·브라우저에 저장된 API 목록 (데모/mock 폴백 없음). 등록일(`createdAt`) 오름차순. */
export function getEndpointsForProject(projectId: string): ApiEndpoint[] {
  let list: ApiEndpoint[];
  if (Object.prototype.hasOwnProperty.call(diskEndpointsCache, projectId)) {
    list = diskEndpointsCache[projectId] ?? [];
  } else if (typeof window !== "undefined" && !getProjectsApi()) {
    const rows = readBrowserApisRows(projectId);
    diskEndpointsCache[projectId] = rows.map(diskRowToEndpoint);
    list = diskEndpointsCache[projectId] ?? [];
  } else {
    return [];
  }
  return [...list].sort(compareEndpointsByCreatedAt);
}

export function getProjectForApiName(apiName: string): Project | null {
  const projects = getStoredProjects();
  for (const p of projects) {
    if (getEndpointsForProject(p.id).some((e) => e.name === apiName)) return p;
  }
  return null;
}

/** `apiName`이 프로젝트에 저장된 API인 경우 해당 엔드포인트(메서드·경로·설명 등) */
export function getApiEndpointByName(apiName: string): ApiEndpoint | null {
  const project = getProjectForApiName(apiName);
  if (!project) return null;
  return getEndpointsForProject(project.id).find((e) => e.name === apiName) ?? null;
}

export async function refreshProjectApisFromDisk(projectId: string): Promise<void> {
  const disk = getProjectsApi();
  if (!disk) {
    const rows = readBrowserApisRows(projectId);
    diskEndpointsCache[projectId] = rows.map(diskRowToEndpoint);
    await refreshSavedResponsesFromDisk(projectId);
    notifyProjectApisChanged();
    return;
  }

  const p = getStoredProjects().find((x) => x.id === projectId);
  const folder = p?.folderName?.trim();
  if (!folder) {
    delete diskEndpointsCache[projectId];
    await refreshSavedResponsesFromDisk(projectId);
    notifyProjectApisChanged();
    return;
  }
  try {
    const raw = (await disk.listApis(folder)) as unknown;
    diskEndpointsCache[projectId] = Array.isArray(raw)
      ? raw
          .map((item) => coerceDiskApiRow(item))
          .filter((x): x is DiskApiRow => x != null)
          .map(diskRowToEndpoint)
      : [];
  } catch {
    diskEndpointsCache[projectId] = [];
  }
  await refreshSavedResponsesFromDisk(projectId);
  notifyProjectApisChanged();
}

async function refreshAllProjectApisFromDisk(): Promise<void> {
  const projects = getStoredProjects();
  await Promise.all(projects.map((p) => refreshProjectApisFromDisk(p.id)));
}

export function formatAddApiUserError(code: string): string {
  const ko: Record<string, string> = {
    "electron-only": "이 환경에서는 API를 저장할 수 없습니다.",
    "no-folder": "프로젝트 폴더 정보가 없어 API를 저장할 수 없습니다.",
    "invalid-folder": "프로젝트를 찾을 수 없습니다.",
    "not-found": "프로젝트를 찾을 수 없습니다.",
    "invalid-method": "HTTP 메서드를 확인해 주세요.",
    "empty-name": "API 이름을 입력해 주세요.",
    "empty-path": "트랜 이름을 입력해 주세요.",
    "empty-tran": "트랜 이름을 입력해 주세요.",
    "empty-description": "API 설명을 입력해 주세요.",
    "api-not-found": "수정·삭제할 API를 찾을 수 없습니다.",
    "duplicate-endpoint": "같은 메서드와 트랜 이름의 API가 이미 있습니다.",
    "duplicate-api-name": "같은 API 이름이 이미 있습니다.",
    "add-failed": "API를 저장하지 못했습니다.",
    "update-failed": "API를 수정하지 못했습니다.",
    "delete-failed": "API를 삭제하지 못했습니다.",
    "ipc-not-registered": "메인 프로세스에 API 저장 기능이 연결되지 않았습니다. 앱을 완전히 종료한 뒤 `npm run dev`로 다시 실행하거나 `npm run build` 후 실행해 주세요.",
    "no-valid-json": "추가할 수 있는 JSON이 없습니다. 파일명(확장자 제외)이 API 이름이 됩니다.",
    cancelled: "취소되었습니다.",
    "import-failed": "JSON 가져오기에 실패했습니다.",
  };
  return ko[code] ?? `API를 저장할 수 없습니다. (${code})`;
}

async function ipcInvokeDisk(fn: () => Promise<unknown>, defaultErrorCode: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const raw = await fn();
    const res = raw as { ok?: boolean; error?: string };
    if (!res.ok) return { ok: false, error: res.error ?? defaultErrorCode };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/no handler registered/i.test(msg)) {
      return { ok: false, error: "ipc-not-registered" };
    }
    return { ok: false, error: msg };
  }
}

export async function addProjectApiEndpoint(
  projectId: string,
  input: { method: string; tran: string; description: string; name: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = getStoredProjects().find((x) => x.id === projectId);
  if (!p) return { ok: false, error: "not-found" };

  const br = validateBrowserApiPayload(input);
  if (br) return { ok: false, error: br };

  const disk = getProjectsApi();
  if (!disk) {
    const items = readBrowserApisRows(projectId);
    const methodRaw = input.method.trim().toUpperCase();
    const normTran = input.tran.trim();
    const nameTrim = input.name.trim();
    if (browserHasDuplicateEndpoint(items, methodRaw, normTran)) return { ok: false, error: "duplicate-endpoint" };
    if (browserHasDuplicateName(items, nameTrim)) return { ok: false, error: "duplicate-api-name" };
    const now = new Date().toISOString();
    const row: DiskApiRow = {
      id: newDiskApiRowId(),
      method: methodRaw,
      tran: normTran,
      description: input.description.trim(),
      name: nameTrim,
      createdAt: now,
      updatedAt: now,
    };
    items.push(row);
    writeBrowserApisRows(projectId, items);
    diskEndpointsCache[projectId] = items.map(diskRowToEndpoint);
    notifyProjectApisChanged();
    return { ok: true };
  }

  const folder = p.folderName?.trim();
  if (!folder) return { ok: false, error: "no-folder" };
  const res = await ipcInvokeDisk(() => disk.addApi(folder, input), "add-failed");
  if (!res.ok) return { ok: false, error: res.error };
  try {
    projectsCache = ((await disk.list()) as unknown[]).map((m) => manifestToProject(m as ManifestLike));
  } catch {
    /* keep cache */
  }
  await refreshProjectApisFromDisk(projectId);
  notifyProjectsChanged();
  return { ok: true };
}

export async function updateProjectApiEndpoint(
  projectId: string,
  apiId: string,
  input: { method: string; tran: string; description: string; name: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = getStoredProjects().find((x) => x.id === projectId);
  if (!p) return { ok: false, error: "not-found" };

  const br = validateBrowserApiPayload(input);
  if (br) return { ok: false, error: br };

  const disk = getProjectsApi();
  if (!disk) {
    const items = readBrowserApisRows(projectId);
    const idx = items.findIndex((x) => x.id === apiId);
    if (idx < 0) return { ok: false, error: "api-not-found" };
    const methodRaw = input.method.trim().toUpperCase();
    const normTran = input.tran.trim();
    const nameTrim = input.name.trim();
    if (browserHasDuplicateEndpoint(items, methodRaw, normTran, apiId)) return { ok: false, error: "duplicate-endpoint" };
    if (browserHasDuplicateName(items, nameTrim, apiId)) return { ok: false, error: "duplicate-api-name" };
    const now = new Date().toISOString();
    const prev = items[idx];
    const oldName = prev.name.trim();
    items[idx] = {
      ...prev,
      method: methodRaw,
      tran: normTran,
      description: input.description.trim(),
      name: nameTrim,
      updatedAt: now,
    };
    writeBrowserApisRows(projectId, items);
    diskEndpointsCache[projectId] = items.map(diskRowToEndpoint);

    if (oldName !== nameTrim) {
      const all = readAllBrowserResponsesMap();
      const proj = { ...(all[projectId] ?? {}) };
      if (Object.prototype.hasOwnProperty.call(proj, oldName)) {
        const moved = proj[oldName];
        if (moved != null && moved.length > 0) {
          proj[nameTrim] = [...moved, ...(proj[nameTrim] ?? [])];
        }
        delete proj[oldName];
        all[projectId] = proj;
        writeAllBrowserResponsesMap(all);
        savedResponsesCache[projectId] = proj;
        notifySavedApiResponsesChanged();
      }
    }

    notifyProjectApisChanged();
    return { ok: true };
  }

  const folder = p.folderName?.trim();
  if (!folder) return { ok: false, error: "no-folder" };
  const res = await ipcInvokeDisk(() => disk.updateApi(folder, apiId, input), "update-failed");
  if (!res.ok) return { ok: false, error: res.error };
  try {
    projectsCache = ((await disk.list()) as unknown[]).map((m) => manifestToProject(m as ManifestLike));
  } catch {
    /* keep */
  }
  await refreshProjectApisFromDisk(projectId);
  await refreshSavedResponsesFromDisk(projectId);
  notifyProjectsChanged();
  return { ok: true };
}

/**
 * Care `common/core/Sfd.module.js`의 interfaces와 비교해,
 * proxy API의 **트랜(`tran`) 또는 API 이름(`name`)** 이 care `tranId`와 같으면(공백·대소문자 무시)
 * `name`을 module **키**, `description`을 **desc**로 맞춤.
 * Electron + 절대 경로가 있으면 한 번에 디스크 반영; 그 외에는 파일 내용(`sourceText`)으로 갱신.
 */
export async function syncProjectApisFromCareSfd(
  projectId: string,
  opts: { filePath?: string; sourceText?: string },
): Promise<{ ok: true; updated: number; skipped: string[] } | { ok: false; error: string }> {
  const p = getStoredProjects().find((x) => x.id === projectId);
  if (!p) return { ok: false, error: "not-found" };

  const pathTrim = opts.filePath?.trim();
  const disk = getProjectsApi();

  if (disk && pathTrim && typeof (disk as { syncApisFromSfdModule?: unknown }).syncApisFromSfdModule === "function") {
    const folder = p.folderName?.trim();
    if (!folder) return { ok: false, error: "no-folder" };
    try {
      const raw = await (disk as { syncApisFromSfdModule: (f: string, path: string) => Promise<unknown> }).syncApisFromSfdModule(
        folder,
        pathTrim,
      );
      const res = raw as { ok?: boolean; updated?: number; skipped?: string[]; error?: string };
      if (!res.ok) return { ok: false, error: res.error ?? "sync-failed" };
      try {
        projectsCache = ((await disk.list()) as unknown[]).map((m) => manifestToProject(m as ManifestLike));
      } catch {
        /* keep */
      }
      await refreshProjectApisFromDisk(projectId);
      await refreshSavedResponsesFromDisk(projectId);
      notifyProjectsChanged();
      return { ok: true, updated: Number(res.updated) || 0, skipped: Array.isArray(res.skipped) ? res.skipped : [] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/no handler registered/i.test(msg)) return { ok: false, error: "ipc-not-registered" };
      return { ok: false, error: msg };
    }
  }

  const text = opts.sourceText?.trim();
  if (!text) return { ok: false, error: "no-source" };

  const careLookup = buildCareTranLookup(parseSfdModuleInterfaces(text));
  const endpoints = getEndpointsForProject(projectId);
  let updated = 0;
  const skipped: string[] = [];

  for (const e of endpoints) {
    const care = findCareForProxyApi(careLookup, e);
    if (!care) continue;
    const nk = care.key.trim();
    const desc = care.desc.trim() || e.description.trim();
    if (e.name.trim() === nk && e.description.trim() === desc) continue;
    const r = await updateProjectApiEndpoint(projectId, e.id, {
      method: e.method,
      tran: e.tran,
      description: desc,
      name: nk,
    });
    if (!r.ok) skipped.push(`${e.tran.trim() || e.name.trim()}: ${r.error}`);
    else updated += 1;
  }

  return { ok: true, updated, skipped };
}

export async function deleteProjectApiEndpoint(projectId: string, apiId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = getStoredProjects().find((x) => x.id === projectId);
  if (!p) return { ok: false, error: "not-found" };

  const disk = getProjectsApi();
  if (!disk) {
    const items = readBrowserApisRows(projectId);
    const next = items.filter((x) => x.id !== apiId);
    if (next.length === items.length) return { ok: false, error: "api-not-found" };
    writeBrowserApisRows(projectId, next);
    diskEndpointsCache[projectId] = next.map(diskRowToEndpoint);
    notifyProjectApisChanged();
    return { ok: true };
  }

  const folder = p.folderName?.trim();
  if (!folder) return { ok: false, error: "no-folder" };
  const res = await ipcInvokeDisk(() => disk.deleteApi(folder, apiId), "delete-failed");
  if (!res.ok) return { ok: false, error: res.error };
  try {
    projectsCache = ((await disk.list()) as unknown[]).map((m) => manifestToProject(m as ManifestLike));
  } catch {
    /* keep */
  }
  await refreshProjectApisFromDisk(projectId);
  notifyProjectsChanged();
  return { ok: true };
}

export function formatProjectUpdatedLabel(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffMs = Date.now() - t;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "방금 전";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

/** Electron: userData/DataForge-projects 에서 목록 로드. 기존 localStorage 데이터는 1회 마이그레이션. */
export async function hydrateProjects(): Promise<void> {
  if (typeof window === "undefined") return;
  if (hydrateInFlight) return hydrateInFlight;

  hydrateInFlight = (async () => {
    const disk = getProjectsApi();
    if (disk) {
      let list = (await disk.list()) as unknown[];
      if (list.length === 0) {
        const legacy = readLegacyList();
        if (legacy.length > 0) {
          await disk.migrateFromLegacy(legacy as unknown[]);
          clearLegacyList();
          list = (await disk.list()) as unknown[];
        }
      }
      projectsCache = list.map((m) => manifestToProject(m as ManifestLike));
    } else {
      const legacyMap = readBrowserLinkedClientsMap();
      projectsCache = readLegacyList().map((p) => ({
        ...p,
        ...(legacyMap[p.id]?.length ? { linkedClients: legacyMap[p.id] } : {}),
      }));
    }

    notifyProjectsChanged();
    await refreshAllProjectApisFromDisk();
  })().finally(() => {
    hydrateInFlight = null;
  });

  return hydrateInFlight;
}

export function getStoredProjects(): Project[] {
  if (typeof window === "undefined") return [];
  if (projectsCache !== null) return projectsCache;
  if (!getProjectsApi()) {
    const legacyMap = readBrowserLinkedClientsMap();
    projectsCache = readLegacyList().map((p) => ({
      ...p,
      ...(legacyMap[p.id]?.length ? { linkedClients: legacyMap[p.id] } : {}),
    }));
    return projectsCache;
  }
  return [];
}

export function hasProjectDiskApi(): boolean {
  return Boolean(getProjectsApi());
}

export type MockProxyStatus = {
  listening: boolean;
  port: number | null;
  lastError?: string;
  interceptGateway?: { listening: boolean; port: number | null; lastError?: string };
  upstreamSpawn?: { running: boolean; lastError?: string };
  careMockSpawn?: { running: boolean; lastError?: string };
};

/** Electron 전용 — 브라우저 단독 실행 시 null */
export async function getMockProxyStatus(): Promise<MockProxyStatus | null> {
  if (typeof window === "undefined") return null;
  const disk = window.api?.projects as { getMockProxyStatus?: () => Promise<MockProxyStatus> } | undefined;
  if (disk && typeof disk.getMockProxyStatus === "function") {
    try {
      return await disk.getMockProxyStatus();
    } catch {
      return null;
    }
  }
  const ipc = window.electron?.ipcRenderer;
  if (ipc && typeof ipc.invoke === "function") {
    try {
      return (await ipc.invoke("mock-proxy:status")) as MockProxyStatus;
    } catch {
      return null;
    }
  }
  return null;
}

export async function getAppProxyConfig(): Promise<AppProxyConfig> {
  const disk = getProjectsApi();
  if (disk && typeof disk.getAppProxyConfig === "function") {
    try {
      return (await disk.getAppProxyConfig()) as AppProxyConfig;
    } catch {
      return defaultAppProxyConfig();
    }
  }
  return readBrowserAppProxyConfig();
}

export async function setAppProxyConfig(
  partial: {
    proxyServer?: {
      port?: number;
      enabled?: boolean;
      servingFolderName?: string | null;
      careDummyMobilityPath?: string | null;
      upstreamAutoStart?: boolean;
      upstreamServerWorkdir?: string | null;
      upstreamServerPort?: number;
      upstreamServerCommand?: string | null;
      upstreamNodePath?: string | null;
      careDummyAutoStart?: boolean;
      careDummyServerWorkdir?: string | null;
      careDummyServerPort?: number;
    };
    interceptGateway?: {
      enabled?: boolean;
      clientPort?: number;
      upstreamPort?: number;
      autoStartUpstream?: boolean;
      upstreamWorkdir?: string | null;
    };
    /** @deprecated IPC 호환 */
    careGateway?: Record<string, unknown>;
    mockTranAliases?: Record<string, string> | null;
    mockProfile?: MockProfileType;
  },
): Promise<{ ok: true; config: AppProxyConfig } | { ok: false; error: string }> {
  const disk = getProjectsApi();
  if (disk && typeof disk.setAppProxyConfig === "function") {
    const res = (await disk.setAppProxyConfig(partial)) as { ok?: boolean; config?: AppProxyConfig; error?: string };
    if (res?.ok && res.config) return { ok: true, config: res.config };
    return { ok: false, error: res?.error ?? "save-failed" };
  }
  const cur = readBrowserAppProxyConfig();
  const ps = partial.proxyServer;
  let servingFolderName = cur.proxyServer.servingFolderName ?? null;
  if (ps && "servingFolderName" in ps) {
    if (ps.servingFolderName === null || ps.servingFolderName === "") servingFolderName = null;
    else if (typeof ps.servingFolderName === "string") {
      const t = ps.servingFolderName.trim();
      servingFolderName = t || null;
    }
  }
  let careDummyMobilityPath = cur.proxyServer.careDummyMobilityPath ?? null;
  let careDummyAutoStart = Boolean(cur.proxyServer.careDummyAutoStart);
  let careDummyServerWorkdir = cur.proxyServer.careDummyServerWorkdir ?? null;
  let careDummyServerPort =
    typeof cur.proxyServer.careDummyServerPort === "number" && Number.isFinite(cur.proxyServer.careDummyServerPort)
      ? Math.min(65535, Math.max(1, Math.floor(cur.proxyServer.careDummyServerPort)))
      : 7778;
  let upstreamAutoStart = typeof cur.proxyServer.upstreamAutoStart === "boolean" ? cur.proxyServer.upstreamAutoStart : careDummyAutoStart;
  let upstreamServerWorkdir = cur.proxyServer.upstreamServerWorkdir ?? careDummyServerWorkdir;
  let upstreamServerPort =
    typeof cur.proxyServer.upstreamServerPort === "number" && Number.isFinite(cur.proxyServer.upstreamServerPort)
      ? Math.min(65535, Math.max(1, Math.floor(cur.proxyServer.upstreamServerPort)))
      : careDummyServerPort;
  let upstreamServerCommand = cur.proxyServer.upstreamServerCommand ?? null;
  let upstreamNodePath = cur.proxyServer.upstreamNodePath ?? null;
  if (ps && "careDummyMobilityPath" in ps) {
    if (ps.careDummyMobilityPath === null || ps.careDummyMobilityPath === "") careDummyMobilityPath = null;
    else if (typeof ps.careDummyMobilityPath === "string") {
      const t = ps.careDummyMobilityPath.trim();
      careDummyMobilityPath = t || null;
    }
  }
  if (ps && typeof ps.careDummyAutoStart === "boolean") careDummyAutoStart = ps.careDummyAutoStart;
  if (ps && "careDummyServerWorkdir" in ps) {
    if (ps.careDummyServerWorkdir === null || ps.careDummyServerWorkdir === "") careDummyServerWorkdir = null;
    else if (typeof ps.careDummyServerWorkdir === "string") {
      const t = ps.careDummyServerWorkdir.trim();
      careDummyServerWorkdir = t || null;
    }
  }
  if (ps && typeof ps.careDummyServerPort === "number" && Number.isFinite(ps.careDummyServerPort)) {
    careDummyServerPort = Math.min(65535, Math.max(1, Math.floor(ps.careDummyServerPort)));
  }
  if (ps && typeof ps.upstreamAutoStart === "boolean") upstreamAutoStart = ps.upstreamAutoStart;
  if (ps && "upstreamServerWorkdir" in ps) {
    if (ps.upstreamServerWorkdir === null || ps.upstreamServerWorkdir === "") upstreamServerWorkdir = null;
    else if (typeof ps.upstreamServerWorkdir === "string") {
      const t = ps.upstreamServerWorkdir.trim();
      upstreamServerWorkdir = t || null;
    }
  }
  if (ps && typeof ps.upstreamServerPort === "number" && Number.isFinite(ps.upstreamServerPort)) {
    upstreamServerPort = Math.min(65535, Math.max(1, Math.floor(ps.upstreamServerPort)));
  }
  if (ps && "upstreamServerCommand" in ps) {
    if (ps.upstreamServerCommand === null || ps.upstreamServerCommand === "") upstreamServerCommand = null;
    else if (typeof ps.upstreamServerCommand === "string") {
      const t = ps.upstreamServerCommand.trim();
      upstreamServerCommand = t || null;
    }
  }
  if (ps && "upstreamNodePath" in ps) {
    if (ps.upstreamNodePath === null || ps.upstreamNodePath === "") upstreamNodePath = null;
    else if (typeof ps.upstreamNodePath === "string") {
      const t = ps.upstreamNodePath.trim();
      upstreamNodePath = t || null;
    }
  }

  let interceptGateway: AppProxyInterceptGatewayConfig = {
    ...defaultAppProxyConfig().interceptGateway!,
    ...(cur.interceptGateway ?? {}),
  };
  const igIn = partial.interceptGateway ?? partial.careGateway;
  if (igIn && typeof igIn === "object") {
    const g = igIn as Record<string, unknown>;
    if (typeof g.enabled === "boolean") interceptGateway = { ...interceptGateway, enabled: g.enabled };
    if (typeof g.clientPort === "number" && Number.isFinite(g.clientPort)) {
      interceptGateway = { ...interceptGateway, clientPort: Math.min(65535, Math.max(1, Math.floor(g.clientPort))) };
    } else if (typeof g.listenPort === "number" && Number.isFinite(g.listenPort)) {
      interceptGateway = { ...interceptGateway, clientPort: Math.min(65535, Math.max(1, Math.floor(g.listenPort))) };
    }
    if (typeof g.upstreamPort === "number" && Number.isFinite(g.upstreamPort)) {
      interceptGateway = { ...interceptGateway, upstreamPort: Math.min(65535, Math.max(1, Math.floor(g.upstreamPort))) };
    } else if (typeof g.backendPort === "number" && Number.isFinite(g.backendPort)) {
      interceptGateway = { ...interceptGateway, upstreamPort: Math.min(65535, Math.max(1, Math.floor(g.backendPort))) };
    }
    if (typeof g.autoStartUpstream === "boolean") interceptGateway = { ...interceptGateway, autoStartUpstream: g.autoStartUpstream };
    else if (typeof g.autoStartDummy === "boolean") interceptGateway = { ...interceptGateway, autoStartUpstream: g.autoStartDummy };
    if ("upstreamWorkdir" in g) {
      const d = g.upstreamWorkdir;
      if (d === null || d === "") interceptGateway = { ...interceptGateway, upstreamWorkdir: null };
      else if (typeof d === "string") {
        const t = d.trim();
        interceptGateway = { ...interceptGateway, upstreamWorkdir: t || null };
      }
    } else if ("dummyServerDirectory" in g) {
      const d = g.dummyServerDirectory;
      if (d === null || d === "") interceptGateway = { ...interceptGateway, upstreamWorkdir: null };
      else if (typeof d === "string") {
        const t = d.trim();
        interceptGateway = { ...interceptGateway, upstreamWorkdir: t || null };
      }
    }
  }

  let mockTranAliases = coerceBrowserMockTranAliases(cur.mockTranAliases);
  if (partial.mockTranAliases !== undefined) {
    mockTranAliases = partial.mockTranAliases == null ? {} : coerceBrowserMockTranAliases(partial.mockTranAliases);
  }
  let mockProfile = coerceBrowserMockProfile(cur.mockProfile);
  if (partial.mockProfile !== undefined) {
    mockProfile = coerceBrowserMockProfile(partial.mockProfile);
  }

  const next: AppProxyConfig = {
    version: APP_PROXY_CONFIG_FILE_VERSION,
    proxyServer: {
      port:
        partial.proxyServer?.port != null && Number.isFinite(partial.proxyServer.port)
          ? Math.min(65535, Math.max(1, Math.floor(partial.proxyServer.port)))
          : cur.proxyServer.port,
      enabled: partial.proxyServer?.enabled ?? cur.proxyServer.enabled,
      servingFolderName,
      careDummyMobilityPath,
      upstreamAutoStart,
      upstreamServerWorkdir,
      upstreamServerPort,
      upstreamServerCommand,
      upstreamNodePath,
      careDummyAutoStart,
      careDummyServerWorkdir,
      careDummyServerPort,
    },
    interceptGateway,
    mockProfile,
    mockTranAliases,
  };
  writeBrowserAppProxyConfig(next);
  return { ok: true, config: next };
}

export async function updateProjectLinkedClients(
  projectId: string,
  linkedClients: LinkedClientEntry[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = getStoredProjects().find((x) => x.id === projectId);
  if (!p) return { ok: false, error: "not-found" };
  const folder = p.folderName?.trim();
  const disk = getProjectsApi();
  if (disk && typeof disk.setLinkedClients === "function" && folder) {
    const res = (await disk.setLinkedClients({ folderName: folder, linkedClients })) as { ok?: boolean; error?: string };
    if (!res?.ok) return { ok: false, error: res?.error ?? "save-failed" };
    await hydrateProjects();
    return { ok: true };
  }
  const map = readBrowserLinkedClientsMap();
  if (linkedClients.length) map[projectId] = linkedClients;
  else delete map[projectId];
  writeBrowserLinkedClientsMap(map);
  if (projectsCache) {
    projectsCache = projectsCache.map((proj) =>
      proj.id === projectId ? { ...proj, linkedClients: linkedClients.length ? linkedClients : undefined } : proj,
    );
  }
  notifyProjectsChanged();
  return { ok: true };
}

export function createProjectRecord(input: { name: string; description: string; isFavorite: boolean }): Project {
  const now = new Date().toISOString();
  const name = input.name.trim();
  const description = input.description.trim();
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    name,
    description,
    createdAt: now,
    updatedAt: now,
    isFavorite: input.isFavorite,
    folderName: slugify(name),
  };
}

export type AddProjectResult = { ok: true; project: Project } | { ok: false; error: string };

/** UI용: IPC/스토어 오류 코드 → 한글 메시지 */
/** 삭제 실패 시 UI 메시지 */
export function formatDeleteProjectUserError(codeOrMessage: string): string {
  const ko: Record<string, string> = {
    "not-found": "프로젝트를 찾을 수 없습니다.",
    "no-folder": "디스크에 연결된 폴더 정보가 없어 삭제할 수 없습니다.",
    "invalid-folder": "삭제할 수 없는 프로젝트입니다.",
    "io-error": "파일 삭제 중 오류가 발생했습니다.",
    "delete-failed": "삭제에 실패했습니다.",
  };
  if (ko[codeOrMessage]) return ko[codeOrMessage];
  return `삭제에 실패했습니다. (${codeOrMessage})`;
}

export const DUPLICATE_PROJECT_NAME_MESSAGE = "이미 같은 이름의 프로젝트가 있습니다. 다른 이름을 사용해 주세요.";

export function formatAddProjectUserError(codeOrMessage: string): string {
  const ko: Record<string, string> = {
    "empty-name": "프로젝트 이름을 입력해 주세요.",
    "duplicate-name": DUPLICATE_PROJECT_NAME_MESSAGE,
    "invalid-response": "저장 응답이 올바르지 않습니다.",
    "missing-project": "저장 응답에 프로젝트 정보가 없습니다.",
    "create-failed": "프로젝트를 만들 수 없습니다.",
  };
  if (ko[codeOrMessage]) return ko[codeOrMessage];
  return `프로젝트를 저장할 수 없습니다. (${codeOrMessage})`;
}

export async function addProject(input: { name: string; description: string; isFavorite: boolean }): Promise<AddProjectResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "empty-name" };

  const disk = getProjectsApi();
  if (disk) {
    try {
      const raw = await disk.create(input);
      if (raw == null || typeof raw !== "object") {
        return { ok: false, error: "invalid-response" };
      }
      const res = raw as { ok?: boolean; error?: string; project?: ManifestLike };
      if (!res.ok) {
        return { ok: false, error: res.error ?? "create-failed" };
      }
      if (!res.project || typeof res.project !== "object") {
        return { ok: false, error: "missing-project" };
      }
      const created = manifestToProject(res.project);
      try {
        projectsCache = ((await disk.list()) as unknown[]).map((m) => manifestToProject(m as ManifestLike));
      } catch {
        projectsCache = [...getStoredProjects(), created];
      }
      notifyProjectsChanged();
      await refreshProjectApisFromDisk(created.id);
      return { ok: true, project: created };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[addProject]", e);
      return { ok: false, error: msg };
    }
  }

  if (getStoredProjects().some((p) => p.name.trim() === name)) {
    return { ok: false, error: "duplicate-name" };
  }

  const project = createProjectRecord({ ...input, name });
  const next = [...getStoredProjects(), project];
  writeLegacyList(next);
  projectsCache = next;
  notifyProjectsChanged();
  await refreshProjectApisFromDisk(project.id);
  return { ok: true, project };
}

/** 프로젝트 삭제(Electron: 폴더 삭제 / 로컬: 목록에서 제거) */
export async function deleteProject(projectId: string): Promise<{ ok: boolean; error?: string }> {
  const p = getStoredProjects().find((x) => x.id === projectId);
  if (!p) return { ok: false, error: "not-found" };

  const disk = getProjectsApi();
  if (disk) {
    const folderName = p.folderName;
    if (!folderName) return { ok: false, error: "no-folder" };
    try {
      const raw = await disk.deleteFolder(folderName);
      const res = raw as { ok?: boolean; error?: string };
      if (!res.ok) return { ok: false, error: res.error ?? "delete-failed" };
      try {
        projectsCache = ((await disk.list()) as unknown[]).map((m) => manifestToProject(m as ManifestLike));
      } catch {
        projectsCache = getStoredProjects().filter((x) => x.id !== projectId);
      }
      delete diskEndpointsCache[projectId];
      delete savedResponsesCache[projectId];
      notifyProjectsChanged();
      notifyProjectApisChanged();
      notifySavedApiResponsesChanged();
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[deleteProject]", e);
      return { ok: false, error: msg };
    }
  }

  const next = getStoredProjects().filter((x) => x.id !== projectId);
  writeLegacyList(next);
  projectsCache = next;
  delete diskEndpointsCache[projectId];
  removeBrowserApisForProject(projectId);
  removeBrowserSavedResponsesForProject(projectId);
  notifyProjectsChanged();
  notifyProjectApisChanged();
  notifySavedApiResponsesChanged();
  return { ok: true };
}

export async function updateProjectFavorite(projectId: string, isFavorite: boolean): Promise<void> {
  const disk = getProjectsApi();
  if (disk) {
    const p = getStoredProjects().find((x) => x.id === projectId);
    const folderName = p?.folderName;
    if (folderName) {
      await disk.updateFavorite({ folderName, isFavorite });
      projectsCache = ((await disk.list()) as unknown[]).map((m) => manifestToProject(m as ManifestLike));
    } else {
      const list = getStoredProjects().map((x) => (x.id === projectId ? { ...x, isFavorite } : x));
      projectsCache = list;
    }
  } else {
    const list = getStoredProjects().map((p) => (p.id === projectId ? { ...p, isFavorite } : p));
    writeLegacyList(list);
    projectsCache = list;
  }
  notifyProjectsChanged();
}

export async function importSharedProject(): Promise<{ ok: boolean; error?: string }> {
  const disk = getProjectsApi();
  if (!disk) return { ok: false, error: "electron-only" };
  const res = (await disk.import()) as { ok: boolean; error?: string };
  if (!res.ok) return { ok: false, error: res.error };
  projectsCache = ((await disk.list()) as unknown[]).map((m) => manifestToProject(m as ManifestLike));
  notifyProjectsChanged();
  await refreshAllProjectApisFromDisk();
  return { ok: true };
}

/** Electron: JSON 파일 선택 → 파일명(확장자 제외)=API 이름, 본문=저장 응답 (여러 개 선택 가능) */
export async function importProjectApisFromJsonPick(
  projectId: string,
): Promise<
  | { ok: true; imported: number; touchedApiNames: string[]; errors: string[] }
  | { ok: false; error: string; errors?: string[] }
> {
  const p = getStoredProjects().find((x) => x.id === projectId);
  if (!p) return { ok: false, error: "not-found" };
  const folder = p.folderName?.trim();
  if (!folder) return { ok: false, error: "no-folder" };
  const disk = getProjectsApi();
  if (!disk || typeof disk.importApisJsonPick !== "function") {
    return { ok: false, error: "electron-only" };
  }
  const raw = await disk.importApisJsonPick(folder);
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "import-failed" };
  }
  if (!("ok" in raw) || !raw.ok) {
    const fail = raw as { error?: string; errors?: string[] };
    return { ok: false, error: fail.error ?? "import-failed", errors: fail.errors };
  }
  const ok = raw as { imported: number; touchedApiNames: string[]; errors: string[] };
  try {
    projectsCache = ((await disk.list()) as unknown[]).map((m) => manifestToProject(m as ManifestLike));
  } catch {
    /* keep */
  }
  await refreshProjectApisFromDisk(projectId);
  await refreshSavedResponsesFromDisk(projectId);
  notifyProjectsChanged();
  return {
    ok: true,
    imported: ok.imported,
    touchedApiNames: ok.touchedApiNames ?? [],
    errors: ok.errors ?? [],
  };
}

export async function exportProjectToFolder(folderName: string): Promise<{ ok: boolean; error?: string; path?: string }> {
  const disk = getProjectsApi();
  if (!disk) return { ok: false, error: "electron-only" };
  const res = (await disk.export(folderName)) as { ok: boolean; error?: string; path?: string };
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, path: res.path };
}

export async function exportProjectToZip(folderName: string): Promise<{ ok: boolean; error?: string; path?: string }> {
  const disk = getProjectsApi();
  if (!disk) return { ok: false, error: "electron-only" };
  const res = (await disk.exportZip(folderName)) as { ok: boolean; error?: string; path?: string };
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, path: res.path };
}

export async function getProjectsRootPath(): Promise<string | null> {
  const disk = getProjectsApi();
  if (!disk) return null;
  return (await disk.getRootPath()) as string;
}

/** 홈에서 즐겨찾기 탭 — `/?tab=favorites` 또는 `file:` + hash `#home?tab=favorites` */
export function readHomeProjectTabFromUrl(): "all" | "favorites" {
  if (typeof window === "undefined") return "all";
  if (window.location.protocol === "file:") {
    const hash = window.location.hash.slice(1).trim();
    const qi = hash.indexOf("?");
    const qs = qi >= 0 ? hash.slice(qi + 1) : "";
    return new URLSearchParams(qs).get("tab") === "favorites" ? "favorites" : "all";
  }
  return new URLSearchParams(window.location.search).get("tab") === "favorites" ? "favorites" : "all";
}

/** 카드·LNB 등에서 쓰는 `/project/:slug` 세그먼트 (한글 이름은 folderName·id로 안정화) */
export function getProjectRouteSlug(project: Pick<Project, "id" | "name" | "folderName">): string {
  const folder = project.folderName?.trim();
  if (folder) return folder;
  const fromName = slugify(project.name);
  if (fromName) return fromName;
  return project.id;
}

export function getProjectHref(project: Pick<Project, "id" | "name" | "folderName">): string {
  return `/project/${encodeURIComponent(getProjectRouteSlug(project))}`;
}

export function getProjectBySlug(slug: string | null): Project | null {
  const projects = getStoredProjects();
  if (projects.length === 0) return null;
  if (!slug) return projects[0];

  let decoded: string;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    decoded = slug;
  }

  return (
    projects.find((p) => p.folderName === slug || p.folderName === decoded) ??
    projects.find((p) => slugify(p.name) === slug || slugify(p.name) === decoded) ??
    projects.find((p) => p.id === slug || p.id === decoded) ??
    projects.find((p) => p.name === slug || p.name === decoded) ??
    null
  );
}

function readBrowserApiLatencyMap(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(BROWSER_API_LATENCY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.max(0, v);
    }
    return out;
  } catch {
    return {};
  }
}

function writeBrowserApiLatencyMap(map: Record<string, number>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BROWSER_API_LATENCY_STORAGE_KEY, JSON.stringify(map));
}

export function getStoredApiLatencyMs(apiName: string): number {
  const key = apiName.trim();
  if (!key) return 0;
  const v = readBrowserApiLatencyMap()[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function setStoredApiLatencyMs(apiName: string, ms: number): void {
  const key = apiName.trim();
  if (!key) return;
  const map = readBrowserApiLatencyMap();
  const n = typeof ms === "number" && Number.isFinite(ms) ? Math.max(0, ms) : 0;
  map[key] = n;
  writeBrowserApiLatencyMap(map);
}

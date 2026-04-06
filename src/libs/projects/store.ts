import type { ApiEndpoint, Project } from "@/types";

import { mockEndpointsByProjectId } from "@/libs/datadummy/project";
import { slugify } from "@/libs/slugify";

const LEGACY_STORAGE_KEY = "proxy-app-projects-v1";

export const PROJECTS_CHANGED_EVENT = "proxy-projects-changed";

/** 헤더·LNB 등 어디서든 프로젝트 생성 모달을 열 때 사용 */
export const OPEN_CREATE_PROJECT_MODAL_EVENT = "open-create-project-modal";

export type OpenCreateProjectModalDetail = { anchorMain?: boolean };

let projectsCache: Project[] | null = null;

/** 디스크에서 읽은 API 목록 캐시 (projectId → 엔드포인트) */
const diskEndpointsCache: Record<string, ApiEndpoint[]> = {};

export const PROJECT_APIS_CHANGED_EVENT = "proxy-project-apis-changed";

/** `hydrateProjects` 동시 호출 시 한 번만 디스크/마이그레이션 수행 */
let hydrateInFlight: Promise<void> | null = null;

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
  addApi: (folderName: string, payload: { method: string; path: string; description: string; name: string }) => Promise<unknown>;
  updateApi: (
    folderName: string,
    apiId: string,
    payload: { method: string; path: string; description: string; name: string },
  ) => Promise<unknown>;
  deleteApi: (folderName: string, apiId: string) => Promise<unknown>;
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
    typeof p.deleteApi === "function"
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
    deleteApi: (folderName, apiId) => ipc.invoke("project-fs:deleteApi", folderName, apiId),
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
  path: string;
  description: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

function diskRowToEndpoint(row: DiskApiRow): ApiEndpoint {
  return {
    id: row.id,
    method: row.method,
    path: row.path,
    description: row.description,
    name: row.name,
    lastModified: row.updatedAt,
    updatedAt: row.updatedAt,
  };
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

/** 디스크에 저장된 API + 데모(mock) ID 목록 */
export function getEndpointsForProject(projectId: string): ApiEndpoint[] {
  if (Object.prototype.hasOwnProperty.call(diskEndpointsCache, projectId)) {
    return diskEndpointsCache[projectId] ?? [];
  }
  return mockEndpointsByProjectId[projectId] ?? [];
}

export function getProjectForApiName(apiName: string): Project | null {
  const projects = getStoredProjects();
  for (const p of projects) {
    if (getEndpointsForProject(p.id).some((e) => e.name === apiName)) return p;
  }
  return null;
}

export async function refreshProjectApisFromDisk(projectId: string): Promise<void> {
  const p = getStoredProjects().find((x) => x.id === projectId);
  const disk = getProjectsApi();
  const folder = p?.folderName?.trim();
  if (!folder || !disk) {
    delete diskEndpointsCache[projectId];
    notifyProjectApisChanged();
    return;
  }
  try {
    const raw = (await disk.listApis(folder)) as unknown;
    diskEndpointsCache[projectId] = Array.isArray(raw) ? (raw as DiskApiRow[]).map(diskRowToEndpoint) : [];
  } catch {
    diskEndpointsCache[projectId] = [];
  }
  notifyProjectApisChanged();
}

async function refreshAllProjectApisFromDisk(): Promise<void> {
  const projects = getStoredProjects();
  await Promise.all(projects.map((p) => refreshProjectApisFromDisk(p.id)));
}

export function formatAddApiUserError(code: string): string {
  const ko: Record<string, string> = {
    "electron-only": "Electron 앱에서만 API를 등록할 수 있습니다.",
    "no-folder": "프로젝트 폴더 정보가 없어 API를 저장할 수 없습니다.",
    "invalid-folder": "프로젝트를 찾을 수 없습니다.",
    "not-found": "프로젝트를 찾을 수 없습니다.",
    "invalid-method": "HTTP 메서드를 확인해 주세요.",
    "empty-name": "API 이름을 입력해 주세요.",
    "empty-description": "API 설명을 입력해 주세요.",
    "api-not-found": "수정·삭제할 API를 찾을 수 없습니다.",
    "duplicate-endpoint": "같은 메서드와 경로의 API가 이미 있습니다.",
    "duplicate-api-name": "같은 API 이름이 이미 있습니다.",
    "add-failed": "API를 저장하지 못했습니다.",
    "update-failed": "API를 수정하지 못했습니다.",
    "delete-failed": "API를 삭제하지 못했습니다.",
    "ipc-not-registered":
      "메인 프로세스에 API 저장 기능이 연결되지 않았습니다. 앱을 완전히 종료한 뒤 `npm run dev`로 다시 실행하거나 `npm run build` 후 실행해 주세요.",
  };
  return ko[code] ?? `API를 저장할 수 없습니다. (${code})`;
}

async function ipcInvokeDisk(
  fn: () => Promise<unknown>,
  defaultErrorCode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
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
  input: { method: string; path: string; description: string; name: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = getStoredProjects().find((x) => x.id === projectId);
  const disk = getProjectsApi();
  if (!disk) return { ok: false, error: "electron-only" };
  const folder = p?.folderName?.trim();
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
  input: { method: string; path: string; description: string; name: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = getStoredProjects().find((x) => x.id === projectId);
  const disk = getProjectsApi();
  if (!disk) return { ok: false, error: "electron-only" };
  const folder = p?.folderName?.trim();
  if (!folder) return { ok: false, error: "no-folder" };
  const res = await ipcInvokeDisk(() => disk.updateApi(folder, apiId, input), "update-failed");
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

export async function deleteProjectApiEndpoint(
  projectId: string,
  apiId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = getStoredProjects().find((x) => x.id === projectId);
  const disk = getProjectsApi();
  if (!disk) return { ok: false, error: "electron-only" };
  const folder = p?.folderName?.trim();
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
      projectsCache = readLegacyList();
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
    projectsCache = readLegacyList();
    return projectsCache;
  }
  return [];
}

export function createProjectRecord(input: { name: string; description: string; isFavorite: boolean }): Project {
  const now = new Date().toISOString();
  const name = input.name.trim();
  const description = input.description.trim();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

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
      notifyProjectsChanged();
      notifyProjectApisChanged();
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
  notifyProjectsChanged();
  notifyProjectApisChanged();
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

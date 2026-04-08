import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import AdmZip from "adm-zip";
import { app, dialog, ipcMain } from "electron";

import type { AppProxyConfig, LinkedClientEntry } from "@/types";

export const PROJECT_MANIFEST_VERSION = 1;

export const DEFAULT_PROXY_SERVER_PORT = 4780;

export const APP_PROXY_CONFIG_VERSION = 1;

export interface ProjectManifest {
  version: number;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  folderName: string;
  linkedClients?: LinkedClientEntry[];
}

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s.slice(0, 80) || "project";
}

export function getProjectsRoot(): string {
  return join(app.getPath("userData"), "DataForge-projects");
}

async function ensureProjectsRoot(): Promise<void> {
  await fs.mkdir(getProjectsRoot(), { recursive: true });
}

async function uniqueFolderName(base: string, slug: string): Promise<string> {
  let name = slug.slice(0, 80) || "project";
  let attempt = name;
  let n = 2;
  for (;;) {
    try {
      await fs.access(join(base, attempt));
      attempt = `${name}-${n++}`;
    } catch {
      return attempt;
    }
  }
}

/** IPC로 받은 폴더명에 경로 분리자·탈출 방지 */
function isSafeProjectFolderName(name: string): boolean {
  if (!name || name.length > 200) return false;
  if (name.includes("..") || name.includes("/") || name.includes("\\")) return false;
  return true;
}

/** ZIP 저장 파일명용 (Windows 등 금지 문자 제거) */
function safeZipFileBaseName(name: string): string {
  const t = name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120);
  return t || "project";
}

/** 선택한 폴더 안에서 `이름.zip`이 있으면 `이름-2.zip` … 로 피함 */
async function uniqueZipPathInDir(dir: string, base: string): Promise<string> {
  let attempt = `${base}.zip`;
  let n = 2;
  for (;;) {
    const full = join(dir, attempt);
    try {
      await fs.access(full);
      attempt = `${base}-${n++}.zip`;
    } catch {
      return full;
    }
  }
}

async function findProjectDirWithManifest(root: string): Promise<string | null> {
  if (await readManifest(root)) return root;
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const sub = join(root, ent.name);
    if (await readManifest(sub)) return sub;
  }
  return null;
}

async function pickImportSourcePath(): Promise<string | null> {
  const darwin = process.platform === "darwin";
  const first = await dialog.showOpenDialog({
    title: "가져올 프로젝트 (ZIP 또는 project.json 폴더)",
    properties: darwin ? ["openFile", "openDirectory"] : ["openFile"],
    filters: [{ name: "프로젝트 ZIP", extensions: ["zip"] }],
  });
  if (!first.canceled && first.filePaths[0]) return first.filePaths[0];

  if (!darwin && first.canceled) {
    const second = await dialog.showOpenDialog({
      title: "가져올 프로젝트 폴더 (project.json 포함)",
      properties: ["openDirectory"],
    });
    if (!second.canceled && second.filePaths[0]) return second.filePaths[0];
  }
  return null;
}

function coerceLinkedClients(raw: unknown): LinkedClientEntry[] | undefined {
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
    out.push({
      id,
      label,
      allowedOrigins,
      ...(notesRaw ? { notes: notesRaw } : {}),
    });
  }
  return out.length ? out : undefined;
}

async function readManifest(projectRoot: string): Promise<ProjectManifest | null> {
  try {
    const raw = await fs.readFile(join(projectRoot, "project.json"), "utf-8");
    const data = JSON.parse(raw) as ProjectManifest & { linkedClients?: unknown };
    if (!data || typeof data !== "object" || data.version !== PROJECT_MANIFEST_VERSION) return null;
    if (typeof data.id !== "string" || typeof data.name !== "string") return null;
    const linkedClients = coerceLinkedClients(data.linkedClients);
    const { linkedClients: _raw, ...rest } = data;
    return linkedClients?.length ? { ...rest, linkedClients } : { ...rest };
  } catch {
    return null;
  }
}

function getAppProxyConfigPath(): string {
  return join(app.getPath("userData"), "proxy-app-config.json");
}

function defaultAppProxyConfig(): AppProxyConfig {
  return {
    version: APP_PROXY_CONFIG_VERSION,
    proxyServer: { port: DEFAULT_PROXY_SERVER_PORT, enabled: false },
  };
}

async function readAppProxyConfigDisk(): Promise<AppProxyConfig> {
  try {
    const raw = await fs.readFile(getAppProxyConfigPath(), "utf-8");
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return defaultAppProxyConfig();
    const o = data as Record<string, unknown>;
    if (o.version !== APP_PROXY_CONFIG_VERSION) return defaultAppProxyConfig();
    const ps = o.proxyServer;
    if (!ps || typeof ps !== "object") return defaultAppProxyConfig();
    const p = ps as Record<string, unknown>;
    const port = typeof p.port === "number" && Number.isFinite(p.port) ? Math.floor(p.port) : DEFAULT_PROXY_SERVER_PORT;
    const enabled = Boolean(p.enabled);
    const clamped = Math.min(65535, Math.max(1, port));
    return { version: APP_PROXY_CONFIG_VERSION, proxyServer: { port: clamped, enabled } };
  } catch {
    return defaultAppProxyConfig();
  }
}

async function mergeAppProxyConfigDisk(partial: unknown): Promise<AppProxyConfig> {
  const cur = await readAppProxyConfigDisk();
  const o = partial != null && typeof partial === "object" ? (partial as Record<string, unknown>) : {};
  const psIn = o.proxyServer;
  let port = cur.proxyServer.port;
  let enabled = cur.proxyServer.enabled;
  if (psIn && typeof psIn === "object") {
    const p = psIn as Record<string, unknown>;
    if (typeof p.port === "number" && Number.isFinite(p.port)) {
      port = Math.min(65535, Math.max(1, Math.floor(p.port)));
    }
    if (typeof p.enabled === "boolean") enabled = p.enabled;
  }
  const next: AppProxyConfig = { version: APP_PROXY_CONFIG_VERSION, proxyServer: { port, enabled } };
  await fs.writeFile(getAppProxyConfigPath(), JSON.stringify(next, null, 2), "utf-8");
  return next;
}

async function hasProjectWithDisplayName(root: string, displayName: string): Promise<boolean> {
  const target = displayName.trim();
  if (!target) return false;
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const m = await readManifest(join(root, ent.name));
    if (m && m.name.trim() === target) return true;
  }
  return false;
}

/** `apis/index.json` 한 행 */
export interface StoredApiEntry {
  id: string;
  method: string;
  /** 트랜 이름 (구버전 파일은 `path` 필드 — 읽을 때만 호환) */
  tran: string;
  description: string;
  /** API 이름 (예: VD.MOVS0001) */
  name: string;
  createdAt: string;
  updatedAt: string;
}

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

async function readApisIndex(projectRoot: string): Promise<StoredApiEntry[]> {
  const fp = join(projectRoot, "apis", "index.json");
  try {
    const raw = await fs.readFile(fp, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: StoredApiEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      if (typeof o.id !== "string" || typeof o.method !== "string") continue;
      const fromTran = typeof o.tran === "string" ? o.tran.trim() : "";
      const fromPath = typeof o.path === "string" ? String(o.path).trim() : "";
      /** 빈 `tran`만 있고 레거시 `path`에 값이 있는 JSON 호환 */
      const tranTrim = fromTran || fromPath;
      const methodUp = String(o.method).toUpperCase();
      out.push({
        id: o.id,
        method: methodUp,
        tran: tranTrim,
        description: typeof o.description === "string" ? o.description : "",
        name: typeof o.name === "string" ? o.name : tranTrim ? `${methodUp} ${tranTrim}` : methodUp,
        createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
        updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function writeApisIndex(projectRoot: string, items: StoredApiEntry[]): Promise<void> {
  const fp = join(projectRoot, "apis", "index.json");
  await fs.mkdir(join(projectRoot, "apis"), { recursive: true });
  const sanitized = items.map((row) => ({
    id: row.id,
    method: row.method,
    tran: row.tran,
    description: row.description,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
  await fs.writeFile(fp, JSON.stringify(sanitized, null, 2), "utf-8");
}

const API_RESPONSES_STORE_VERSION = 1;

type ApiResponseRowDisk = {
  id: string;
  value: string;
  label: string;
  description: string;
  editorType: "default" | "test" | "error";
  configuration: string;
  createdAt: string;
  updatedAt: string;
};

type ApiResponsesStoreFile = {
  version: number;
  byApiName: Record<string, ApiResponseRowDisk[]>;
};

async function readApiResponsesStore(projectRoot: string): Promise<ApiResponsesStoreFile> {
  const fp = join(projectRoot, "apis", "responses-store.json");
  try {
    const raw = await fs.readFile(fp, "utf-8");
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return { version: API_RESPONSES_STORE_VERSION, byApiName: {} };
    const o = data as Record<string, unknown>;
    if (o.version !== API_RESPONSES_STORE_VERSION || typeof o.byApiName !== "object" || o.byApiName === null) {
      return { version: API_RESPONSES_STORE_VERSION, byApiName: {} };
    }
    return { version: API_RESPONSES_STORE_VERSION, byApiName: o.byApiName as Record<string, ApiResponseRowDisk[]> };
  } catch {
    return { version: API_RESPONSES_STORE_VERSION, byApiName: {} };
  }
}

async function writeApiResponsesStore(projectRoot: string, byApiName: Record<string, ApiResponseRowDisk[]>): Promise<void> {
  const fp = join(projectRoot, "apis", "responses-store.json");
  await fs.mkdir(join(projectRoot, "apis"), { recursive: true });
  const body: ApiResponsesStoreFile = { version: API_RESPONSES_STORE_VERSION, byApiName };
  await fs.writeFile(fp, JSON.stringify(body, null, 2), "utf-8");
}

type LegacyRow = {
  id?: string;
  name?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  isFavorite?: boolean;
  folderName?: string;
};

export function registerProjectFsIpc(): void {
  ipcMain.removeHandler("project-fs:list");
  ipcMain.removeHandler("project-fs:create");
  ipcMain.removeHandler("project-fs:updateFavorite");
  ipcMain.removeHandler("project-fs:export");
  ipcMain.removeHandler("project-fs:exportZip");
  ipcMain.removeHandler("project-fs:import");
  ipcMain.removeHandler("project-fs:migrateFromLegacy");
  ipcMain.removeHandler("project-fs:getRootPath");
  ipcMain.removeHandler("project-fs:delete");
  ipcMain.removeHandler("project-fs:listApis");
  ipcMain.removeHandler("project-fs:addApi");
  ipcMain.removeHandler("project-fs:updateApi");
  ipcMain.removeHandler("project-fs:deleteApi");
  ipcMain.removeHandler("project-fs:getResponsesStore");
  ipcMain.removeHandler("project-fs:upsertApiResponse");
  ipcMain.removeHandler("project-fs:deleteApiResponse");
  ipcMain.removeHandler("project-fs:getAppProxyConfig");
  ipcMain.removeHandler("project-fs:setAppProxyConfig");
  ipcMain.removeHandler("project-fs:setLinkedClients");

  ipcMain.handle("project-fs:getAppProxyConfig", async (): Promise<AppProxyConfig> => readAppProxyConfigDisk());

  ipcMain.handle("project-fs:setAppProxyConfig", async (_e, partial: unknown) => {
    try {
      const next = await mergeAppProxyConfigDisk(partial);
      return { ok: true as const, config: next };
    } catch {
      return { ok: false as const, error: "save-failed" };
    }
  });

  ipcMain.handle(
    "project-fs:setLinkedClients",
    async (_e, payload: unknown): Promise<{ ok: true } | { ok: false; error: string }> => {
      const p = payload != null && typeof payload === "object" ? (payload as { folderName?: unknown; linkedClients?: unknown }) : {};
      const fname = typeof p.folderName === "string" ? p.folderName.trim() : "";
      if (!fname || !isSafeProjectFolderName(fname)) return { ok: false as const, error: "invalid-folder" };
      const root = getProjectsRoot();
      const projectRoot = join(root, fname);
      const manifest = await readManifest(projectRoot);
      if (!manifest) return { ok: false as const, error: "not-found" };
      const linkedClients = coerceLinkedClients(p.linkedClients) ?? [];
      const now = new Date().toISOString();
      const next: ProjectManifest = {
        ...manifest,
        linkedClients: linkedClients.length ? linkedClients : undefined,
        updatedAt: now,
      };
      await fs.writeFile(join(projectRoot, "project.json"), JSON.stringify(next, null, 2), "utf-8");
      return { ok: true as const };
    },
  );

  ipcMain.handle("project-fs:list", async (): Promise<ProjectManifest[]> => {
    await ensureProjectsRoot();
    const root = getProjectsRoot();
    const entries = await fs.readdir(root, { withFileTypes: true });
    const projects: ProjectManifest[] = [];

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const folderName = ent.name;
      const manifest = await readManifest(join(root, folderName));
      if (!manifest) continue;
      projects.push({ ...manifest, folderName });
    }

    projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return projects;
  });

  ipcMain.handle("project-fs:create", async (_e, payload: unknown) => {
    const p = payload != null && typeof payload === "object" ? (payload as { name?: unknown; description?: unknown; isFavorite?: unknown }) : {};
    await ensureProjectsRoot();
    const root = getProjectsRoot();
    const name = String(p.name ?? "").trim();
    if (!name) return { ok: false as const, error: "empty-name" };

    if (await hasProjectWithDisplayName(root, name)) {
      return { ok: false as const, error: "duplicate-name" };
    }

    const folderName = await uniqueFolderName(root, slugify(name));
    const projectRoot = join(root, folderName);
    await fs.mkdir(join(projectRoot, "apis"), { recursive: true });

    const now = new Date().toISOString();
    const manifest: ProjectManifest = {
      version: PROJECT_MANIFEST_VERSION,
      id: randomUUID(),
      name,
      description: String(p.description ?? "").trim(),
      createdAt: now,
      updatedAt: now,
      isFavorite: Boolean(p.isFavorite),
      folderName,
    };

    await fs.writeFile(join(projectRoot, "project.json"), JSON.stringify(manifest, null, 2), "utf-8");
    await fs.writeFile(join(projectRoot, "apis", "index.json"), JSON.stringify([], null, 2), "utf-8");

    return { ok: true as const, project: manifest };
  });

  ipcMain.handle("project-fs:updateFavorite", async (_e, payload: { folderName: string; isFavorite: boolean }) => {
    const root = getProjectsRoot();
    const projectRoot = join(root, payload.folderName);
    const cur = await readManifest(projectRoot);
    if (!cur) return { ok: false as const, error: "not-found" };

    const next: ProjectManifest = {
      ...cur,
      isFavorite: payload.isFavorite,
      folderName: payload.folderName,
    };
    await fs.writeFile(join(projectRoot, "project.json"), JSON.stringify(next, null, 2), "utf-8");
    return { ok: true as const };
  });

  ipcMain.handle("project-fs:export", async (_e, folderName: string) => {
    const root = getProjectsRoot();
    const src = join(root, folderName);
    const cur = await readManifest(src);
    if (!cur) return { ok: false as const, error: "not-found" };

    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "보낼 위치(상위 폴더) 선택",
      properties: ["openDirectory", "createDirectory"],
    });
    if (canceled || !filePaths[0]) return { ok: false as const, error: "cancelled" };

    const dest = join(filePaths[0], folderName);
    try {
      await fs.access(dest);
      return { ok: false as const, error: "destination-exists" };
    } catch {
      /* unique */
    }

    await fs.cp(src, dest, { recursive: true });
    return { ok: true as const, path: dest };
  });

  ipcMain.handle("project-fs:exportZip", async (_e, folderName: string) => {
    const root = getProjectsRoot();
    const src = join(root, folderName);
    const cur = await readManifest(src);
    if (!cur) return { ok: false as const, error: "not-found" };

    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "ZIP을 저장할 폴더 선택",
      properties: ["openDirectory", "createDirectory"],
    });
    if (canceled || !filePaths[0]) return { ok: false as const, error: "cancelled" };

    const outPath = await uniqueZipPathInDir(filePaths[0], safeZipFileBaseName(cur.name));

    try {
      const zip = new AdmZip();
      zip.addLocalFolder(src, "");
      zip.writeZip(outPath);
    } catch {
      return { ok: false as const, error: "zip-write-failed" };
    }

    return { ok: true as const, path: outPath };
  });

  ipcMain.handle("project-fs:import", async () => {
    await ensureProjectsRoot();
    const picked = await pickImportSourcePath();
    if (!picked) return { ok: false as const, error: "cancelled" };

    let srcDir = picked;
    let cleanupTmp: string | null = null;

    if (picked.toLowerCase().endsWith(".zip")) {
      try {
        const tmpRoot = join(tmpdir(), `df-import-${randomUUID()}`);
        await fs.mkdir(tmpRoot, { recursive: true });
        cleanupTmp = tmpRoot;
        const zip = new AdmZip(picked);
        zip.extractAllTo(tmpRoot, true);
        const found = await findProjectDirWithManifest(tmpRoot);
        if (!found) {
          await fs.rm(tmpRoot, { recursive: true, force: true });
          return { ok: false as const, error: "invalid-manifest" };
        }
        srcDir = found;
      } catch {
        if (cleanupTmp) await fs.rm(cleanupTmp, { recursive: true, force: true }).catch(() => {});
        return { ok: false as const, error: "invalid-zip" };
      }
    }

    const incoming = await readManifest(srcDir);
    if (!incoming) {
      if (cleanupTmp) await fs.rm(cleanupTmp, { recursive: true, force: true }).catch(() => {});
      return { ok: false as const, error: "invalid-manifest" };
    }

    const root = getProjectsRoot();
    if (await hasProjectWithDisplayName(root, incoming.name)) {
      if (cleanupTmp) await fs.rm(cleanupTmp, { recursive: true, force: true }).catch(() => {});
      return { ok: false as const, error: "duplicate-name" };
    }

    const folderName = await uniqueFolderName(root, slugify(incoming.folderName || incoming.name));
    const dest = join(root, folderName);
    await fs.cp(srcDir, dest, { recursive: true });

    const now = new Date().toISOString();
    const imported: ProjectManifest = {
      ...incoming,
      id: randomUUID(),
      folderName,
      updatedAt: now,
    };
    await fs.writeFile(join(dest, "project.json"), JSON.stringify(imported, null, 2), "utf-8");

    if (cleanupTmp) await fs.rm(cleanupTmp, { recursive: true, force: true }).catch(() => {});

    return { ok: true as const, project: imported };
  });

  ipcMain.handle("project-fs:migrateFromLegacy", async (_e, legacy: LegacyRow[]) => {
    if (!Array.isArray(legacy) || legacy.length === 0) return { ok: true as const, count: 0 };

    await ensureProjectsRoot();
    const root = getProjectsRoot();
    let count = 0;

    for (const row of legacy) {
      if (!row.name || typeof row.name !== "string") continue;
      const folderName = await uniqueFolderName(root, slugify(row.folderName || row.name));
      const projectRoot = join(root, folderName);
      await fs.mkdir(join(projectRoot, "apis"), { recursive: true });

      const now = new Date().toISOString();
      const manifest: ProjectManifest = {
        version: PROJECT_MANIFEST_VERSION,
        id: typeof row.id === "string" && row.id ? row.id : randomUUID(),
        name: row.name.trim(),
        description: typeof row.description === "string" ? row.description : "",
        createdAt: typeof row.createdAt === "string" ? row.createdAt : now,
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : now,
        isFavorite: Boolean(row.isFavorite),
        folderName,
      };

      await fs.writeFile(join(projectRoot, "project.json"), JSON.stringify(manifest, null, 2), "utf-8");
      await fs.writeFile(join(projectRoot, "apis", "index.json"), JSON.stringify([], null, 2), "utf-8");
      count++;
    }

    return { ok: true as const, count };
  });

  ipcMain.handle("project-fs:getRootPath", async () => getProjectsRoot());

  ipcMain.handle("project-fs:listApis", async (_e, folderName: unknown) => {
    const name = typeof folderName === "string" ? folderName.trim() : "";
    if (!name || !isSafeProjectFolderName(name)) return [];
    const root = getProjectsRoot();
    const projectRoot = join(root, name);
    const cur = await readManifest(projectRoot);
    if (!cur) return [];
    return readApisIndex(projectRoot);
  });

  ipcMain.handle("project-fs:addApi", async (_e, folderName: unknown, payload: unknown) => {
    const fname = typeof folderName === "string" ? folderName.trim() : "";
    if (!fname || !isSafeProjectFolderName(fname)) return { ok: false as const, error: "invalid-folder" };

    const p = payload != null && typeof payload === "object" ? (payload as { method?: unknown; tran?: unknown; path?: unknown; description?: unknown; name?: unknown }) : {};
    const methodRaw = String(p.method ?? "GET")
      .trim()
      .toUpperCase();
    const tranStr = String(p.tran ?? p.path ?? "").trim();
    const description = String(p.description ?? "").trim();
    const apiDisplayName = String(p.name ?? "").trim();

    if (!HTTP_METHODS.has(methodRaw)) return { ok: false as const, error: "invalid-method" };
    if (!apiDisplayName) return { ok: false as const, error: "empty-name" };
    if (!description) return { ok: false as const, error: "empty-description" };
    if (!tranStr) return { ok: false as const, error: "empty-tran" };

    const root = getProjectsRoot();
    const projectRoot = join(root, fname);
    const manifest = await readManifest(projectRoot);
    if (!manifest) return { ok: false as const, error: "not-found" };

    const items = await readApisIndex(projectRoot);
    const normTran = tranStr;
    if (items.some((x) => x.method === methodRaw && x.tran.trim() === normTran)) {
      return { ok: false as const, error: "duplicate-endpoint" };
    }
    if (items.some((x) => x.name.trim() === apiDisplayName)) {
      return { ok: false as const, error: "duplicate-api-name" };
    }

    const now = new Date().toISOString();
    const entry: StoredApiEntry = {
      id: randomUUID(),
      method: methodRaw,
      tran: normTran,
      description,
      name: apiDisplayName,
      createdAt: now,
      updatedAt: now,
    };
    items.push(entry);
    await writeApisIndex(projectRoot, items);

    const nextManifest: ProjectManifest = { ...manifest, updatedAt: now };
    await fs.writeFile(join(projectRoot, "project.json"), JSON.stringify(nextManifest, null, 2), "utf-8");

    return { ok: true as const, api: entry };
  });

  ipcMain.handle("project-fs:updateApi", async (_e, folderName: unknown, apiId: unknown, payload: unknown) => {
    const fname = typeof folderName === "string" ? folderName.trim() : "";
    if (!fname || !isSafeProjectFolderName(fname)) return { ok: false as const, error: "invalid-folder" };

    const id = typeof apiId === "string" ? apiId.trim() : "";
    if (!id) return { ok: false as const, error: "api-not-found" };

    const p = payload != null && typeof payload === "object" ? (payload as { method?: unknown; tran?: unknown; path?: unknown; description?: unknown; name?: unknown }) : {};
    const methodRaw = String(p.method ?? "GET")
      .trim()
      .toUpperCase();
    const tranStr = String(p.tran ?? p.path ?? "").trim();
    const description = String(p.description ?? "").trim();
    const apiDisplayName = String(p.name ?? "").trim();

    if (!HTTP_METHODS.has(methodRaw)) return { ok: false as const, error: "invalid-method" };
    if (!apiDisplayName) return { ok: false as const, error: "empty-name" };
    if (!description) return { ok: false as const, error: "empty-description" };
    if (!tranStr) return { ok: false as const, error: "empty-tran" };

    const root = getProjectsRoot();
    const projectRoot = join(root, fname);
    const manifest = await readManifest(projectRoot);
    if (!manifest) return { ok: false as const, error: "not-found" };

    const items = await readApisIndex(projectRoot);
    const idx = items.findIndex((x) => x.id === id);
    if (idx < 0) return { ok: false as const, error: "api-not-found" };

    const normTran = tranStr;
    if (items.some((x, i) => i !== idx && x.method === methodRaw && x.tran.trim() === normTran)) {
      return { ok: false as const, error: "duplicate-endpoint" };
    }
    if (items.some((x, i) => i !== idx && x.name.trim() === apiDisplayName)) {
      return { ok: false as const, error: "duplicate-api-name" };
    }

    const now = new Date().toISOString();
    const prev = items[idx];
    const entry: StoredApiEntry = {
      ...prev,
      method: methodRaw,
      tran: normTran,
      description,
      name: apiDisplayName,
      updatedAt: now,
    };
    items[idx] = entry;
    await writeApisIndex(projectRoot, items);

    const nextManifest: ProjectManifest = { ...manifest, updatedAt: now };
    await fs.writeFile(join(projectRoot, "project.json"), JSON.stringify(nextManifest, null, 2), "utf-8");

    return { ok: true as const, api: entry };
  });

  ipcMain.handle("project-fs:deleteApi", async (_e, folderName: unknown, apiId: unknown) => {
    const fname = typeof folderName === "string" ? folderName.trim() : "";
    if (!fname || !isSafeProjectFolderName(fname)) return { ok: false as const, error: "invalid-folder" };

    const id = typeof apiId === "string" ? apiId.trim() : "";
    if (!id) return { ok: false as const, error: "api-not-found" };

    const root = getProjectsRoot();
    const projectRoot = join(root, fname);
    const manifest = await readManifest(projectRoot);
    if (!manifest) return { ok: false as const, error: "not-found" };

    const items = await readApisIndex(projectRoot);
    const next = items.filter((x) => x.id !== id);
    if (next.length === items.length) return { ok: false as const, error: "api-not-found" };

    const now = new Date().toISOString();
    await writeApisIndex(projectRoot, next);
    const nextManifest: ProjectManifest = { ...manifest, updatedAt: now };
    await fs.writeFile(join(projectRoot, "project.json"), JSON.stringify(nextManifest, null, 2), "utf-8");

    return { ok: true as const };
  });

  ipcMain.handle("project-fs:getResponsesStore", async (_e, folderName: unknown) => {
    const fname = typeof folderName === "string" ? folderName.trim() : "";
    if (!fname || !isSafeProjectFolderName(fname)) {
      return { version: API_RESPONSES_STORE_VERSION, byApiName: {} };
    }
    const root = getProjectsRoot();
    const projectRoot = join(root, fname);
    if (!(await readManifest(projectRoot))) {
      return { version: API_RESPONSES_STORE_VERSION, byApiName: {} };
    }
    return readApiResponsesStore(projectRoot);
  });

  ipcMain.handle("project-fs:upsertApiResponse", async (_e, folderName: unknown, apiName: unknown, payload: unknown) => {
    const fname = typeof folderName === "string" ? folderName.trim() : "";
    if (!fname || !isSafeProjectFolderName(fname)) return { ok: false as const, error: "invalid-folder" };

    const api = typeof apiName === "string" ? apiName.trim() : "";
    if (!api) return { ok: false as const, error: "empty-api-name" };

    const pl = payload != null && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const label = String(pl.label ?? "").trim() || api;
    const description = String(pl.description ?? "").trim();
    const editorRaw = String(pl.editorType ?? "default").toLowerCase();
    const editorType: "default" | "test" | "error" = editorRaw === "test" ? "test" : editorRaw === "error" ? "error" : "default";
    const configuration = String(pl.configuration ?? "");
    const existingValue = pl.value != null && String(pl.value).trim() ? String(pl.value).trim() : null;

    const root = getProjectsRoot();
    const projectRoot = join(root, fname);
    const manifest = await readManifest(projectRoot);
    if (!manifest) return { ok: false as const, error: "not-found" };

    const store = await readApiResponsesStore(projectRoot);
    const list = [...(store.byApiName[api] ?? [])];
    const now = new Date().toISOString();
    let outValue: string;

    if (existingValue) {
      const idx = list.findIndex((r) => r.value === existingValue);
      if (idx >= 0) {
        const prev = list[idx];
        list[idx] = {
          ...prev,
          label,
          description,
          editorType,
          configuration,
          updatedAt: now,
        };
        outValue = list[idx].value;
      } else {
        outValue = `saved-${randomUUID()}`;
        list.push({
          id: outValue,
          value: outValue,
          label,
          description,
          editorType,
          configuration,
          createdAt: now,
          updatedAt: now,
        });
      }
    } else {
      outValue = `saved-${randomUUID()}`;
      list.push({
        id: outValue,
        value: outValue,
        label,
        description,
        editorType,
        configuration,
        createdAt: now,
        updatedAt: now,
      });
    }

    store.byApiName[api] = list;
    await writeApiResponsesStore(projectRoot, store.byApiName);

    const nextManifest: ProjectManifest = { ...manifest, updatedAt: now };
    await fs.writeFile(join(projectRoot, "project.json"), JSON.stringify(nextManifest, null, 2), "utf-8");

    return { ok: true as const, value: outValue };
  });

  ipcMain.handle("project-fs:deleteApiResponse", async (_e, folderName: unknown, apiName: unknown, responseValue: unknown) => {
    const fname = typeof folderName === "string" ? folderName.trim() : "";
    if (!fname || !isSafeProjectFolderName(fname)) return { ok: false as const, error: "invalid-folder" };

    const api = typeof apiName === "string" ? apiName.trim() : "";
    if (!api) return { ok: false as const, error: "empty-api-name" };

    const val = typeof responseValue === "string" ? responseValue.trim() : "";
    if (!val) return { ok: false as const, error: "empty-value" };

    const root = getProjectsRoot();
    const projectRoot = join(root, fname);
    const manifest = await readManifest(projectRoot);
    if (!manifest) return { ok: false as const, error: "not-found" };

    const store = await readApiResponsesStore(projectRoot);
    const list = [...(store.byApiName[api] ?? [])];
    const idx = list.findIndex((r) => r.value === val);
    if (idx < 0) return { ok: false as const, error: "response-not-found" };

    list.splice(idx, 1);
    const nextByApi = { ...store.byApiName };
    if (list.length) nextByApi[api] = list;
    else delete nextByApi[api];

    await writeApiResponsesStore(projectRoot, nextByApi);

    const now = new Date().toISOString();
    const nextManifest: ProjectManifest = { ...manifest, updatedAt: now };
    await fs.writeFile(join(projectRoot, "project.json"), JSON.stringify(nextManifest, null, 2), "utf-8");

    return { ok: true as const };
  });

  ipcMain.handle("project-fs:delete", async (_e, folderName: unknown) => {
    const name = typeof folderName === "string" ? folderName.trim() : "";
    if (!name || !isSafeProjectFolderName(name)) return { ok: false as const, error: "invalid-folder" };
    const root = getProjectsRoot();
    const projectRoot = join(root, name);
    try {
      await fs.rm(projectRoot, { recursive: true, force: true });
    } catch {
      return { ok: false as const, error: "io-error" };
    }
    return { ok: true as const };
  });
}

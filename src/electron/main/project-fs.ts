import { randomUUID } from "crypto";
import type { Dirent } from "fs";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { basename, dirname, join } from "path";

import AdmZip from "adm-zip";
import { app, dialog, ipcMain } from "electron";

import type { AppProxyConfig, AppProxyInterceptGatewayConfig, LinkedClientEntry, MockProfileType } from "@/types";
import { buildCareTranLookup, findCareForProxyApi, parseSfdModuleInterfaces } from "@/libs/care/sfdModuleInterfaces";

export const PROJECT_MANIFEST_VERSION = 1;

export const DEFAULT_PROXY_SERVER_PORT = 4780;
export const DEFAULT_CARE_DUMMY_SERVER_PORT = 7778;

export const APP_PROXY_CONFIG_VERSION = 2;

/** 디스크 v1: careGateway, v2: interceptGateway */
export const APP_PROXY_CONFIG_VERSION_LEGACY = 1;

function coerceMockProfile(raw: unknown): MockProfileType {
  return raw === "generic-json" ? "generic-json" : "legacy-tran-envelope";
}

export function coerceMockTranAliases(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const ks = String(k).trim();
    const vs = typeof v === "string" ? v.trim() : "";
    if (ks && vs) out[ks] = vs;
  }
  return out;
}

export function isInterceptGatewayMockPortCollision(config: AppProxyConfig): boolean {
  const ig = config.interceptGateway;
  if (!config.proxyServer.enabled || !ig?.enabled) return false;
  const client = Math.min(65535, Math.max(1, Math.floor(ig.clientPort)));
  return config.proxyServer.port === client;
}

/** 게이트웨이 수신 포트와 업스트림이 같으면 프록시가 자기 자신/잘못된 대상으로 붙음 */
export function isInterceptGatewayClientEqualsUpstream(config: AppProxyConfig): boolean {
  const ig = config.interceptGateway;
  if (!ig?.enabled) return false;
  const c = Math.min(65535, Math.max(1, Math.floor(ig.clientPort)));
  const u = Math.min(65535, Math.max(1, Math.floor(ig.upstreamPort)));
  return c === u;
}

/** 모의 서버와 업스트림이 같은 포트면 두 프로세스를 동시에 둘 수 없음 */
export function isInterceptGatewayMockUpstreamCollision(config: AppProxyConfig): boolean {
  const ig = config.interceptGateway;
  if (!ig?.enabled || !config.proxyServer.enabled) return false;
  const u = Math.min(65535, Math.max(1, Math.floor(ig.upstreamPort)));
  return config.proxyServer.port === u;
}

/** @deprecated 이름 호환 */
export const isCareGatewayMockPortCollision = isInterceptGatewayMockPortCollision;

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

/** 유효한 project.json 이 있는 프로젝트 루트 절대 경로 — 폴더명 오름차순 */
export async function listDiskProjectRootPaths(): Promise<string[]> {
  const root = getProjectsRoot();
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (!isSafeProjectFolderName(ent.name)) continue;
    const pr = join(root, ent.name);
    if (await readManifest(pr)) out.push(pr);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
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
    title: "가져올 프로젝트 (ZIP, project.json 폴더, 루트 JSON 폴더, 또는 하위폴더별 JSON)",
    properties: darwin ? ["openFile", "openDirectory"] : ["openFile"],
    filters: [
      { name: "프로젝트", extensions: ["zip", "json"] },
      { name: "모든 파일", extensions: ["*"] },
    ],
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

export async function readManifest(projectRoot: string): Promise<ProjectManifest | null> {
  try {
    const raw = await fs.readFile(join(projectRoot, "project.json"), "utf-8");
    const data = JSON.parse(raw) as unknown;
    return manifestFromJsonFilePayload(data);
  } catch {
    return null;
  }
}

/** ZIP/폴더의 project.json 또는 단일 JSON 파일 본문 검증·정규화 */
function manifestFromJsonFilePayload(data: unknown): ProjectManifest | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.version !== PROJECT_MANIFEST_VERSION) return null;
  if (typeof d.id !== "string" || typeof d.name !== "string") return null;
  const description = typeof d.description === "string" ? d.description : "";
  const createdAt = typeof d.createdAt === "string" ? d.createdAt : new Date().toISOString();
  const updatedAt = typeof d.updatedAt === "string" ? d.updatedAt : new Date().toISOString();
  const isFavorite = Boolean(d.isFavorite);
  const folderNameRaw = typeof d.folderName === "string" ? d.folderName.trim() : "";
  const folderName = folderNameRaw || slugify(d.name) || "project";
  const linkedClients = coerceLinkedClients(d.linkedClients);
  const base: ProjectManifest = {
    version: PROJECT_MANIFEST_VERSION,
    id: d.id,
    name: d.name,
    description,
    createdAt,
    updatedAt,
    isFavorite,
    folderName,
  };
  return linkedClients?.length ? { ...base, linkedClients } : base;
}

function getAppProxyConfigPath(): string {
  return join(app.getPath("userData"), "proxy-app-config.json");
}

function defaultInterceptGateway(): AppProxyInterceptGatewayConfig {
  return {
    enabled: false,
    clientPort: 7777,
    upstreamPort: 7778,
    autoStartUpstream: false,
    upstreamWorkdir: null,
  };
}

function migrateCareGatewayRawToIntercept(g: Record<string, unknown>): AppProxyInterceptGatewayConfig {
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

function parseInterceptGatewayFromDisk(o: Record<string, unknown>): AppProxyInterceptGatewayConfig {
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
    return migrateCareGatewayRawToIntercept(cgRaw as Record<string, unknown>);
  }
  return defaultInterceptGateway();
}

function defaultAppProxyConfig(): AppProxyConfig {
  return {
    version: APP_PROXY_CONFIG_VERSION,
    proxyServer: {
      port: DEFAULT_PROXY_SERVER_PORT,
      enabled: false,
      servingFolderName: null,
      careDummyMobilityPath: null,
      upstreamAutoStart: false,
      upstreamServerWorkdir: null,
      upstreamServerPort: DEFAULT_CARE_DUMMY_SERVER_PORT,
      upstreamServerCommand: null,
      upstreamNodePath: null,
      careDummyAutoStart: false,
      careDummyServerWorkdir: null,
      careDummyServerPort: DEFAULT_CARE_DUMMY_SERVER_PORT,
    },
    interceptGateway: defaultInterceptGateway(),
    mockProfile: "legacy-tran-envelope",
    mockTranAliases: {},
  };
}

export async function readAppProxyConfigDisk(): Promise<AppProxyConfig> {
  try {
    const raw = await fs.readFile(getAppProxyConfigPath(), "utf-8");
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return defaultAppProxyConfig();
    const o = data as Record<string, unknown>;
    if (o.version !== APP_PROXY_CONFIG_VERSION && o.version !== APP_PROXY_CONFIG_VERSION_LEGACY) {
      return defaultAppProxyConfig();
    }
    const ps = o.proxyServer;
    if (!ps || typeof ps !== "object") return defaultAppProxyConfig();
    const p = ps as Record<string, unknown>;
    const port = typeof p.port === "number" && Number.isFinite(p.port) ? Math.floor(p.port) : DEFAULT_PROXY_SERVER_PORT;
    const enabled = Boolean(p.enabled);
    const clamped = Math.min(65535, Math.max(1, port));
    let servingFolderName: string | null = null;
    if ("servingFolderName" in p) {
      if (p.servingFolderName === null || p.servingFolderName === "") servingFolderName = null;
      else if (typeof p.servingFolderName === "string") {
        const t = p.servingFolderName.trim();
        servingFolderName = isSafeProjectFolderName(t) ? t : null;
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
    let careDummyServerPort = DEFAULT_CARE_DUMMY_SERVER_PORT;
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
    const interceptGateway = parseInterceptGatewayFromDisk(o);

    const mockTranAliases = coerceMockTranAliases(o.mockTranAliases);
    const mockProfile = coerceMockProfile(o.mockProfile);

    return {
      version: o.version === APP_PROXY_CONFIG_VERSION_LEGACY ? APP_PROXY_CONFIG_VERSION : Math.floor(Number(o.version)),
      proxyServer: {
        port: clamped,
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

async function mergeAppProxyConfigDisk(partial: unknown): Promise<AppProxyConfig> {
  const cur = await readAppProxyConfigDisk();
  const o = partial != null && typeof partial === "object" ? (partial as Record<string, unknown>) : {};
  const psIn = o.proxyServer;
  let port = cur.proxyServer.port;
  let enabled = cur.proxyServer.enabled;
  let servingFolderName = cur.proxyServer.servingFolderName ?? null;
  let careDummyMobilityPath = cur.proxyServer.careDummyMobilityPath ?? null;
  let careDummyAutoStart = Boolean(cur.proxyServer.careDummyAutoStart);
  let careDummyServerWorkdir = cur.proxyServer.careDummyServerWorkdir ?? null;
  let careDummyServerPort =
    typeof cur.proxyServer.careDummyServerPort === "number" && Number.isFinite(cur.proxyServer.careDummyServerPort)
      ? Math.min(65535, Math.max(1, Math.floor(cur.proxyServer.careDummyServerPort)))
      : DEFAULT_CARE_DUMMY_SERVER_PORT;
  let upstreamAutoStart = typeof cur.proxyServer.upstreamAutoStart === "boolean" ? cur.proxyServer.upstreamAutoStart : careDummyAutoStart;
  let upstreamServerWorkdir = cur.proxyServer.upstreamServerWorkdir ?? careDummyServerWorkdir;
  let upstreamServerPort =
    typeof cur.proxyServer.upstreamServerPort === "number" && Number.isFinite(cur.proxyServer.upstreamServerPort)
      ? Math.min(65535, Math.max(1, Math.floor(cur.proxyServer.upstreamServerPort)))
      : careDummyServerPort;
  let upstreamServerCommand = cur.proxyServer.upstreamServerCommand ?? null;
  let upstreamNodePath = cur.proxyServer.upstreamNodePath ?? null;
  if (psIn && typeof psIn === "object") {
    const p = psIn as Record<string, unknown>;
    if (typeof p.port === "number" && Number.isFinite(p.port)) {
      port = Math.min(65535, Math.max(1, Math.floor(p.port)));
    }
    if (typeof p.enabled === "boolean") enabled = p.enabled;
    if ("servingFolderName" in p) {
      if (p.servingFolderName === null || p.servingFolderName === "") servingFolderName = null;
      else if (typeof p.servingFolderName === "string") {
        const t = p.servingFolderName.trim();
        servingFolderName = t && isSafeProjectFolderName(t) ? t : null;
      }
    }
    if ("careDummyMobilityPath" in p) {
      if (p.careDummyMobilityPath === null || p.careDummyMobilityPath === "") careDummyMobilityPath = null;
      else if (typeof p.careDummyMobilityPath === "string") {
        const t = p.careDummyMobilityPath.trim();
        careDummyMobilityPath = t || null;
      }
    }
    if (typeof p.careDummyAutoStart === "boolean") careDummyAutoStart = p.careDummyAutoStart;
    if ("careDummyServerWorkdir" in p) {
      if (p.careDummyServerWorkdir === null || p.careDummyServerWorkdir === "") careDummyServerWorkdir = null;
      else if (typeof p.careDummyServerWorkdir === "string") {
        const t = p.careDummyServerWorkdir.trim();
        careDummyServerWorkdir = t || null;
      }
    }
    if (typeof p.careDummyServerPort === "number" && Number.isFinite(p.careDummyServerPort)) {
      careDummyServerPort = Math.min(65535, Math.max(1, Math.floor(p.careDummyServerPort)));
    }
    if (typeof p.upstreamAutoStart === "boolean") upstreamAutoStart = p.upstreamAutoStart;
    if ("upstreamServerWorkdir" in p) {
      if (p.upstreamServerWorkdir === null || p.upstreamServerWorkdir === "") upstreamServerWorkdir = null;
      else if (typeof p.upstreamServerWorkdir === "string") {
        const t = p.upstreamServerWorkdir.trim();
        upstreamServerWorkdir = t || null;
      }
    }
    if (typeof p.upstreamServerPort === "number" && Number.isFinite(p.upstreamServerPort)) {
      upstreamServerPort = Math.min(65535, Math.max(1, Math.floor(p.upstreamServerPort)));
    }
    if ("upstreamServerCommand" in p) {
      if (p.upstreamServerCommand === null || p.upstreamServerCommand === "") upstreamServerCommand = null;
      else if (typeof p.upstreamServerCommand === "string") {
        const t = p.upstreamServerCommand.trim();
        upstreamServerCommand = t || null;
      }
    }
    if ("upstreamNodePath" in p) {
      if (p.upstreamNodePath === null || p.upstreamNodePath === "") upstreamNodePath = null;
      else if (typeof p.upstreamNodePath === "string") {
        const t = p.upstreamNodePath.trim();
        upstreamNodePath = t || null;
      }
    }
  }

  let interceptGateway: AppProxyInterceptGatewayConfig = {
    ...defaultInterceptGateway(),
    ...(cur.interceptGateway ?? {}),
  };
  const igIn = o.interceptGateway ?? o.careGateway;
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
      if (g.upstreamWorkdir === null || g.upstreamWorkdir === "") {
        interceptGateway = { ...interceptGateway, upstreamWorkdir: null };
      } else if (typeof g.upstreamWorkdir === "string") {
        const t = g.upstreamWorkdir.trim();
        interceptGateway = { ...interceptGateway, upstreamWorkdir: t || null };
      }
    } else if ("dummyServerDirectory" in g) {
      if (g.dummyServerDirectory === null || g.dummyServerDirectory === "") {
        interceptGateway = { ...interceptGateway, upstreamWorkdir: null };
      } else if (typeof g.dummyServerDirectory === "string") {
        const t = g.dummyServerDirectory.trim();
        interceptGateway = { ...interceptGateway, upstreamWorkdir: t || null };
      }
    }
  }

  let mockTranAliases = coerceMockTranAliases(cur.mockTranAliases);
  let mockProfile = coerceMockProfile(cur.mockProfile);
  if ("mockProfile" in o) {
    mockProfile = coerceMockProfile(o.mockProfile);
  }
  if ("mockTranAliases" in o) {
    mockTranAliases = coerceMockTranAliases(o.mockTranAliases);
  }

  const next: AppProxyConfig = {
    version: APP_PROXY_CONFIG_VERSION,
    proxyServer: {
      port,
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

export async function readApisIndex(projectRoot: string): Promise<StoredApiEntry[]> {
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

export async function readResponsesStoreFromDisk(projectRoot: string): Promise<ApiResponsesStoreFile> {
  return readApiResponsesStore(projectRoot);
}

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

type LooseJsonImportErr = "duplicate-name" | "no-json-files";

/** 한 디렉터리 바로 아래의 .json 파일명(project.json 제외), 정렬됨 */
async function listJsonFileNamesInDirectory(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const n = ent.name;
    if (!n.toLowerCase().endsWith(".json")) continue;
    if (n.toLowerCase() === "project.json") continue;
    names.push(n);
  }
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

/** 선택 폴더 바로 아래 하위 폴더 중, 안에 .json 이 하나라도 있는 폴더만 (폴더명 = API 이름 후보) */
async function collectNestedFolderJsonImports(sourceDir: string): Promise<{ folderName: string; fileNames: string[] }[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(sourceDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: { folderName: string; fileNames: string[] }[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith(".")) continue;
    const sub = join(sourceDir, ent.name);
    const jsonNames = await listJsonFileNamesInDirectory(sub);
    if (jsonNames.length === 0) continue;
    out.push({ folderName: ent.name, fileNames: jsonNames });
  }
  out.sort((a, b) => a.folderName.localeCompare(b.folderName));
  return out;
}

function jsonFileToConfiguration(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw) as unknown, null, 2);
  } catch {
    return raw.trim();
  }
}

function uniqueResponseLabelForImport(list: ApiResponseRowDisk[], base: string): string {
  const want = base.trim() || "응답";
  if (!list.some((r) => r.label === want)) return want;
  let n = 2;
  while (list.some((r) => r.label === `${want}-${n}`)) n++;
  return `${want}-${n}`;
}

/** 다이얼로그에서 선택한 JSON 경로들 → API + 저장 응답 반영 */
async function importApisFromJsonPaths(
  projectRoot: string,
  filePaths: string[],
): Promise<{ imported: number; errors: string[]; touchedApiNames: string[] }> {
  const errors: string[] = [];
  const touchedApiNames: string[] = [];
  let imported = 0;

  for (const fp of filePaths) {
    const fileLabel = basename(fp);
    if (!fileLabel.toLowerCase().endsWith(".json")) {
      errors.push(`${fileLabel}: JSON 파일이 아닙니다.`);
      continue;
    }
    const apiKey = fileLabel.replace(/\.json$/i, "").trim();
    if (!apiKey || !isSafeProjectFolderName(apiKey)) {
      errors.push(`${fileLabel}: API 이름으로 사용할 수 없습니다.`);
      continue;
    }
    if (apiKey.toLowerCase() === "project") {
      errors.push(`${fileLabel}: 이 파일명은 사용할 수 없습니다.`);
      continue;
    }

    let raw: string;
    try {
      raw = await fs.readFile(fp, "utf-8");
    } catch {
      errors.push(`${fileLabel}: 파일을 읽지 못했습니다.`);
      continue;
    }
    const configuration = jsonFileToConfiguration(raw);

    const items = await readApisIndex(projectRoot);
    const manifest = await readManifest(projectRoot);
    if (!manifest) {
      errors.push(`${fileLabel}: 프로젝트 매니페스트가 없습니다.`);
      break;
    }

    const existing = items.find((x) => x.name.trim() === apiKey);

    if (!existing) {
      if (items.some((x) => x.method === "POST" && x.tran.trim() === apiKey)) {
        errors.push(`${fileLabel}: 같은 트랜 이름의 API가 이미 있습니다.`);
        continue;
      }
      const now = new Date().toISOString();
      const entry: StoredApiEntry = {
        id: randomUUID(),
        method: "POST",
        tran: apiKey,
        description: `JSON 가져오기: ${fileLabel}`,
        name: apiKey,
        createdAt: now,
        updatedAt: now,
      };
      const nextItems = [...items, entry];
      await writeApisIndex(projectRoot, nextItems);
      await fs.writeFile(
        join(projectRoot, "project.json"),
        JSON.stringify({ ...manifest, updatedAt: now } satisfies ProjectManifest, null, 2),
        "utf-8",
      );
    }

    const store = await readApiResponsesStore(projectRoot);
    const list = [...(store.byApiName[apiKey] ?? [])];
    const label = list.length === 0 ? "default" : uniqueResponseLabelForImport(list, apiKey);
    const now = new Date().toISOString();
    const outValue = `saved-${randomUUID()}`;
    list.push({
      id: outValue,
      value: outValue,
      label,
      description: "",
      editorType: "default",
      configuration,
      createdAt: now,
      updatedAt: now,
    });
    store.byApiName[apiKey] = list;
    await writeApiResponsesStore(projectRoot, store.byApiName);
    const m2 = await readManifest(projectRoot);
    if (m2) {
      await fs.writeFile(join(projectRoot, "project.json"), JSON.stringify({ ...m2, updatedAt: now }, null, 2), "utf-8");
    }
    touchedApiNames.push(apiKey);
    imported++;
  }

  return { imported, errors, touchedApiNames };
}

/**
 * project.json 없이 가져오기:
 * - 하위 폴더 안에 .json 이 있으면: 그 폴더 = API 하나, 폴더 안 각 json = 저장 응답 하나
 * - 루트의 .json 은 기존과 같이 API 하나당 파일 하나(이름 충돌 시 하위 폴더 API 우선)
 */
async function importLooseJsonFolderAsProject(
  sourceDir: string,
  options?: { projectDisplayName?: string },
): Promise<{ ok: true; project: ProjectManifest } | { ok: false; error: LooseJsonImportErr }> {
  const nestedPlan = await collectNestedFolderJsonImports(sourceDir);
  let entries: Dirent[];
  try {
    entries = await fs.readdir(sourceDir, { withFileTypes: true });
  } catch {
    return { ok: false, error: "no-json-files" };
  }
  const rootJsonNames: string[] = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const n = ent.name;
    if (!n.toLowerCase().endsWith(".json")) continue;
    if (n.toLowerCase() === "project.json") continue;
    rootJsonNames.push(n);
  }
  rootJsonNames.sort((a, b) => a.localeCompare(b));

  const root = getProjectsRoot();
  const title =
    (options?.projectDisplayName && options.projectDisplayName.trim()) ||
    basename(sourceDir).trim() ||
    "imported-project";
  if (await hasProjectWithDisplayName(root, title)) {
    return { ok: false, error: "duplicate-name" };
  }

  const folderName = await uniqueFolderName(root, slugify(title));
  const dest = join(root, folderName);
  await fs.mkdir(join(dest, "apis"), { recursive: true });

  const now = new Date().toISOString();
  const items: StoredApiEntry[] = [];
  const byApiName: Record<string, ApiResponseRowDisk[]> = {};
  const usedApiKeys = new Set<string>();

  for (const { folderName: subFolder, fileNames } of nestedPlan) {
    const apiKey = subFolder.trim();
    if (!apiKey || !isSafeProjectFolderName(apiKey)) continue;

    const responses: ApiResponseRowDisk[] = [];
    for (const fileName of fileNames) {
      let raw: string;
      try {
        raw = await fs.readFile(join(sourceDir, subFolder, fileName), "utf-8");
      } catch {
        continue;
      }
      const configuration = jsonFileToConfiguration(raw);
      const val = `saved-${randomUUID()}`;
      const labelStem = fileName.replace(/\.json$/i, "").trim() || "default";
      responses.push({
        id: val,
        value: val,
        label: labelStem,
        description: `파일: ${fileName}`,
        editorType: "default",
        configuration,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (responses.length === 0) continue;

    usedApiKeys.add(apiKey);
    items.push({
      id: randomUUID(),
      method: "POST",
      tran: apiKey,
      description: `가져온 폴더 · 응답 ${responses.length}개`,
      name: apiKey,
      createdAt: now,
      updatedAt: now,
    });
    byApiName[apiKey] = responses;
  }

  for (const fileName of rootJsonNames) {
    const apiKey = fileName.replace(/\.json$/i, "").trim();
    if (!apiKey || !isSafeProjectFolderName(apiKey)) continue;
    if (usedApiKeys.has(apiKey)) continue;

    let raw: string;
    try {
      raw = await fs.readFile(join(sourceDir, fileName), "utf-8");
    } catch {
      continue;
    }

    const configuration = jsonFileToConfiguration(raw);
    const entry: StoredApiEntry = {
      id: randomUUID(),
      method: "POST",
      tran: apiKey,
      description: `가져온 파일: ${fileName}`,
      name: apiKey,
      createdAt: now,
      updatedAt: now,
    };
    items.push(entry);
    usedApiKeys.add(apiKey);

    const val = `saved-${randomUUID()}`;
    byApiName[apiKey] = [
      {
        id: val,
        value: val,
        label: "default",
        description: "",
        editorType: "default",
        configuration,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  if (items.length === 0) return { ok: false, error: "no-json-files" };

  const manifestDescription =
    nestedPlan.length > 0
      ? `하위 폴더(및 루트 JSON)에서 ${items.length}개 API`
      : `${items.length}개의 JSON 파일에서 생성`;

  const manifest: ProjectManifest = {
    version: PROJECT_MANIFEST_VERSION,
    id: randomUUID(),
    name: title,
    description: manifestDescription,
    createdAt: now,
    updatedAt: now,
    isFavorite: false,
    folderName,
  };

  await fs.writeFile(join(dest, "project.json"), JSON.stringify(manifest, null, 2), "utf-8");
  await writeApisIndex(dest, items);
  await writeApiResponsesStore(dest, byApiName);

  return { ok: true, project: manifest };
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
  ipcMain.removeHandler("project-fs:importApisJsonPick");
  ipcMain.removeHandler("project-fs:delete");
  ipcMain.removeHandler("project-fs:listApis");
  ipcMain.removeHandler("project-fs:addApi");
  ipcMain.removeHandler("project-fs:updateApi");
  ipcMain.removeHandler("project-fs:syncApisFromSfdModule");
  ipcMain.removeHandler("project-fs:deleteApi");
  ipcMain.removeHandler("project-fs:getResponsesStore");
  ipcMain.removeHandler("project-fs:upsertApiResponse");
  ipcMain.removeHandler("project-fs:deleteApiResponse");
  ipcMain.removeHandler("project-fs:getAppProxyConfig");
  ipcMain.removeHandler("project-fs:setAppProxyConfig");
  ipcMain.removeHandler("project-fs:setLinkedClients");

  ipcMain.handle("project-fs:getAppProxyConfig", async (): Promise<AppProxyConfig> => readAppProxyConfigDisk());

  ipcMain.handle("project-fs:setAppProxyConfig", async (_e, partial: unknown): Promise<
    | { ok: true; config: AppProxyConfig }
    | { ok: false; error: string }
  > => {
    try {
      const next = await mergeAppProxyConfigDisk(partial);
      const { applyMockProxyFromConfig } = await import("./mock-proxy-server");
      void applyMockProxyFromConfig();
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

    try {
      await mergeAppProxyConfigDisk({ proxyServer: { enabled: true } });
      const { applyMockProxyFromConfig } = await import("./mock-proxy-server");
      void applyMockProxyFromConfig();
    } catch {
      /* 모의 서버 설정 실패는 프로젝트 생성 성공과 분리 */
    }

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
          let zipTitle = basename(picked);
          if (zipTitle.toLowerCase().endsWith(".zip")) zipTitle = zipTitle.slice(0, -4);
          const loose = await importLooseJsonFolderAsProject(tmpRoot, {
            projectDisplayName: zipTitle.trim() || undefined,
          });
          await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
          cleanupTmp = null;
          if (loose.ok) return { ok: true as const, project: loose.project };
          if (loose.error === "duplicate-name") return { ok: false as const, error: "duplicate-name" };
          if (loose.error === "no-json-files") return { ok: false as const, error: "no-json-files" };
          return { ok: false as const, error: "invalid-manifest" };
        }
        srcDir = found;
      } catch {
        if (cleanupTmp) await fs.rm(cleanupTmp, { recursive: true, force: true }).catch(() => {});
        return { ok: false as const, error: "invalid-zip" };
      }
    } else {
      try {
        const st = await fs.stat(picked);
        if (st.isDirectory()) {
          const nested = await findProjectDirWithManifest(picked);
          srcDir = nested ?? picked;
        } else if (st.isFile()) {
          const fn = basename(picked);
          if (fn.toLowerCase() === "project.json") {
            srcDir = dirname(picked);
          } else if (picked.toLowerCase().endsWith(".json")) {
            const rawFile = await fs.readFile(picked, "utf-8");
            let parsed: unknown;
            try {
              parsed = JSON.parse(rawFile);
            } catch {
              return { ok: false as const, error: "invalid-manifest" };
            }
            const shell = manifestFromJsonFilePayload(parsed);
            if (!shell) {
              return { ok: false as const, error: "invalid-manifest" };
            }
            const tmpRoot = join(tmpdir(), `df-import-${randomUUID()}`);
            cleanupTmp = tmpRoot;
            await fs.mkdir(join(tmpRoot, "apis"), { recursive: true });
            await fs.writeFile(join(tmpRoot, "project.json"), JSON.stringify(shell, null, 2), "utf-8");
            await fs.writeFile(join(tmpRoot, "apis", "index.json"), "[]", "utf-8");
            await fs.writeFile(
              join(tmpRoot, "apis", "responses-store.json"),
              JSON.stringify({ version: 1, byApiName: {} }, null, 2),
              "utf-8",
            );
            srcDir = tmpRoot;
          } else {
            return { ok: false as const, error: "invalid-manifest" };
          }
        }
      } catch {
        return { ok: false as const, error: "invalid-manifest" };
      }
    }

    const incoming = await readManifest(srcDir);
    if (!incoming) {
      try {
        const st = await fs.stat(srcDir);
        if (st.isDirectory()) {
          const loose = await importLooseJsonFolderAsProject(srcDir, {
            projectDisplayName: basename(srcDir).trim() || undefined,
          });
          if (loose.ok) {
            if (cleanupTmp) await fs.rm(cleanupTmp, { recursive: true, force: true }).catch(() => {});
            return { ok: true as const, project: loose.project };
          }
          if (loose.error === "duplicate-name") {
            if (cleanupTmp) await fs.rm(cleanupTmp, { recursive: true, force: true }).catch(() => {});
            return { ok: false as const, error: "duplicate-name" };
          }
          if (loose.error === "no-json-files") {
            if (cleanupTmp) await fs.rm(cleanupTmp, { recursive: true, force: true }).catch(() => {});
            return { ok: false as const, error: "no-json-files" };
          }
        }
      } catch {
        /* fall through */
      }
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

    const oldName = prev.name.trim();
    const newName = apiDisplayName.trim();
    if (oldName !== newName) {
      const store = await readApiResponsesStore(projectRoot);
      const nest = { ...store.byApiName };
      if (Object.prototype.hasOwnProperty.call(nest, oldName)) {
        const moved = nest[oldName];
        if (moved != null && moved.length > 0) {
          nest[newName] = [...moved, ...(nest[newName] ?? [])];
        }
        delete nest[oldName];
        await writeApiResponsesStore(projectRoot, nest);
      }
    }

    const nextManifest: ProjectManifest = { ...manifest, updatedAt: now };
    await fs.writeFile(join(projectRoot, "project.json"), JSON.stringify(nextManifest, null, 2), "utf-8");

    return { ok: true as const, api: entry };
  });

  ipcMain.handle(
    "project-fs:syncApisFromSfdModule",
    async (
      _e,
      folderName: unknown,
      sfdPath: unknown,
    ): Promise<
      | { ok: true; updated: number; skipped: string[] }
      | { ok: false; error: string }
    > => {
      const fname = typeof folderName === "string" ? folderName.trim() : "";
      if (!fname || !isSafeProjectFolderName(fname)) return { ok: false as const, error: "invalid-folder" };

      const absPath = typeof sfdPath === "string" ? sfdPath.trim() : "";
      if (!absPath) return { ok: false as const, error: "empty-path" };

      const root = getProjectsRoot();
      const projectRoot = join(root, fname);
      const manifest = await readManifest(projectRoot);
      if (!manifest) return { ok: false as const, error: "not-found" };

      let text: string;
      try {
        text = await fs.readFile(absPath, "utf-8");
      } catch {
        return { ok: false as const, error: "read-failed" };
      }

      const careLookup = buildCareTranLookup(parseSfdModuleInterfaces(text));
      const items = await readApisIndex(projectRoot);
      const store = await readApiResponsesStore(projectRoot);
      const nest = { ...store.byApiName };
      const now = new Date().toISOString();
      let updated = 0;
      const skipped: string[] = [];

      for (let i = 0; i < items.length; i++) {
        const row = items[i]!;
        const care = findCareForProxyApi(careLookup, row);
        if (!care) continue;
        const t = row.tran.trim() || row.name.trim();

        const newName = care.key.trim();
        const newDesc = care.desc.trim() || row.description.trim();
        const oldName = row.name.trim();

        if (row.name.trim() === newName && row.description.trim() === newDesc) continue;

        if (items.some((x, j) => j !== i && x.name.trim() === newName)) {
          skipped.push(`${t}: duplicate target name "${newName}"`);
          continue;
        }

        if (oldName !== newName && Object.prototype.hasOwnProperty.call(nest, oldName)) {
          const moved = nest[oldName];
          if (moved != null && moved.length > 0) {
            nest[newName] = [...moved, ...(nest[newName] ?? [])];
          }
          delete nest[oldName];
        }

        items[i] = {
          ...row,
          name: newName,
          description: newDesc,
          updatedAt: now,
        };
        updated += 1;
      }

      if (updated > 0) {
        await writeApisIndex(projectRoot, items);
        await writeApiResponsesStore(projectRoot, nest);
        const nextManifest: ProjectManifest = { ...manifest, updatedAt: now };
        await fs.writeFile(join(projectRoot, "project.json"), JSON.stringify(nextManifest, null, 2), "utf-8");
      }

      return { ok: true as const, updated, skipped };
    },
  );

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

  ipcMain.handle(
    "project-fs:importApisJsonPick",
    async (
      _e,
      folderName: unknown,
    ): Promise<
      | { ok: true; imported: number; touchedApiNames: string[]; errors: string[] }
      | { ok: false; error: string; errors?: string[] }
    > => {
      const fname = typeof folderName === "string" ? folderName.trim() : "";
      if (!fname || !isSafeProjectFolderName(fname)) return { ok: false as const, error: "invalid-folder" };

      const root = getProjectsRoot();
      const projectRoot = join(root, fname);
      if (!(await readManifest(projectRoot))) return { ok: false as const, error: "not-found" };

      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "API JSON 가져오기 (파일명이 API 이름이 됩니다)",
        buttonLabel: "가져오기",
        properties: ["openFile", "multiSelections"],
        filters: [
          { name: "JSON", extensions: ["json"] },
          { name: "모든 파일", extensions: ["*"] },
        ],
      });
      if (canceled || !filePaths?.length) return { ok: false as const, error: "cancelled" };

      const { imported, errors, touchedApiNames } = await importApisFromJsonPaths(projectRoot, filePaths);
      if (imported === 0) {
        return { ok: false as const, error: "no-valid-json", errors };
      }
      return { ok: true as const, imported, touchedApiNames, errors };
    },
  );

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

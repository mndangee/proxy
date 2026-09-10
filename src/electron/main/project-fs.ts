import { randomUUID } from "crypto";
import type { Dirent } from "fs";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { basename, dirname, join } from "path";

import AdmZip from "adm-zip";
import { app, dialog, ipcMain } from "electron";

import type { AppProxyConfig, AppProxyInterceptGatewayConfig, LinkedClientEntry, MockProfileType } from "@/types";
import {
  buildCareTranLookup,
  findCareForProxyApi,
  normalizeTranIdKey,
  parseSfdModuleInterfaces,
  type SfdCareInterface,
} from "@/libs/care/sfdModuleInterfaces";

export const PROJECT_MANIFEST_VERSION = 1;

export const DEFAULT_PROXY_SERVER_PORT = 4780;
export const DEFAULT_CARE_DUMMY_SERVER_PORT = 7778;

export const APP_PROXY_CONFIG_VERSION = 2;

/** 디스크 v1: careGateway, v2: interceptGateway */
export const APP_PROXY_CONFIG_VERSION_LEGACY = 1;

async function detectServerCommandInDirectory(workdir: string): Promise<
  { ok: true; command: string; script: string; packageManager: string } | { ok: false; error: string }
> {
  const dummyServerPath = join(workdir, "dummy.server.js");
  try {
    if ((await fs.stat(dummyServerPath)).isFile()) {
      return { ok: true, command: "{{node}} dummy.server.js -port {{port}}", script: "dummy.server.js", packageManager: "node" };
    }
  } catch {
    // package.json 방식도 확인한다.
  }

  let parsed: { scripts?: Record<string, unknown> };
  try {
    parsed = JSON.parse(await fs.readFile(join(workdir, "package.json"), "utf-8")) as { scripts?: Record<string, unknown> };
  } catch {
    return { ok: false, error: "package.json 또는 dummy.server.js를 찾을 수 없습니다." };
  }
  const scripts = parsed.scripts && typeof parsed.scripts === "object" ? parsed.scripts : {};
  const script = ["dev", "start", "serve"].find((name) => typeof scripts[name] === "string" && String(scripts[name]).trim());
  if (!script) return { ok: false, error: "package.json에 dev, start 또는 serve 실행 스크립트가 없습니다." };

  const exists = async (name: string): Promise<boolean> => fs.stat(join(workdir, name)).then(() => true).catch(() => false);
  const packageManager = await exists("pnpm-lock.yaml")
    ? "pnpm"
    : await exists("yarn.lock")
      ? "yarn"
      : await exists("bun.lockb") || await exists("bun.lock")
        ? "bun"
        : "npm";
  const scriptBody = String(scripts[script]).toLowerCase();
  const base = packageManager === "yarn" ? `yarn ${script}` : `${packageManager} run ${script}`;
  let portArgs = "";
  if (/\bvite\b|\bnuxt\b/.test(scriptBody)) portArgs = packageManager === "yarn" ? " --port {{port}}" : " -- --port {{port}}";
  else if (/\bnext\b/.test(scriptBody)) portArgs = packageManager === "yarn" ? " -p {{port}}" : " -- -p {{port}}";
  return { ok: true, command: `${base}${portArgs}`, script, packageManager };
}

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

const MAX_MOCK_API_LATENCY_MS = 300_000;

export function coerceMockApiLatencyMs(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const ks = String(k).trim();
    if (!ks || typeof v !== "number" || !Number.isFinite(v)) continue;
    out[ks] = Math.max(0, Math.min(MAX_MOCK_API_LATENCY_MS, Math.floor(v)));
  }
  return out;
}

export function coerceMockActiveApiResponses(raw: unknown): Record<string, import("@/types").MockActiveApiResponseRef> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, import("@/types").MockActiveApiResponseRef> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const ks = String(k).trim();
    if (!ks || !v || typeof v !== "object" || Array.isArray(v)) continue;
    const o = v as Record<string, unknown>;
    const responseValue = typeof o.responseValue === "string" ? o.responseValue.trim() : "";
    if (!responseValue) continue;
    const ed = String(o.editorType ?? "default").toLowerCase();
    const editorType: "default" | "test" | "error" = ed === "test" ? "test" : ed === "error" ? "error" : "default";
    out[ks] = { responseValue, editorType };
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
  apiMetadataSources?: string[];
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
  const apiMetadataSources = Array.isArray(d.apiMetadataSources)
    ? [...new Set(d.apiMetadataSources.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))]
    : [];
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
  return {
    ...base,
    ...(linkedClients?.length ? { linkedClients } : {}),
    ...(apiMetadataSources.length ? { apiMetadataSources } : {}),
  };
}

function getAppProxyConfigPath(): string {
  return join(app.getPath("userData"), "proxy-app-config.json");
}

/** 비정상 종료 복구 시 다음 시작에서 프록시가 다시 자동 점유하지 않도록 런타임 설정만 끈다. */
export async function disableProxyConfigAfterCrashRecovery(): Promise<void> {
  await mergeAppProxyConfigDisk({
    proxyServer: { enabled: false },
    interceptGateway: { enabled: false },
  });
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
    mockApiLatencyMs: {},
    mockActiveApiResponses: {},
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
    const mockApiLatencyMs = coerceMockApiLatencyMs(o.mockApiLatencyMs);
    const mockActiveApiResponses = coerceMockActiveApiResponses(o.mockActiveApiResponses);

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
      mockApiLatencyMs,
      mockActiveApiResponses,
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

  let mockApiLatencyMs = coerceMockApiLatencyMs(cur.mockApiLatencyMs);
  if ("mockApiLatencyMs" in o) {
    mockApiLatencyMs = coerceMockApiLatencyMs(o.mockApiLatencyMs);
  }

  let mockActiveApiResponses = coerceMockActiveApiResponses(cur.mockActiveApiResponses);
  if ("mockActiveApiResponses" in o) {
    mockActiveApiResponses = coerceMockActiveApiResponses(o.mockActiveApiResponses);
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
    mockApiLatencyMs,
    mockActiveApiResponses,
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

async function uniqueProjectDisplayName(root: string, requestedName: string): Promise<string> {
  const base = requestedName.trim() || "imported-project";
  if (!(await hasProjectWithDisplayName(root, base))) return base;
  let suffix = 2;
  while (await hasProjectWithDisplayName(root, `${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
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

function coerceStoredApiMethod(raw: unknown): string {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  return HTTP_METHODS.has(s) ? s : "POST";
}

function pickFirstNonEmptyString(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** 가져온/외부 `apis/index.json` 호환 — id·method 누락·tranId·key 등 별칭 */
function normalizeApisIndexItem(item: unknown): StoredApiEntry | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : randomUUID();
  const method = coerceStoredApiMethod(o.method);
  const tran = pickFirstNonEmptyString(o, ["tran", "path", "tranId", "transactionId"]);
  const descRaw = o.description ?? o.desc;
  const description = typeof descRaw === "string" ? descRaw : "";
  let name = pickFirstNonEmptyString(o, ["name", "apiName", "key", "apiKey"]);
  if (!name) {
    if (tran) name = tran;
    else name = method;
  }
  if (!name.trim()) return null;
  if (!isSafeProjectFolderName(name)) return null;

  const createdAt =
    typeof o.createdAt === "string" && o.createdAt.trim() ? o.createdAt.trim() : new Date().toISOString();
  const updatedAt =
    typeof o.updatedAt === "string" && o.updatedAt.trim() ? o.updatedAt.trim() : createdAt;
  return { id, method, tran, description, name, createdAt, updatedAt };
}

async function pathMtimeMs(fp: string): Promise<number> {
  try {
    return (await fs.stat(fp)).mtimeMs;
  } catch {
    return 0;
  }
}

async function maxPathMtimeIso(paths: string[], fallbackIso: string): Promise<string> {
  let max = 0;
  for (const p of paths) {
    const ms = await pathMtimeMs(p);
    if (ms > max) max = ms;
  }
  return max > 0 ? new Date(max).toISOString() : fallbackIso;
}

export async function readApisIndex(projectRoot: string): Promise<StoredApiEntry[]> {
  const fp = join(projectRoot, "apis", "index.json");
  try {
    const raw = await fs.readFile(fp, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: StoredApiEntry[] = [];
    for (const item of parsed) {
      const row = normalizeApisIndexItem(item);
      if (row) out.push(row);
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
  queryParams?: Record<string, string>;
  source?: { type: "server-dump"; id: string; fileName: string };
  createdAt: string;
  updatedAt: string;
};

function coerceResponseQueryParams(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const k = key.trim();
    if (!k || typeof value !== "string") continue;
    out[k] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

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

type ImportSummary = {
  detectedFormat: "server-dump" | "grouped-json" | "plain-json";
  apiCount: number;
  responseCount: number;
  skippedFileCount: number;
  defaultCount: number;
  testCount: number;
  errorCount: number;
  metadataMappedApiCount: number;
  metadataUnmappedApiCount: number;
  metadataUnmappedTrans: string[];
};

type ServerDumpFileMeta = { tran: string; sourceId: string; label: string };

/** `VD_MARN0157_1710_설명.json` 및 기존 서버의 구분자 변형을 공통 트랜 형식으로 정규화합니다. */
function parseServerDumpFileName(fileName: string): ServerDumpFileMeta | null {
  const stem = fileName.replace(/\.json$/i, "").normalize("NFC").trim();
  const match = /^VD(?:[_.]+VD)?[_.]+([A-Z][A-Z0-9]*?)_(\d+)(?:_(.*))?$/i.exec(stem);
  if (!match?.[1] || !match[2]) return null;
  const label = (match[3] ?? "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    tran: `VD.${match[1]}`,
    sourceId: match[2],
    label: label || `응답 ${match[2]}`,
  };
}

function detectServerDumpFiles(fileNames: string[]): Map<string, ServerDumpFileMeta> | null {
  if (fileNames.length < 2) return null;
  const parsed = new Map<string, ServerDumpFileMeta>();
  for (const fileName of fileNames) {
    const meta = parseServerDumpFileName(fileName);
    if (meta) parsed.set(fileName, meta);
  }
  return parsed.size / fileNames.length >= 0.7 ? parsed : null;
}

function serverDumpResponseTypeFromLabel(label: string): "default" | "test" | "error" | null {
  const normalized = label.normalize("NFC").toLowerCase();
  if (/(error|fail|failure|failed|에러|오류|실패)/i.test(normalized)) return "error";
  if (/(test|testing|temp|temporary|테스트|시험|임시)/i.test(normalized)) return "test";
  if (/(default|normal|success|기본|정상|성공)/i.test(normalized)) return "default";
  return null;
}

function serverDumpSourceIdNumber(row: ApiResponseRowDisk): number {
  const raw = row.source?.id ?? "";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

/** label 의미를 우선하고, 명시적 기본이 없으면 미분류 응답 중 가장 작은 sourceId를 기본으로 지정합니다. */
function assignServerDumpResponseTypes(rows: ApiResponseRowDisk[]): ApiResponseRowDisk[] {
  const ordered = [...rows].sort((a, b) => {
    const byId = serverDumpSourceIdNumber(a) - serverDumpSourceIdNumber(b);
    return byId !== 0 ? byId : (a.source?.fileName ?? "").localeCompare(b.source?.fileName ?? "");
  });
  const classified = ordered.map((row) => ({ row, inferred: serverDumpResponseTypeFromLabel(row.label) }));
  const explicitDefaults = classified.filter((item) => item.inferred === "default");
  const neutral = classified.filter((item) => item.inferred === null);
  const chosenDefault = explicitDefaults[0] ?? neutral[0] ?? classified.find((item) => item.inferred !== "error") ?? classified[0];

  return classified.map(({ row, inferred }) => ({
    ...row,
    editorType:
      chosenDefault?.row === row
        ? "default"
        : inferred === "error"
          ? "error"
          : "test",
  }));
}

/** Default 응답이 하나뿐이면 API 설명을 응답 제목으로 사용해 목록에서 내용을 바로 알 수 있게 한다. */
function labelSingleDefaultResponse(rows: ApiResponseRowDisk[], apiDescription: string): ApiResponseRowDisk[] {
  const description = apiDescription.trim();
  if (!description || rows.length !== 1 || rows[0]?.editorType !== "default") return rows;
  return [{ ...rows[0], label: description }];
}

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

const MAX_INTERFACE_SCAN_FILES_PER_DIR = 120;

/**
 * startDir(프로젝트/JSON가 있는 폴더)에서 시작해 상위로 올라가는 체인.
 * 스캔 순서는 **가까운 디렉터리 먼저**(프로젝트 루트의 Sfd·interfaces 파일 우선) — reverse 하지 않음.
 */
function ancestorDirsScanOrderForInterfaces(startDir: string, maxUp: number): string[] {
  const chain: string[] = [];
  let d = startDir.trim();
  if (!d) return [];
  for (let i = 0; i < maxUp; i++) {
    chain.push(d);
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return chain;
}

/**
 * Care 레포: 더미 JSON은 `server/dummy`에만 있고 `Sfd.module.js`는 형제 `common/core`에 있음.
 * 상위 디렉터리 체인만 쓰면 `common/core`가 빠지므로, 각 조상 `d`에 대해 `d/common/core`가 있으면 바로 다음에 스캔한다.
 */
async function expandAncestorChainWithCareCommonCore(chain: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of chain) {
    const d = raw.trim();
    if (!d) continue;
    if (!seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
    const core = join(d, "common", "core");
    try {
      const st = await fs.stat(core);
      if (st.isDirectory() && !seen.has(core)) {
        seen.add(core);
        out.push(core);
      }
    } catch {
      /* no common/core */
    }
  }
  return out;
}

function inferInterfaceSourceScore(fileName: string, source: string): number {
  const low = fileName.toLowerCase();
  let score = 0;
  // 파일명 하드코딩 없이도 의미 있는 힌트만 가산.
  if (low.includes("interface")) score += 70;
  if (low.includes("module")) score += 20;
  if (low.includes("sfd")) score += 20;
  if (/\binterfaces\s*:\s*\{/.test(source)) score += 140;
  if (/\btranId\s*:/.test(source)) score += 40;
  if (/\bdesc\s*:/.test(source)) score += 20;
  return score;
}

/** 가져오기 루트·상위 폴더의 js/json/ts에서 interfaces 패턴 수집 (tranId 중복은 더 신뢰도 높은 소스 우선) */
async function collectSfdInterfaceEntriesFromDirs(dirs: string[]): Promise<SfdCareInterface[]> {
  const uniq = [...new Set(dirs.filter(Boolean))];
  const pickedByTran = new Map<string, { entry: SfdCareInterface; score: number; order: number }>();
  let order = 0;

  for (const dir of uniq) {
    if (basename(dir) === "node_modules") continue;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const files = entries
      .filter((e) => e.isFile() && /\.(js|mjs|cjs|ts|json)$/i.test(e.name))
      .map((e) => e.name)
      .filter((n) => {
        const low = n.toLowerCase();
        return low !== "project.json" && low !== "package-lock.json" && low !== "package.json";
      })
      .sort((a, b) => a.localeCompare(b))
      .slice(0, MAX_INTERFACE_SCAN_FILES_PER_DIR);

    for (const name of files) {
      let text: string;
      try {
        text = await fs.readFile(join(dir, name), "utf-8");
      } catch {
        continue;
      }

      const parsed = parseSfdModuleInterfaces(text);
      if (parsed.length === 0) continue;
      const sourceScore = inferInterfaceSourceScore(name, text);

      for (const e of parsed) {
        const n = normalizeTranIdKey(e.tranId);
        if (!n) continue;
        const prev = pickedByTran.get(n);
        const nextOrder = order++;
        if (!prev || sourceScore > prev.score || (sourceScore === prev.score && nextOrder < prev.order)) {
          pickedByTran.set(n, { entry: e, score: sourceScore, order: nextOrder });
        }
      }
    }
  }

  return [...pickedByTran.values()]
    .sort((a, b) => a.order - b.order)
    .map((x) => x.entry);
}

function pickInterfaceForFileStem(entries: SfdCareInterface[], fallbackApiKey: string): SfdCareInterface | undefined {
  if (entries.length === 0) return undefined;
  const fn = normalizeTranIdKey(fallbackApiKey);
  if (fn) {
    const hit = entries.find((e) => normalizeTranIdKey(e.tranId) === fn);
    if (hit) return hit;
  }
  return entries[0];
}

/**
 * 1) 본문에 interfaces 패턴
 * 2) careLookup: 상위 폴더 등에서 모은 tranId → { key, desc } (파일명 stem이 tranId일 때)
 * 3) 파일명 stem + 기본 설명
 */
function inferImportedJsonApiMeta(
  raw: string,
  fallbackApiKey: string,
  fallbackDescription: string,
  careLookup?: Map<string, SfdCareInterface> | null,
): { apiKey: string; tran: string; description: string; metadataMatched: boolean } {
  const fromBody = parseSfdModuleInterfaces(raw);
  const bodyPick = pickInterfaceForFileStem(fromBody, fallbackApiKey);
  if (bodyPick) {
    const name = bodyPick.key.trim();
    const tran = bodyPick.tranId.trim() || fallbackApiKey.trim();
    const desc = bodyPick.desc.trim() || fallbackDescription;
    if (name && isSafeProjectFolderName(name)) {
      return { apiKey: name, tran, description: desc, metadataMatched: true };
    }
  }
  if (careLookup && careLookup.size > 0) {
    const care = findCareForProxyApi(careLookup, { tran: fallbackApiKey, name: fallbackApiKey });
    if (care) {
      const name = care.key.trim();
      const tran = care.tranId.trim() || fallbackApiKey.trim();
      const desc = care.desc.trim() || fallbackDescription;
      if (name && isSafeProjectFolderName(name)) {
        return { apiKey: name, tran, description: desc, metadataMatched: true };
      }
    }
  }
  const fb = fallbackApiKey.trim();
  return {
    apiKey: fb,
    tran: fb,
    description: fallbackDescription,
    metadataMatched: false,
  };
}

/**
 * 이미 복사된 프로젝트 루트 기준: 루트·상위 폴더의 js/json/ts 에서 interfaces 를 읽어
 * apis/index 의 name·tran·description 및 responses-store 키를 맞춤 (가져오기 직후 보강).
 */
async function enrichProjectApisFromNearbyInterfaceFiles(projectRoot: string): Promise<void> {
  const manifest = await readManifest(projectRoot);
  if (!manifest) return;

  const dirs = await expandAncestorChainWithCareCommonCore(ancestorDirsScanOrderForInterfaces(projectRoot, 6));
  const careLookup = buildCareTranLookup(await collectSfdInterfaceEntriesFromDirs(dirs));
  if (careLookup.size === 0) return;

  const items = await readApisIndex(projectRoot);
  if (items.length === 0) return;

  const store = await readApiResponsesStore(projectRoot);
  const nest = { ...store.byApiName };
  const now = new Date().toISOString();
  let updated = 0;

  for (let i = 0; i < items.length; i++) {
    const row = items[i]!;
    const care = findCareForProxyApi(careLookup, row);
    if (!care) continue;

    const newName = care.key.trim();
    const newDesc = care.desc.trim() || row.description.trim();
    const newTran = care.tranId.trim() || row.tran.trim();
    const oldName = row.name.trim();

    if (row.name.trim() === newName && row.description.trim() === newDesc && row.tran.trim() === newTran) continue;

    if (items.some((x, j) => j !== i && x.name.trim() === newName)) continue;

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
      tran: newTran,
      description: newDesc,
      updatedAt: now,
    };
    updated += 1;
  }

  if (updated > 0) {
    await writeApisIndex(projectRoot, items);
    await writeApiResponsesStore(projectRoot, nest);
    await fs.writeFile(join(projectRoot, "project.json"), JSON.stringify({ ...manifest, updatedAt: now }, null, 2), "utf-8");
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
  const careLookupMemo = new Map<string, Map<string, SfdCareInterface>>();

  async function careLookupNearJsonFile(jsonPath: string): Promise<Map<string, SfdCareInterface>> {
    const dirs = await expandAncestorChainWithCareCommonCore(ancestorDirsScanOrderForInterfaces(dirname(jsonPath), 5));
    const key = dirs.join("\0");
    const hit = careLookupMemo.get(key);
    if (hit) return hit;
    const entries = await collectSfdInterfaceEntriesFromDirs(dirs);
    const lookup = buildCareTranLookup(entries);
    careLookupMemo.set(key, lookup);
    return lookup;
  }

  for (const fp of filePaths) {
    const fileLabel = basename(fp);
    if (!fileLabel.toLowerCase().endsWith(".json")) {
      errors.push(`${fileLabel}: JSON 파일이 아닙니다.`);
      continue;
    }
    const stemFromFile = fileLabel.replace(/\.json$/i, "").trim();
    if (!stemFromFile || !isSafeProjectFolderName(stemFromFile)) {
      errors.push(`${fileLabel}: API 이름으로 사용할 수 없습니다.`);
      continue;
    }
    if (stemFromFile.toLowerCase() === "project") {
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

    const careLookup = await careLookupNearJsonFile(fp);
    const meta = inferImportedJsonApiMeta(raw, stemFromFile, `JSON 가져오기: ${fileLabel}`, careLookup);
    const apiKey = meta.apiKey;
    if (!apiKey || !isSafeProjectFolderName(apiKey)) {
      errors.push(`${fileLabel}: API 이름으로 사용할 수 없습니다.`);
      continue;
    }
    if (apiKey.toLowerCase() === "project") {
      errors.push(`${fileLabel}: 이 파일명은 사용할 수 없습니다.`);
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
      if (items.some((x) => x.method === "POST" && x.tran.trim() === meta.tran.trim())) {
        errors.push(`${fileLabel}: 같은 트랜(${meta.tran})의 API가 이미 있습니다.`);
        continue;
      }
      const now = new Date().toISOString();
      const entry: StoredApiEntry = {
        id: randomUUID(),
        method: "POST",
        tran: meta.tran,
        description: meta.description,
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
  options?: { projectDisplayName?: string; interfaceSearchRoots?: string[] },
): Promise<{ ok: true; project: ProjectManifest; summary: ImportSummary } | { ok: false; error: LooseJsonImportErr }> {
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
  const requestedTitle =
    (options?.projectDisplayName && options.projectDisplayName.trim()) ||
    basename(sourceDir).trim() ||
    "imported-project";
  const title = await uniqueProjectDisplayName(root, requestedTitle);

  const folderName = await uniqueFolderName(root, slugify(title));
  const dest = join(root, folderName);
  await fs.mkdir(join(dest, "apis"), { recursive: true });

  const now = new Date().toISOString();
  const items: StoredApiEntry[] = [];
  const byApiName: Record<string, ApiResponseRowDisk[]> = {};
  const usedApiKeys = new Set<string>();

  const configuredServerWorkdir = (await readAppProxyConfigDisk()).proxyServer.upstreamServerWorkdir?.trim() ?? "";
  const interfaceScanRoots = [
    ...ancestorDirsScanOrderForInterfaces(sourceDir, 5),
    ...(options?.interfaceSearchRoots ?? []).flatMap((root) => ancestorDirsScanOrderForInterfaces(root, 5)),
    ...(configuredServerWorkdir ? ancestorDirsScanOrderForInterfaces(configuredServerWorkdir, 5) : []),
  ];
  const interfaceScanDirs = await expandAncestorChainWithCareCommonCore(interfaceScanRoots);
  const globalCareLookup = buildCareTranLookup(await collectSfdInterfaceEntriesFromDirs(interfaceScanDirs));
  const serverDumpFiles = nestedPlan.length === 0 ? detectServerDumpFiles(rootJsonNames) : null;
  let skippedFileCount = 0;
  let importedResponseCount = 0;
  let metadataMappedApiCount = 0;
  const metadataUnmappedTrans: string[] = [];

  for (const { folderName: subFolder, fileNames } of nestedPlan) {
    const folderStem = subFolder.trim();
    if (!folderStem || !isSafeProjectFolderName(folderStem)) continue;

    const responses: ApiResponseRowDisk[] = [];
    const sourcePaths: string[] = [];
    let folderMeta: { apiKey: string; tran: string; description: string; metadataMatched: boolean } | null = null;
    const sortedNames = [...fileNames].sort((a, b) => a.localeCompare(b));
    for (const fileName of sortedNames) {
      const abs = join(sourceDir, subFolder, fileName);
      let raw: string;
      try {
        raw = await fs.readFile(abs, "utf-8");
      } catch {
        continue;
      }
      sourcePaths.push(abs);
      if (folderMeta == null) {
        folderMeta = inferImportedJsonApiMeta(
          raw,
          folderStem,
          `가져온 폴더 · 응답 ${sortedNames.length}개`,
          globalCareLookup,
        );
      }
      const configuration = jsonFileToConfiguration(raw);
      const val = `saved-${randomUUID()}`;
      const labelStem = fileName.replace(/\.json$/i, "").trim() || "default";
      const fileMs = await pathMtimeMs(abs);
      const fileMtimeIso = fileMs > 0 ? new Date(fileMs).toISOString() : now;
      responses.push({
        id: val,
        value: val,
        label: labelStem,
        description: `파일: ${fileName}`,
        editorType: "default",
        configuration,
        createdAt: fileMtimeIso,
        updatedAt: fileMtimeIso,
      });
    }

    if (responses.length === 0) continue;

    const meta =
      folderMeta ??
      inferImportedJsonApiMeta("", folderStem, `가져온 폴더 · 응답 ${responses.length}개`, globalCareLookup);
    const apiKey = meta.apiKey;
    if (!apiKey || usedApiKeys.has(apiKey)) continue;

    usedApiKeys.add(apiKey);
    const apiUpdatedIso = await maxPathMtimeIso(sourcePaths, now);
    items.push({
      id: randomUUID(),
      method: "POST",
      tran: meta.tran,
      description: meta.description,
      name: apiKey,
      createdAt: now,
      updatedAt: apiUpdatedIso,
    });
    byApiName[apiKey] = labelSingleDefaultResponse(responses, meta.description);
    if (meta.metadataMatched) metadataMappedApiCount += 1;
    else metadataUnmappedTrans.push(meta.tran);
  }

  if (serverDumpFiles) {
    const grouped = new Map<string, { responses: ApiResponseRowDisk[]; paths: string[] }>();
    for (const fileName of rootJsonNames) {
      const meta = serverDumpFiles.get(fileName);
      if (!meta) {
        skippedFileCount += 1;
        continue;
      }
      const absRoot = join(sourceDir, fileName);
      let raw: string;
      let configuration: string;
      try {
        raw = await fs.readFile(absRoot, "utf-8");
        configuration = JSON.stringify(JSON.parse(raw) as unknown, null, 2);
      } catch {
        skippedFileCount += 1;
        continue;
      }
      const fileMs = await pathMtimeMs(absRoot);
      const fileMtimeIso = fileMs > 0 ? new Date(fileMs).toISOString() : now;
      const value = `saved-${randomUUID()}`;
      const response: ApiResponseRowDisk = {
        id: value,
        value,
        label: meta.label,
        description: `서버 더미 데이터 · ${meta.sourceId}`,
        editorType: "default",
        configuration,
        source: { type: "server-dump", id: meta.sourceId, fileName },
        createdAt: fileMtimeIso,
        updatedAt: fileMtimeIso,
      };
      const bucket = grouped.get(meta.tran) ?? { responses: [], paths: [] };
      bucket.responses.push(response);
      bucket.paths.push(absRoot);
      grouped.set(meta.tran, bucket);
      importedResponseCount += 1;
    }

    for (const [tran, group] of grouped) {
      const responses = assignServerDumpResponseTypes(group.responses);
      const apiUpdatedIso = await maxPathMtimeIso(group.paths, now);
      const care = findCareForProxyApi(globalCareLookup, { tran, name: tran });
      const mappedApiName = care?.key.trim() || tran;
      const mappedTran = care?.tranId.trim() || tran;
      const mappedDescription = care?.desc.trim() || `서버 더미 데이터 · 응답 ${responses.length}개`;
      if (usedApiKeys.has(mappedApiName)) {
        skippedFileCount += group.responses.length;
        continue;
      }
      items.push({
        id: randomUUID(),
        method: "POST",
        tran: mappedTran,
        description: mappedDescription,
        name: mappedApiName,
        createdAt: now,
        updatedAt: apiUpdatedIso,
      });
      byApiName[mappedApiName] = labelSingleDefaultResponse(responses, mappedDescription);
      usedApiKeys.add(mappedApiName);
      if (care) metadataMappedApiCount += 1;
      else metadataUnmappedTrans.push(mappedTran);
    }
  }

  for (const fileName of serverDumpFiles ? [] : rootJsonNames) {
    const stemFromFile = fileName.replace(/\.json$/i, "").trim();
    if (!stemFromFile || !isSafeProjectFolderName(stemFromFile)) continue;

    const absRoot = join(sourceDir, fileName);
    let raw: string;
    try {
      raw = await fs.readFile(absRoot, "utf-8");
    } catch {
      continue;
    }

    const meta = inferImportedJsonApiMeta(raw, stemFromFile, `가져온 파일: ${fileName}`, globalCareLookup);
    const apiKey = meta.apiKey;
    if (!apiKey || usedApiKeys.has(apiKey)) continue;

    const rootMs = await pathMtimeMs(absRoot);
    const rootMtimeIso = rootMs > 0 ? new Date(rootMs).toISOString() : now;
    const configuration = jsonFileToConfiguration(raw);
    const entry: StoredApiEntry = {
      id: randomUUID(),
      method: "POST",
      tran: meta.tran,
      description: meta.description,
      name: apiKey,
      createdAt: now,
      updatedAt: rootMtimeIso,
    };
    items.push(entry);
    usedApiKeys.add(apiKey);

    const val = `saved-${randomUUID()}`;
    byApiName[apiKey] = [
      {
        id: val,
        value: val,
        label: meta.description.trim() || "default",
        description: "",
        editorType: "default",
        configuration,
        createdAt: rootMtimeIso,
        updatedAt: rootMtimeIso,
      },
    ];
    if (meta.metadataMatched) metadataMappedApiCount += 1;
    else metadataUnmappedTrans.push(meta.tran);
    importedResponseCount += 1;
  }

  if (items.length === 0) {
    await fs.rm(dest, { recursive: true, force: true }).catch(() => {});
    return { ok: false, error: "no-json-files" };
  }

  const manifestDescription =
    serverDumpFiles
      ? `서버 더미 데이터에서 ${items.length}개 API · ${importedResponseCount}개 응답`
      : nestedPlan.length > 0
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

  const rememberedMetadataFile = await readRememberedImportInterfaceFile();
  if (rememberedMetadataFile) {
    try {
      const rememberedLookup = buildCareTranLookup(parseSfdModuleInterfaces(await fs.readFile(rememberedMetadataFile, "utf-8")));
      if (items.some((item) => findCareForProxyApi(rememberedLookup, item))) {
        manifest.apiMetadataSources = [rememberedMetadataFile];
      }
    } catch { /* 가져오기 자체는 API 정보 파일 상태와 분리 */ }
  }

  await fs.writeFile(join(dest, "project.json"), JSON.stringify(manifest, null, 2), "utf-8");
  await writeApisIndex(dest, items);
  await writeApiResponsesStore(dest, byApiName);
  await enrichProjectApisFromNearbyInterfaceFiles(dest);

  const responseTypeCounts = countResponseTypes(Object.values(byApiName).flat());
  return {
    ok: true,
    project: manifest,
    summary: {
      detectedFormat: serverDumpFiles ? "server-dump" : nestedPlan.length > 0 ? "grouped-json" : "plain-json",
      apiCount: items.length,
      responseCount: serverDumpFiles ? importedResponseCount : Object.values(byApiName).reduce((sum, rows) => sum + rows.length, 0),
      skippedFileCount,
      ...responseTypeCounts,
      metadataMappedApiCount,
      metadataUnmappedApiCount: Math.max(0, items.length - metadataMappedApiCount),
      metadataUnmappedTrans: [...new Set(metadataUnmappedTrans)].sort((a, b) => a.localeCompare(b)),
    },
  };
}

export type ImportAnalysis = {
  sessionId: string;
  detectedFormat: "dataforge-project" | "server-dump" | "grouped-json" | "plain-json";
  projectName: string;
  apiCount: number;
  responseCount: number;
  defaultCount: number;
  testCount: number;
  errorCount: number;
  skippedFileCount: number;
  metadataMappedApiCount?: number;
  metadataUnmappedApiCount?: number;
  metadataUnmappedTrans?: string[];
};

type ImportPlan = {
  /** 분석 시점에 고정한 원본 스냅샷. 실행 단계에서는 실제 원본을 다시 읽지 않는다. */
  sourcePath: string;
  /** 스냅샷 복사 전 사용자가 선택한 실제 위치. API 모듈 메타데이터 탐색에만 사용한다. */
  interfaceSearchRoots: string[];
  snapshotRoot: string;
  analysis: Omit<ImportAnalysis, "sessionId">;
};

type PendingImportSession = { plan: ImportPlan; createdAt: number };

const pendingImportSessions = new Map<string, PendingImportSession>();
const IMPORT_SESSION_TTL_MS = 30 * 60 * 1000;

function getImportInterfaceSourcePath(): string {
  return join(app.getPath("userData"), "import-interface-source.json");
}

async function readRememberedImportInterfaceFile(): Promise<string | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(getImportInterfaceSourcePath(), "utf-8")) as { path?: unknown };
    const path = typeof parsed.path === "string" ? parsed.path.trim() : "";
    if (!path) return null;
    const text = await fs.readFile(path, "utf-8");
    return parseSfdModuleInterfaces(text).length > 0 ? path : null;
  } catch {
    return null;
  }
}

async function rememberImportInterfaceFile(path: string): Promise<void> {
  await fs.writeFile(getImportInterfaceSourcePath(), JSON.stringify({ path }, null, 2), "utf-8");
}

/** 원본 주변 → 이전 선택 파일 → 최초 1회 선택 순으로 API 메타데이터 위치를 결정한다. */
async function resolveImportInterfaceSearchRoots(picked: string): Promise<string[]> {
  const stat = await fs.stat(picked);
  const originalRoot = stat.isDirectory() ? picked : dirname(picked);
  const nearbyDirs = await expandAncestorChainWithCareCommonCore(ancestorDirsScanOrderForInterfaces(originalRoot, 5));
  if ((await collectSfdInterfaceEntriesFromDirs(nearbyDirs)).length > 0) return [originalRoot];

  const remembered = await readRememberedImportInterfaceFile();
  if (remembered) return [originalRoot, dirname(remembered)];

  const result = await dialog.showOpenDialog({
    title: "API 이름과 설명이 있는 모듈 파일 선택 (선택 사항)",
    buttonLabel: "모듈 파일 사용",
    properties: ["openFile"],
    filters: [{ name: "JavaScript, TypeScript, JSON", extensions: ["js", "mjs", "cjs", "ts", "json"] }],
  });
  const selected = result.canceled ? "" : (result.filePaths[0]?.trim() ?? "");
  if (!selected) return [originalRoot];
  try {
    const text = await fs.readFile(selected, "utf-8");
    if (parseSfdModuleInterfaces(text).length === 0) return [originalRoot];
    await rememberImportInterfaceFile(selected);
    return [originalRoot, dirname(selected)];
  } catch {
    return [originalRoot];
  }
}

function clearExpiredImportSessions(): void {
  const cutoff = Date.now() - IMPORT_SESSION_TTL_MS;
  for (const [sessionId, session] of pendingImportSessions) {
    if (session.createdAt < cutoff) {
      pendingImportSessions.delete(sessionId);
      void fs.rm(session.plan.snapshotRoot, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function countResponseTypes(rows: ApiResponseRowDisk[]): { defaultCount: number; testCount: number; errorCount: number } {
  return rows.reduce(
    (counts, row) => {
      if (row.editorType === "error") counts.errorCount += 1;
      else if (row.editorType === "test") counts.testCount += 1;
      else counts.defaultCount += 1;
      return counts;
    },
    { defaultCount: 0, testCount: 0, errorCount: 0 },
  );
}

async function analyzeImportDirectory(
  sourceDir: string,
  projectNameOverride?: string,
): Promise<Omit<ImportAnalysis, "sessionId"> | { error: string }> {
  const manifestDir = await findProjectDirWithManifest(sourceDir);
  if (manifestDir) {
    const manifest = await readManifest(manifestDir);
    if (!manifest) return { error: "invalid-manifest" };
    const apis = await readApisIndex(manifestDir);
    const store = await readApiResponsesStore(manifestDir);
    const responses = Object.values(store.byApiName).flat();
    return {
      detectedFormat: "dataforge-project",
      projectName: manifest.name,
      apiCount: apis.length,
      responseCount: responses.length,
      ...countResponseTypes(responses),
      skippedFileCount: 0,
    };
  }

  const nestedPlan = await collectNestedFolderJsonImports(sourceDir);
  let entries: Dirent[];
  try {
    entries = await fs.readdir(sourceDir, { withFileTypes: true });
  } catch {
    return { error: "no-json-files" };
  }
  const rootJsonNames = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json") && entry.name.toLowerCase() !== "project.json")
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  const serverDumpFiles = nestedPlan.length === 0 ? detectServerDumpFiles(rootJsonNames) : null;
  const projectName = projectNameOverride?.trim() || basename(sourceDir).trim() || "imported-project";

  if (serverDumpFiles) {
    const grouped = new Map<string, ApiResponseRowDisk[]>();
    let skippedFileCount = 0;
    for (const fileName of rootJsonNames) {
      const meta = serverDumpFiles.get(fileName);
      if (!meta) {
        skippedFileCount += 1;
        continue;
      }
      try {
        JSON.parse(await fs.readFile(join(sourceDir, fileName), "utf-8"));
      } catch {
        skippedFileCount += 1;
        continue;
      }
      const value = `analysis-${meta.sourceId}-${fileName}`;
      const rows = grouped.get(meta.tran) ?? [];
      rows.push({
        id: value,
        value,
        label: meta.label,
        description: "",
        editorType: "default",
        configuration: "{}",
        source: { type: "server-dump", id: meta.sourceId, fileName },
        createdAt: "",
        updatedAt: "",
      });
      grouped.set(meta.tran, rows);
    }
    const responses = [...grouped.values()].flatMap(assignServerDumpResponseTypes);
    if (responses.length === 0) return { error: "no-json-files" };
    return {
      detectedFormat: "server-dump",
      projectName,
      apiCount: grouped.size,
      responseCount: responses.length,
      ...countResponseTypes(responses),
      skippedFileCount,
    };
  }

  const nestedResponseCount = nestedPlan.reduce((sum, item) => sum + item.fileNames.length, 0);
  const responseCount = nestedResponseCount + rootJsonNames.length;
  if (responseCount === 0) return { error: "no-json-files" };
  return {
    detectedFormat: nestedPlan.length > 0 ? "grouped-json" : "plain-json",
    projectName,
    apiCount: nestedPlan.length > 0 ? nestedPlan.length + rootJsonNames.length : rootJsonNames.length,
    responseCount,
    defaultCount: nestedPlan.length > 0 ? nestedPlan.length + rootJsonNames.length : rootJsonNames.length,
    testCount: Math.max(0, responseCount - (nestedPlan.length + rootJsonNames.length)),
    errorCount: 0,
    skippedFileCount: 0,
  };
}

async function prepareImportPlan(picked: string, interfaceSearchRoots: string[]): Promise<ImportPlan | { error: string }> {
  const snapshotRoot = join(tmpdir(), `df-import-plan-${randomUUID()}`);
  try {
    await fs.mkdir(snapshotRoot, { recursive: true });

    let sourcePath: string;
    let projectNameOverride: string | undefined;
    if (picked.toLowerCase().endsWith(".zip")) {
      new AdmZip(picked).extractAllTo(snapshotRoot, true);
      sourcePath = snapshotRoot;
      projectNameOverride = basename(picked).replace(/\.zip$/i, "").trim() || undefined;
    } else {
      const stat = await fs.stat(picked);
      if (stat.isDirectory()) {
        sourcePath = join(snapshotRoot, "source");
        await fs.cp(picked, sourcePath, { recursive: true });
      } else if (stat.isFile() && picked.toLowerCase().endsWith(".json")) {
        if (basename(picked).toLowerCase() === "project.json") {
          sourcePath = join(snapshotRoot, "source");
          await fs.cp(dirname(picked), sourcePath, { recursive: true });
        } else {
          sourcePath = join(snapshotRoot, "source");
          await fs.mkdir(sourcePath, { recursive: true });
          await fs.copyFile(picked, join(sourcePath, basename(picked)));
          projectNameOverride = basename(picked).replace(/\.json$/i, "").trim() || undefined;
        }
      } else {
        await fs.rm(snapshotRoot, { recursive: true, force: true });
        return { error: "invalid-manifest" };
      }
    }

    let analysis: Omit<ImportAnalysis, "sessionId"> | { error: string };
    const sourceStat = await fs.stat(sourcePath);
    if (sourceStat.isDirectory()) {
      analysis = await analyzeImportDirectory(sourcePath, projectNameOverride);
    } else {
      const parsed = JSON.parse(await fs.readFile(sourcePath, "utf-8")) as unknown;
      const manifest = manifestFromJsonFilePayload(parsed);
      analysis = manifest
        ? {
            detectedFormat: "dataforge-project",
            projectName: manifest.name,
            apiCount: 0,
            responseCount: 0,
            defaultCount: 0,
            testCount: 0,
            errorCount: 0,
            skippedFileCount: 0,
          }
        : { error: "invalid-manifest" };
    }

    if ("error" in analysis) {
      await fs.rm(snapshotRoot, { recursive: true, force: true });
      return analysis;
    }
    return { sourcePath, interfaceSearchRoots, snapshotRoot, analysis };
  } catch {
    await fs.rm(snapshotRoot, { recursive: true, force: true }).catch(() => {});
    return { error: picked.toLowerCase().endsWith(".zip") ? "invalid-zip" : "invalid-manifest" };
  }
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
  ipcMain.removeHandler("project-fs:analyzeImport");
  ipcMain.removeHandler("project-fs:executeImport");
  ipcMain.removeHandler("project-fs:cancelImport");
  ipcMain.removeHandler("project-fs:migrateFromLegacy");
  ipcMain.removeHandler("project-fs:getRootPath");
  ipcMain.removeHandler("project-fs:importApisJsonPick");
  ipcMain.removeHandler("project-fs:delete");
  ipcMain.removeHandler("project-fs:listApis");
  ipcMain.removeHandler("project-fs:addApi");
  ipcMain.removeHandler("project-fs:updateApi");
  ipcMain.removeHandler("project-fs:syncApisFromSfdModule");
  ipcMain.removeHandler("project-fs:pickInterfaceDefinition");
  ipcMain.removeHandler("project-fs:deleteApi");
  ipcMain.removeHandler("project-fs:getResponsesStore");
  ipcMain.removeHandler("project-fs:upsertApiResponse");
  ipcMain.removeHandler("project-fs:deleteApiResponse");
  ipcMain.removeHandler("project-fs:getAppProxyConfig");
  ipcMain.removeHandler("project-fs:setAppProxyConfig");
  ipcMain.removeHandler("project-fs:pickServerDirectory");
  ipcMain.removeHandler("project-fs:detectServerCommand");
  ipcMain.removeHandler("project-fs:prepareProxyTakeover");
  ipcMain.removeHandler("project-fs:restoreProxyTakeover");
  ipcMain.removeHandler("project-fs:restoreActiveProxyTakeover");
  ipcMain.removeHandler("project-fs:setLinkedClients");

  ipcMain.handle("project-fs:getAppProxyConfig", async (): Promise<AppProxyConfig> => readAppProxyConfigDisk());

  ipcMain.handle("project-fs:pickServerDirectory", async () => {
    const result = await dialog.showOpenDialog({ title: "서버 프로젝트 폴더 선택", properties: ["openDirectory"] });
    return result.canceled || !result.filePaths[0] ? { ok: false as const, error: "cancelled" } : { ok: true as const, path: result.filePaths[0] };
  });

  ipcMain.handle("project-fs:pickInterfaceDefinition", async (_event, payload: unknown) => {
    const value = payload && typeof payload === "object" ? payload as { folderName?: unknown; forcePick?: unknown } : {};
    const folderName = typeof value.folderName === "string" ? value.folderName.trim() : "";
    if (!folderName || !isSafeProjectFolderName(folderName)) return { ok: false as const, error: "invalid-folder" };
    const projectRoot = join(getProjectsRoot(), folderName);
    const manifest = await readManifest(projectRoot);
    if (!manifest) return { ok: false as const, error: "not-found" };

    if (value.forcePick !== true && manifest.apiMetadataSources?.length) {
      const valid: string[] = [];
      for (const path of manifest.apiMetadataSources) {
        try {
          const text = await fs.readFile(path, "utf-8");
          if (parseSfdModuleInterfaces(text).length > 0) valid.push(path);
        } catch { /* moved or deleted */ }
      }
      if (valid.length > 0) return { ok: true as const, paths: valid, remembered: true as const };
    }

    const result = await dialog.showOpenDialog({
      title: "API 이름과 설명이 있는 파일 선택",
      buttonLabel: "선택한 파일로 분석",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "JavaScript, TypeScript, JSON", extensions: ["js", "mjs", "cjs", "ts", "json"] }],
    });
    const selected = result.canceled ? [] : result.filePaths.map((path) => path.trim()).filter(Boolean);
    if (selected.length === 0) return { ok: false as const, error: "cancelled" };
    const valid: string[] = [];
    for (const path of selected) {
      try {
        const text = await fs.readFile(path, "utf-8");
        if (parseSfdModuleInterfaces(text).length > 0) valid.push(path);
      } catch { /* reported below when none are usable */ }
    }
    if (valid.length === 0) return { ok: false as const, error: "no-interface-data" };
    const nextManifest = { ...manifest, apiMetadataSources: valid, updatedAt: new Date().toISOString() };
    await fs.writeFile(join(projectRoot, "project.json"), JSON.stringify(nextManifest, null, 2), "utf-8");
    return { ok: true as const, paths: valid, remembered: false as const };
  });

  ipcMain.handle("project-fs:detectServerCommand", async (_e, rawWorkdir: unknown) => {
    const workdir = typeof rawWorkdir === "string" ? rawWorkdir.trim() : "";
    if (!workdir) return { ok: false as const, error: "invalid-directory" };
    return detectServerCommandInDirectory(workdir);
  });

  ipcMain.handle("project-fs:prepareProxyTakeover", async (_e, payload: unknown) => {
    const value = payload && typeof payload === "object"
      ? payload as { clientPort?: unknown; upstreamPort?: unknown; workdir?: unknown; command?: unknown; confirmed?: unknown }
      : {};
    const clientPort = typeof value.clientPort === "number" ? Math.floor(value.clientPort) : 0;
    const upstreamPort = typeof value.upstreamPort === "number" ? Math.floor(value.upstreamPort) : 0;
    const workdir = typeof value.workdir === "string" ? value.workdir.trim() : "";
    const command = typeof value.command === "string" ? value.command.trim() : "";
    const confirmed = value.confirmed === true;
    if (clientPort < 1 || clientPort > 65535 || upstreamPort < 1 || upstreamPort > 65535 || !workdir || !command) return { ok: false as const, error: "invalid-input" };
    const { prepareProxyPortTakeover } = await import("./proxy-port-takeover");
    return prepareProxyPortTakeover(clientPort, upstreamPort, workdir, command, confirmed);
  });

  ipcMain.handle("project-fs:restoreProxyTakeover", async (_e, payload: unknown) => {
    const value = payload && typeof payload === "object"
      ? payload as { clientPort?: unknown; workdir?: unknown; command?: unknown }
      : {};
    const clientPort = typeof value.clientPort === "number" ? Math.floor(value.clientPort) : 0;
    const workdir = typeof value.workdir === "string" ? value.workdir.trim() : "";
    const command = typeof value.command === "string" ? value.command.trim() : "";
    if (clientPort < 1 || clientPort > 65535 || !workdir || !command) return { ok: false as const, error: "invalid-input" };
    const { restoreServerAfterFailedTakeover } = await import("./proxy-port-takeover");
    return restoreServerAfterFailedTakeover(clientPort, workdir, command);
  });

  ipcMain.handle("project-fs:restoreActiveProxyTakeover", async () => {
    const { restoreActiveProxyTakeover } = await import("./proxy-port-takeover");
    return restoreActiveProxyTakeover();
  });

  ipcMain.handle("project-fs:setAppProxyConfig", async (_e, partial: unknown): Promise<
    | { ok: true; config: AppProxyConfig }
    | { ok: false; error: string }
  > => {
    try {
      const next = await mergeAppProxyConfigDisk(partial);
      const { applyMockProxyFromConfig } = await import("./mock-proxy-server");
      await applyMockProxyFromConfig();
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

  const importPickedSource = async (picked: string, interfaceSearchRoots: string[] = []) => {
    await ensureProjectsRoot();
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
            interfaceSearchRoots,
          });
          await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
          cleanupTmp = null;
          if (loose.ok) return { ok: true as const, project: loose.project, summary: loose.summary };
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
            interfaceSearchRoots,
          });
          if (loose.ok) {
            if (cleanupTmp) await fs.rm(cleanupTmp, { recursive: true, force: true }).catch(() => {});
            return { ok: true as const, project: loose.project, summary: loose.summary };
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
    const importedName = await uniqueProjectDisplayName(root, incoming.name);

    const folderName = await uniqueFolderName(root, slugify(incoming.folderName || incoming.name));
    const dest = join(root, folderName);
    await fs.cp(srcDir, dest, { recursive: true });

    const now = new Date().toISOString();
    const imported: ProjectManifest = {
      ...incoming,
      id: randomUUID(),
      name: importedName,
      folderName,
      updatedAt: now,
    };
    await fs.writeFile(join(dest, "project.json"), JSON.stringify(imported, null, 2), "utf-8");
    await enrichProjectApisFromNearbyInterfaceFiles(dest);

    if (cleanupTmp) await fs.rm(cleanupTmp, { recursive: true, force: true }).catch(() => {});

    return { ok: true as const, project: imported };
  };

  ipcMain.handle("project-fs:analyzeImport", async () => {
    clearExpiredImportSessions();
    const picked = await pickImportSourcePath();
    if (!picked) return { ok: false as const, error: "cancelled" };
    const interfaceSearchRoots = await resolveImportInterfaceSearchRoots(picked);
    const plan = await prepareImportPlan(picked, interfaceSearchRoots);
    if ("error" in plan) return { ok: false as const, error: plan.error };
    const sessionId = randomUUID();
    pendingImportSessions.set(sessionId, { plan, createdAt: Date.now() });
    return { ok: true as const, analysis: { sessionId, ...plan.analysis } satisfies ImportAnalysis };
  });

  ipcMain.handle("project-fs:executeImport", async (_e, sessionId: unknown) => {
    clearExpiredImportSessions();
    const id = typeof sessionId === "string" ? sessionId.trim() : "";
    const session = id ? pendingImportSessions.get(id) : undefined;
    if (!session) return { ok: false as const, error: "import-session-not-found" };
    pendingImportSessions.delete(id);
    try {
      const result = await importPickedSource(session.plan.sourcePath, session.plan.interfaceSearchRoots);
      if (result.ok && !("summary" in result)) return { ...result, summary: session.plan.analysis };
      return result;
    } finally {
      await fs.rm(session.plan.snapshotRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  ipcMain.handle("project-fs:cancelImport", async (_e, sessionId: unknown) => {
    const id = typeof sessionId === "string" ? sessionId.trim() : "";
    const session = id ? pendingImportSessions.get(id) : undefined;
    if (id) pendingImportSessions.delete(id);
    if (session) await fs.rm(session.plan.snapshotRoot, { recursive: true, force: true }).catch(() => {});
    return { ok: true as const };
  });

  /** 기존 UI 호환: 분석 확인 단계가 연결되기 전까지 선택 후 즉시 가져오기 */
  ipcMain.handle("project-fs:import", async () => {
    const picked = await pickImportSourcePath();
    if (!picked) return { ok: false as const, error: "cancelled" };
    return importPickedSource(picked);
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

      const sourcePaths = (Array.isArray(sfdPath) ? sfdPath : [sfdPath])
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean);
      if (sourcePaths.length === 0) return { ok: false as const, error: "empty-path" };

      const root = getProjectsRoot();
      const projectRoot = join(root, fname);
      const manifest = await readManifest(projectRoot);
      if (!manifest) return { ok: false as const, error: "not-found" };

      const sourceTexts: string[] = [];
      for (const path of sourcePaths) {
        try {
          sourceTexts.push(await fs.readFile(path, "utf-8"));
        } catch {
          return { ok: false as const, error: `read-failed: ${path}` };
        }
      }
      const text = sourceTexts.join("\n");

      const careLookup = buildCareTranLookup(parseSfdModuleInterfaces(text));
      const items = await readApisIndex(projectRoot);
      const store = await readApiResponsesStore(projectRoot);
      const nest = { ...store.byApiName };
      const now = new Date().toISOString();
      let updated = 0;
      const skipped: string[] = [];
      const renamed = new Map<string, string>();

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
            nest[newName] = labelSingleDefaultResponse([...moved, ...(nest[newName] ?? [])], newDesc);
          }
          delete nest[oldName];
          renamed.set(oldName, newName);
        } else if (Object.prototype.hasOwnProperty.call(nest, newName)) {
          nest[newName] = labelSingleDefaultResponse(nest[newName] ?? [], newDesc);
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
        if (renamed.size > 0) {
          const config = await readAppProxyConfigDisk();
          const active = { ...(config.mockActiveApiResponses ?? {}) };
          for (const [oldName, newName] of renamed) {
            if (active[oldName] && !active[newName]) active[newName] = active[oldName];
            delete active[oldName];
          }
          await mergeAppProxyConfigDisk({ mockActiveApiResponses: active });
        }
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
    const queryParams = coerceResponseQueryParams(pl.queryParams);
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
          queryParams,
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
          queryParams,
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
        queryParams,
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

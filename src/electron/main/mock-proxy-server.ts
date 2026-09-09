import http from "node:http";
import net from "node:net";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { ipcMain } from "electron";
import type { AppProxyConfig, MockActiveApiResponseRef, MockProfileType } from "@/types";

import { applyCareMockSpawnFromConfig, getCareMockSpawnStatus, stopCareMockSpawn, type CareMockSpawnStatus } from "./care-mock-spawn";
import { getUpstreamSpawnStatus, type UpstreamSpawnStatus } from "./upstream-spawn";
import {
  applyInterceptGatewayFromConfig,
  clearRecentProxyRequests,
  getInterceptGatewayStatus,
  getRecentProxyRequests,
  type InterceptGatewayStatus,
} from "./intercept-gateway";
import { tryParseApiResponseExportBundle } from "@/libs/datadummy/api";
import { hasActiveProxyTakeover } from "./proxy-port-takeover";
import {
  isInterceptGatewayMockPortCollision,
  isInterceptGatewayMockUpstreamCollision,
  listDiskProjectRootPaths,
  readApisIndex,
  readAppProxyConfigDisk,
  readManifest,
  readResponsesStoreFromDisk,
  type ProjectManifest,
} from "./project-fs";

type StoreRow = {
  value?: string;
  label?: string;
  configuration: string;
  editorType: string;
  queryParams?: Record<string, string>;
};

let activeServer: http.Server | null = null;
let activePort: number | null = null;
let lastError: string | undefined;
let applyQueue: Promise<void> = Promise.resolve();

export function getMockProxyStatus(): {
  listening: boolean;
  port: number | null;
  lastError?: string;
  interceptGateway: InterceptGatewayStatus;
  upstreamSpawn: UpstreamSpawnStatus;
  careMockSpawn: CareMockSpawnStatus;
} {
  return {
    listening: Boolean(activeServer?.listening),
    port: activePort,
    interceptGateway: getInterceptGatewayStatus(),
    upstreamSpawn: getUpstreamSpawnStatus(),
    careMockSpawn: getCareMockSpawnStatus(),
    ...(lastError ? { lastError } : {}),
  };
}

export function registerMockProxyIpc(): void {
  ipcMain.removeHandler("mock-proxy:status");
  ipcMain.removeHandler("mock-proxy:diagnostics");
  ipcMain.removeHandler("mock-proxy:recentRequests");
  ipcMain.removeHandler("mock-proxy:clearRecentRequests");
  ipcMain.handle("mock-proxy:status", () => getMockProxyStatus());
  ipcMain.handle("mock-proxy:diagnostics", () => getMockProxyDiagnostics());
  ipcMain.handle("mock-proxy:recentRequests", () => getRecentProxyRequests());
  ipcMain.handle("mock-proxy:clearRecentRequests", async () => {
    await clearRecentProxyRequests();
    return { ok: true };
  });
}

export type ProxyDiagnosticState = "healthy" | "checking" | "error" | "inactive";
export type ProxyDiagnosticStep = {
  state: ProxyDiagnosticState;
  title: string;
  detail: string;
  port?: number;
  solution?: string;
};

function canConnectTcp(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (connected: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };
    socket.setTimeout(700);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export async function getMockProxyDiagnostics(): Promise<{
  overall: ProxyDiagnosticState;
  summary: string;
  steps: {
    requestConnection: ProxyDiagnosticStep;
    dummyServer: ProxyDiagnosticStep;
    projectServer: ProxyDiagnosticStep;
    autoRestore: ProxyDiagnosticStep;
  };
}> {
  const config = await readAppProxyConfigDisk();
  const status = getMockProxyStatus();
  const gateway = config.interceptGateway;
  const enabled = Boolean(gateway?.enabled && config.proxyServer.enabled);
  const upstreamPort = gateway?.upstreamPort ?? config.proxyServer.upstreamServerPort ?? 7778;
  const upstreamReachable = enabled ? await canConnectTcp(upstreamPort) : false;
  const upstreamError = status.upstreamSpawn.lastError || status.careMockSpawn.lastError;
  const upstreamManaged = Boolean(gateway?.autoStartUpstream || config.proxyServer.upstreamAutoStart);
  const upstreamProcessRunning = status.upstreamSpawn.running || status.careMockSpawn.running;

  const requestConnection: ProxyDiagnosticStep = !enabled
    ? { state: "inactive", title: "프로젝트 요청", detail: "아직 연결을 시작하지 않았습니다.", port: gateway?.clientPort }
    : status.interceptGateway.listening
      ? { state: "healthy", title: "프로젝트 요청", detail: "프로젝트 요청을 DataForge가 받고 있습니다.", port: status.interceptGateway.port ?? gateway?.clientPort }
      : { state: "error", title: "프로젝트 요청", detail: "현재 서버 포트에서 요청을 받을 수 없습니다.", port: gateway?.clientPort, solution: "해당 포트를 사용하는 프로그램을 확인한 뒤 다시 연결해 주세요." };
  const dummyServer: ProxyDiagnosticStep = !enabled
    ? { state: "inactive", title: "더미 응답", detail: "연결을 시작하면 자동으로 준비됩니다.", port: config.proxyServer.port }
    : status.listening
      ? { state: "healthy", title: "더미 응답", detail: "저장된 응답을 사용할 준비가 됐습니다.", port: status.port ?? config.proxyServer.port }
      : { state: "error", title: "더미 응답", detail: "DataForge 내부 서버를 시작하지 못했습니다.", port: config.proxyServer.port, solution: "추가 설정에서 DataForge 내부 포트를 변경해 보세요." };
  const projectServer: ProxyDiagnosticStep = !enabled
    ? { state: "inactive", title: "프로젝트 서버", detail: "연결을 시작하면 서버 상태를 확인합니다.", port: upstreamPort }
    : upstreamReachable
      ? { state: "healthy", title: "프로젝트 서버", detail: "더미가 없는 요청을 실제 서버로 전달할 수 있습니다.", port: upstreamPort }
    : upstreamManaged && upstreamError
        ? { state: "error", title: "프로젝트 서버", detail: "프로젝트 서버를 실행하지 못했습니다.", port: upstreamPort, solution: upstreamError }
        : upstreamManaged && upstreamProcessRunning
          ? { state: "checking", title: "프로젝트 서버", detail: "서버가 응답할 때까지 확인하고 있습니다.", port: upstreamPort, solution: "계속 연결되지 않으면 서버 코드 폴더와 실행 방법을 확인해 주세요." }
          : upstreamManaged
            ? { state: "error", title: "프로젝트 서버", detail: "서버 이동 포트에 연결할 수 없습니다.", port: upstreamPort, solution: "서버 코드 폴더와 감지된 실행 방법을 확인해 주세요." }
            : { state: "inactive", title: "프로젝트 서버", detail: "실제 서버는 연결되지 않았습니다. 저장된 더미 응답만 사용할 수 있습니다.", port: upstreamPort, solution: `실제 서버 응답도 필요하면 프로젝트 서버를 ${upstreamPort} 포트로 실행해 주세요.` };
  const autoRestore: ProxyDiagnosticStep = hasActiveProxyTakeover()
    ? { state: "healthy", title: "원래 서버 복구", detail: "연결을 끊거나 앱을 종료하면 원래 포트로 복구합니다.", port: gateway?.clientPort }
    : { state: "inactive", title: "원래 서버 복구", detail: "DataForge가 종료한 기존 서버가 없습니다.", port: gateway?.clientPort };

  const required = upstreamManaged ? [requestConnection, dummyServer, projectServer] : [requestConnection, dummyServer];
  const overall: ProxyDiagnosticState = required.some((step) => step.state === "error")
    ? "error"
    : required.some((step) => step.state === "checking")
      ? "checking"
      : required.every((step) => step.state === "healthy")
        ? "healthy"
        : "inactive";
  const summary = overall === "healthy"
    ? upstreamReachable
      ? "저장된 응답이 있으면 더미를 사용하고, 없으면 프로젝트 서버로 전달합니다."
      : "저장된 더미 응답만 사용할 수 있습니다. 저장되지 않은 요청은 실제 서버로 전달할 수 없습니다."
    : overall === "checking"
      ? "프로젝트 서버 연결을 확인하고 있습니다."
      : overall === "error"
        ? "연결에 확인이 필요한 항목이 있습니다."
        : "더미 응답이 아직 연결되지 않았습니다.";
  return { overall, summary, steps: { requestConnection, dummyServer, projectServer, autoRestore } };
}

export async function stopMockProxyServer(): Promise<void> {
  stopCareMockSpawn();
  const s = activeServer;
  activeServer = null;
  activePort = null;
  if (!s) return;
  await new Promise<void>((resolve) => {
    s.close(() => resolve());
  });
}

/** 모든 프로젝트의 linkedClients 허용 출처를 합집합으로 적용 */
function buildMergedCorsHeaders(manifests: ProjectManifest[], req: http.IncomingMessage): Record<string, string> {
  const allowed = new Set<string>();
  for (const m of manifests) {
    for (const c of m.linkedClients ?? []) {
      for (const o of c.allowedOrigins) {
        if (o) allowed.add(o);
      }
    }
  }
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const base: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-DIRECT-CLIENT-ID",
  };
  if (allowed.size === 0 || !origin) {
    base["Access-Control-Allow-Origin"] = "*";
  } else if (allowed.has(origin)) {
    base["Access-Control-Allow-Origin"] = origin;
  }
  return base;
}

function parseMockApiPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  if (segments[0] !== "mock" && segments[0] !== "api") return null;
  try {
    return decodeURIComponent(segments.slice(1).join("/"));
  } catch {
    return null;
  }
}

function tranIdFromPath(pathname: string): string | null {
  const m = pathname.match(/\/([A-Za-z0-9_.-]+)\.do\/?$/i);
  if (!m?.[1]) return null;
  return m[1].trim() || null;
}

function looksLikeCareFormUrlEncoded(rawBody: string, contentType: string): boolean {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("application/json")) return false;
  const s = rawBody.trimStart();
  return s.startsWith("header=") && /(^|&)body=/.test(rawBody);
}

/** Care `POST /api` 본문(header JSON)에서 tranId 추출 */
function tranIdFromGatewayBody(rawBody: string, contentType: string): string | null {
  const ct = (contentType || "").toLowerCase();
  try {
    if (ct.includes("application/x-www-form-urlencoded") || looksLikeCareFormUrlEncoded(rawBody, contentType)) {
      const params = new URLSearchParams(rawBody);
      const h = params.get("header");
      if (h) {
        const header = JSON.parse(h) as { tranId?: string };
        const t = header?.tranId != null ? String(header.tranId).trim() : "";
        return t || null;
      }
    } else if (ct.includes("application/json")) {
      const j = JSON.parse(rawBody) as { header?: string | { tranId?: string } };
      if (j && typeof j === "object") {
        const hdr = typeof j.header === "string" ? (JSON.parse(j.header) as { tranId?: string }) : j.header;
        const t = hdr?.tranId != null ? String(hdr.tranId).trim() : "";
        return t || null;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function mergeTranId(pathname: string, rawBody: string, contentType: string): string | null {
  return tranIdFromPath(pathname) ?? tranIdFromGatewayBody(rawBody, contentType);
}

const MAX_MOCK_LATENCY_MS = 300_000;

function pickMockLatencyMs(map: Record<string, number>, key: string): number | null {
  const ks = key.trim();
  if (!ks) return null;
  const v = map[ks];
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(MAX_MOCK_LATENCY_MS, Math.floor(v)));
}

/** API 상세에 저장한 지연(ms) — 요청 lookup 키·tran·API 이름·별칭 모두 시도 */
async function resolveMockLatencyMs(cfg: AppProxyConfig, lookupKey: string, projectRoots: string[]): Promise<number> {
  const map = cfg.mockApiLatencyMs ?? {};
  const direct = pickMockLatencyMs(map, lookupKey);
  if (direct != null && direct > 0) return direct;

  const keysToTry = new Set<string>();
  const pathVariants = expandMockPathKeys(lookupKey, cfg.mockTranAliases);
  for (const pv of pathVariants) keysToTry.add(pv);

  for (const pv of pathVariants) {
    const norm = normalizeMockLookupKey(pv);
    for (const root of projectRoots) {
      const items = await readApisIndex(root);
      for (const row of items) {
        const t = row.tran.trim();
        const n = row.name.trim();
        if (!n && !t) continue;
        if (t === pv || n === pv || normalizeMockLookupKey(t) === norm || normalizeMockLookupKey(n) === norm) {
          if (n) keysToTry.add(n);
          if (t) keysToTry.add(t);
        }
      }
    }
  }

  for (const k of keysToTry) {
    if (k === lookupKey) continue;
    const v = pickMockLatencyMs(map, k);
    if (v != null && v > 0) return v;
  }

  const aliases = cfg.mockTranAliases ?? {};
  const mappedName = aliases[lookupKey];
  if (mappedName) {
    const p = pickMockLatencyMs(map, mappedName);
    if (p != null && p > 0) return p;
  }
  for (const [tranKey, apiName] of Object.entries(aliases)) {
    if (apiName === lookupKey) {
      const q = pickMockLatencyMs(map, tranKey);
      if (q != null && q > 0) return q;
    }
  }
  return direct ?? 0;
}

function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldTryDirectCareMock(method: string, pathname: string): boolean {
  const m = method.toUpperCase();
  if (m !== "GET" && m !== "POST" && m !== "PUT" && m !== "PATCH") return false;
  if (pathname === "/api" || pathname.startsWith("/api/")) return true;
  return /^\/vd\/data\/[a-zA-Z0-9_.-]+\.do$/i.test(pathname);
}

function extractMockKeyFromGenericBody(rawBody: string, contentType: string): string | null {
  const ct = (contentType || "").toLowerCase();
  try {
    if (ct.includes("application/json")) {
      const j = JSON.parse(rawBody) as { mockKey?: unknown; key?: unknown; tranId?: unknown };
      const k = typeof j?.mockKey === "string" ? j.mockKey : typeof j?.key === "string" ? j.key : typeof j?.tranId === "string" ? j.tranId : "";
      return k.trim() || null;
    }
    if (ct.includes("application/x-www-form-urlencoded") || looksLikeCareFormUrlEncoded(rawBody, contentType)) {
      const params = new URLSearchParams(rawBody);
      const direct = params.get("mockKey") ?? params.get("key") ?? params.get("tranId");
      if (direct?.trim()) return direct.trim();
      const h = params.get("header");
      if (h) {
        const header = JSON.parse(h) as { tranId?: string };
        const t = header?.tranId != null ? String(header.tranId).trim() : "";
        return t || null;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function resolveMockLookupKey(args: {
  profile: MockProfileType;
  method: string;
  pathname: string;
  searchParams: URLSearchParams;
  rawBody: string;
  contentType: string;
  headers: http.IncomingHttpHeaders;
}): { lookupKey: string | null; envelopeTranId: string | null } {
  const { profile, method, pathname, searchParams, rawBody, contentType, headers } = args;
  if (profile === "legacy-tran-envelope") {
    const directTranId = shouldTryDirectCareMock(method, pathname) ? mergeTranId(pathname, rawBody, contentType) : null;
    const apiName = parseMockApiPath(pathname);
    return { lookupKey: (directTranId ?? apiName)?.trim() ?? null, envelopeTranId: directTranId };
  }

  const apiName = parseMockApiPath(pathname);
  if (apiName?.trim()) return { lookupKey: apiName.trim(), envelopeTranId: null };
  const headerKey = typeof headers["x-mock-key"] === "string" ? headers["x-mock-key"].trim() : "";
  if (headerKey) return { lookupKey: headerKey, envelopeTranId: null };
  const queryKey = searchParams.get("mockKey")?.trim() || searchParams.get("key")?.trim() || searchParams.get("tranId")?.trim() || "";
  if (queryKey) return { lookupKey: queryKey, envelopeTranId: null };
  const bodyKey = extractMockKeyFromGenericBody(rawBody, contentType);
  if (bodyKey) return { lookupKey: bodyKey, envelopeTranId: null };
  return { lookupKey: null, envelopeTranId: null };
}

function toEnvelopeBodyValue(data: unknown): unknown {
  if (data === null || data === undefined) return "";
  return data;
}

function wrapEnvelopeResponse(tranId: string, data: unknown): string {
  if (data != null && typeof data === "object" && !Array.isArray(data) && "responseMessage" in data) {
    const rm = data as { responseMessage?: { body?: unknown } };
    const innerBody = rm.responseMessage?.body;
    if (innerBody !== undefined && innerBody !== null && typeof innerBody === "object") {
      const fixed = {
        ...(data as Record<string, unknown>),
        responseMessage: {
          ...(rm.responseMessage as object),
          body: toEnvelopeBodyValue(innerBody),
        },
      };
      return JSON.stringify(fixed);
    }
    return JSON.stringify(data);
  }
  return JSON.stringify({
    responseMessage: {
      header: { tranId },
      body: toEnvelopeBodyValue(data),
    },
  });
}

function normalizeConfigurationForMock(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const bundle = tryParseApiResponseExportBundle(parsed);
    if (bundle) return bundle.configuration.trim() || null;
  } catch {
    /* plain JSON string */
  }
  return trimmed;
}

function queryConditionCount(row: StoreRow): number {
  if (!row.queryParams || typeof row.queryParams !== "object" || Array.isArray(row.queryParams)) return 0;
  return Object.entries(row.queryParams).filter(([key, value]) => key.trim() && typeof value === "string").length;
}

function rowMatchesQuery(row: StoreRow, searchParams: URLSearchParams): boolean {
  if (!row.queryParams || typeof row.queryParams !== "object" || Array.isArray(row.queryParams)) return false;
  const entries = Object.entries(row.queryParams).filter(([key, value]) => key.trim() && typeof value === "string");
  if (entries.length === 0) return false;
  return entries.every(([key, value]) => searchParams.getAll(key.trim()).includes(value));
}

type PickedConfiguration = { configuration: string; label?: string; value?: string; editorType: string; apiName?: string };

function pickConfiguration(
  rows: StoreRow[] | undefined,
  active: MockActiveApiResponseRef | null | undefined,
  searchParams: URLSearchParams,
): PickedConfiguration | null {
  if (!rows?.length) return null;

  const matched = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => rowMatchesQuery(row, searchParams))
    .sort((a, b) => queryConditionCount(b.row) - queryConditionCount(a.row) || a.index - b.index);
  for (const { row } of matched) {
    const configuration = normalizeConfigurationForMock(row.configuration);
    if (configuration) return { configuration, label: row.label, value: row.value, editorType: row.editorType };
  }

  // 조건부 응답은 조건이 맞지 않을 때 활성/기본 폴백 후보로 사용하지 않습니다.
  const fallbackRows = rows.filter((row) => queryConditionCount(row) === 0);
  if (fallbackRows.length === 0) return null;
  const responseValue = active?.responseValue?.trim();
  if (responseValue) {
    const byValue = fallbackRows.find((r) => (r.value ?? "").trim() === responseValue);
    const fromValue = byValue ? normalizeConfigurationForMock(byValue.configuration) : null;
    if (fromValue && byValue) return { configuration: fromValue, label: byValue.label, value: byValue.value, editorType: byValue.editorType };
  }
  const def = fallbackRows.find((r) => r.editorType === "default");
  const fallback = def ?? fallbackRows[0];
  if (!fallback) return null;
  const configuration = normalizeConfigurationForMock(fallback.configuration);
  return configuration ? { configuration, label: fallback.label, value: fallback.value, editorType: fallback.editorType } : null;
}

/** tran·별칭으로 들어온 요청에 대해 API 이름에 저장된 활성 응답을 찾음 */
async function resolveActiveMockResponseRef(
  projectRoots: string[],
  pathKey: string,
  tranAliases: Record<string, string> | undefined,
  activeByApiName?: Record<string, MockActiveApiResponseRef>,
): Promise<MockActiveApiResponseRef | undefined> {
  if (!activeByApiName || Object.keys(activeByApiName).length === 0) return undefined;

  const trimmed = pathKey.trim();
  if (trimmed && activeByApiName[trimmed]) return activeByApiName[trimmed];

  const pathVariants = expandMockPathKeys(pathKey, tranAliases);
  for (const pv of pathVariants) {
    if (activeByApiName[pv]) return activeByApiName[pv];
  }

  for (const pv of pathVariants) {
    const norm = normalizeMockLookupKey(pv);
    for (const root of projectRoots) {
      const items = await readApisIndex(root);
      for (const row of items) {
        const t = row.tran.trim();
        const n = row.name.trim();
        if (!n && !t) continue;
        const matches = t === pv || n === pv || normalizeMockLookupKey(t) === norm || normalizeMockLookupKey(n) === norm;
        if (!matches) continue;
        if (n && activeByApiName[n]) return activeByApiName[n];
        if (t && activeByApiName[t]) return activeByApiName[t];
      }
    }
  }
  return undefined;
}

/** `tran`·스토어 키(`name`)·URL 조각 비교용 */
function normalizeMockLookupKey(s: string): string {
  return s
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/** 스토어·mobility 조회용: 요청 트랜 + 별칭으로 시도할 키 목록 */
function expandMockPathKeys(pathKey: string, tranAliases?: Record<string, string>): Set<string> {
  const trimmed = pathKey.trim();
  const pathVariants = new Set<string>();
  if (!trimmed) return pathVariants;

  pathVariants.add(trimmed);
  if (tranAliases && Object.keys(tranAliases).length > 0) {
    const direct = tranAliases[trimmed];
    if (direct?.trim()) pathVariants.add(direct.trim());
    const norm = normalizeMockLookupKey(trimmed);
    for (const [from, to] of Object.entries(tranAliases)) {
      if (!to.trim()) continue;
      if (from.trim() === trimmed || normalizeMockLookupKey(from) === norm) pathVariants.add(to.trim());
    }
  }

  const withDoStripped = new Set<string>();
  for (const pv of pathVariants) {
    withDoStripped.add(pv);
    if (pv.toLowerCase().endsWith(".do")) withDoStripped.add(pv.slice(0, -3).trim());
  }
  return withDoStripped;
}

/**
 * URL 경로 키(예: VD.MOVS0047, pblCoupon, VD.MOVS0047.do)에 맞는
 * `responses-store.json`의 `byApiName` 키를 찾아 설정 응답 JSON을 반환.
 * SFD 동기화 후 스토어 키가 영문키만 있어도, 트랜 ID로 호출되면 index에서 매핑한다.
 */
async function findRawConfigurationFromProjects(
  projectRoots: string[],
  pathKey: string,
  tranAliases?: Record<string, string>,
  activeByApiName?: Record<string, MockActiveApiResponseRef>,
  searchParams: URLSearchParams = new URLSearchParams(),
): Promise<PickedConfiguration | null> {
  const pathVariants = expandMockPathKeys(pathKey, tranAliases);
  if (pathVariants.size === 0) return null;

  const keysToTry = new Set<string>(pathVariants);
  const resolvedActive = await resolveActiveMockResponseRef(projectRoots, pathKey, tranAliases, activeByApiName);

  for (const pv of pathVariants) {
    const norm = normalizeMockLookupKey(pv);
    for (const root of projectRoots) {
      const items = await readApisIndex(root);
      for (const row of items) {
        const t = row.tran.trim();
        const n = row.name.trim();
        if (!n && !t) continue;
        if (
          t === pv ||
          n === pv ||
          normalizeMockLookupKey(t) === norm ||
          normalizeMockLookupKey(n) === norm
        ) {
          keysToTry.add(n);
          if (t) keysToTry.add(t);
        }
      }
    }
  }

  if (resolvedActive) {
    for (const k of keysToTry) {
      if (!k) continue;
      for (const projectRoot of projectRoots) {
        const store = await readResponsesStoreFromDisk(projectRoot);
        const rows = store.byApiName[k] as StoreRow[] | undefined;
        const picked = pickConfiguration(rows, resolvedActive, searchParams);
        if (picked != null) return { ...picked, apiName: k };
      }
    }
  }

  for (const k of keysToTry) {
    if (!k) continue;
    for (const projectRoot of projectRoots) {
      const store = await readResponsesStoreFromDisk(projectRoot);
      const rows = store.byApiName[k] as StoreRow[] | undefined;
      const picked = pickConfiguration(rows, undefined, searchParams);
      if (picked != null) return { ...picked, apiName: k };
    }
  }
  return null;
}

function expandUserConfigPath(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("~/")) return join(homedir(), t.slice(2));
  return t;
}

/** care dummy/mobility/{tran}.json 전용 — 경로 조작 방지 */
function isSafeMobilityBasename(name: string): boolean {
  if (!name || name.length > 160) return false;
  if (name.includes("..") || name.includes("/") || name.includes("\\")) return false;
  return /^[A-Za-z0-9._-]+$/.test(name);
}

function normalizeCareTranId(apiName: string): string {
  let t = apiName.trim();
  if (t.endsWith(".do")) t = t.slice(0, -3);
  return t;
}

async function readCareMobilityDummyRaw(mobilityDir: string | null | undefined, apiName: string): Promise<string | null> {
  const dir = mobilityDir?.trim();
  if (!dir) return null;
  const abs = expandUserConfigPath(dir);
  const tran = normalizeCareTranId(apiName);
  if (!isSafeMobilityBasename(tran)) return null;
  const fp = join(abs, `${tran}.json`);
  try {
    const stat = await fs.stat(fp);
    if (!stat.isFile()) return null;
    return await fs.readFile(fp, "utf-8");
  } catch {
    return null;
  }
}

async function loadManifestsForRoots(projectRoots: string[]): Promise<ProjectManifest[]> {
  const out: ProjectManifest[] = [];
  for (const pr of projectRoots) {
    const m = await readManifest(pr);
    if (m) out.push(m);
  }
  return out;
}

async function handleMockRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const projectRoots = await listDiskProjectRootPaths();
  const manifests = await loadManifestsForRoots(projectRoots);
  const cors = buildMergedCorsHeaders(manifests, req);

  const urlRaw = req.url ?? "/";
  let pathname = "/";
  let searchParams = new URLSearchParams();
  try {
    const u = new URL(urlRaw, "http://127.0.0.1");
    pathname = u.pathname;
    searchParams = u.searchParams;
  } catch {
    pathname = "/";
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  const method = req.method ?? "GET";
  const contentType = typeof req.headers["content-type"] === "string" ? req.headers["content-type"] : "";
  const rawBody =
    method === "GET" || method === "HEAD"
      ? ""
      : await new Promise<string>((resolve, reject) => {
          const chunks: Buffer[] = [];
          req.on("data", (c) => chunks.push(Buffer.from(c)));
          req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
          req.on("error", reject);
        });
  const methodOk = ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method);
  const diskCfg = await readAppProxyConfigDisk();
  const profile = diskCfg.mockProfile ?? "legacy-tran-envelope";
  const { lookupKey, envelopeTranId } = resolveMockLookupKey({
    profile,
    method,
    pathname,
    searchParams,
    rawBody,
    contentType,
    headers: req.headers,
  });
  if (!lookupKey || !methodOk) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...cors });
    res.end("not found");
    return;
  }

  const tranAliases = diskCfg.mockTranAliases;

  const pickedConfig = await findRawConfigurationFromProjects(
    projectRoots,
    lookupKey,
    tranAliases,
    diskCfg.mockActiveApiResponses,
    searchParams,
  );
  let rawConfig: string | null = pickedConfig?.configuration ?? null;

  if (rawConfig == null) {
    const mobilityPath = diskCfg.proxyServer.careDummyMobilityPath;
    for (const key of expandMockPathKeys(lookupKey, tranAliases)) {
      const fromCare = await readCareMobilityDummyRaw(mobilityPath, key);
      if (fromCare != null) {
        rawConfig = fromCare;
        break;
      }
    }
  }

  if (rawConfig == null) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...cors });
    res.end("no mock response for api");
    return;
  }

  let body: string;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawConfig) as unknown;
    body = JSON.stringify(parsed);
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", ...cors });
    res.end("invalid configuration json");
    return;
  }

  await sleepMs(await resolveMockLatencyMs(diskCfg, lookupKey, projectRoots));

  const selectionHeaders = pickedConfig
    ? {
        "X-DataForge-Response-Label": encodeURIComponent(pickedConfig.label || pickedConfig.editorType),
        "X-DataForge-Response-Value": encodeURIComponent(pickedConfig.value || ""),
        "X-DataForge-Api-Name": encodeURIComponent(pickedConfig.apiName || lookupKey),
        "X-DataForge-Editor-Type": pickedConfig.editorType,
      }
    : {
        "X-DataForge-Response-Label": "Default",
        "X-DataForge-Api-Name": encodeURIComponent(lookupKey),
        "X-DataForge-Editor-Type": "default",
      };

  if (profile === "legacy-tran-envelope" && envelopeTranId) {
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", ...cors, ...selectionHeaders });
    res.end(wrapEnvelopeResponse(envelopeTranId, parsed));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...cors, ...selectionHeaders });
  res.end(body);
}

async function applyMockProxyFromConfigNow(): Promise<void> {
  lastError = undefined;
  await stopMockProxyServer();
  const config = await readAppProxyConfigDisk();
  if (isInterceptGatewayMockPortCollision(config)) {
    lastError =
      "모의 서버 포트와 게이트웨이 수신(클라이언트 URL) 포트가 같습니다. 수신 포트에는 게이트웨이만, 모의 조회는 4780 등 다른 포트에 두세요.";
  } else if (config.interceptGateway?.enabled && config.proxyServer.enabled && isInterceptGatewayMockUpstreamCollision(config)) {
    lastError =
      "모의 서버 포트와 게이트웨이 업스트림 포트가 같습니다. 두 역할은 서로 다른 포트여야 합니다.";
  } else if (config.proxyServer.enabled) {
    const port = config.proxyServer.port;

    const server = http.createServer((req, res) => {
      void handleMockRequest(req, res).catch((err: unknown) => {
        lastError = err instanceof Error ? err.message : String(err);
        if (res.headersSent) {
          res.destroy();
          return;
        }
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("mock proxy request failed");
      });
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const onErr = (err: Error) => {
          server.off("error", onErr);
          reject(err);
        };
        server.once("error", onErr);
        server.listen({ port, host: "::", ipv6Only: false }, () => {
          server.off("error", onErr);
          resolve();
        });
      });
      activeServer = server;
      activePort = port;
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      lastError = e?.message ?? String(err);
      server.close();
    }
  }

  await applyInterceptGatewayFromConfig();
  await applyCareMockSpawnFromConfig(Boolean(activeServer?.listening));
}

/** 설정 저장이 연속으로 발생해도 서버 stop/listen 작업이 서로 겹치지 않도록 직렬화합니다. */
export function applyMockProxyFromConfig(): Promise<void> {
  const next = applyQueue.then(applyMockProxyFromConfigNow, applyMockProxyFromConfigNow);
  applyQueue = next.catch(() => {});
  return next;
}

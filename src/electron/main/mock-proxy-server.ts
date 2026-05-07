import http from "node:http";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { ipcMain } from "electron";
import type { AppProxyConfig, MockProfileType } from "@/types";

import { applyCareMockSpawnFromConfig, getCareMockSpawnStatus, stopCareMockSpawn, type CareMockSpawnStatus } from "./care-mock-spawn";
import { getUpstreamSpawnStatus, type UpstreamSpawnStatus } from "./upstream-spawn";
import {
  applyInterceptGatewayFromConfig,
  getInterceptGatewayStatus,
  type InterceptGatewayStatus,
} from "./intercept-gateway";
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

type StoreRow = { configuration: string; editorType: string };

let activeServer: http.Server | null = null;
let activePort: number | null = null;
let lastError: string | undefined;

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
  ipcMain.handle("mock-proxy:status", () => getMockProxyStatus());
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

/** API 상세에 저장한 지연(ms) — lookup 키·mockTranAliases 와 맞춤 */
function resolveMockLatencyMs(cfg: AppProxyConfig, lookupKey: string): number {
  const map = cfg.mockApiLatencyMs ?? {};
  const clamp = (n: number) => Math.max(0, Math.min(MAX_MOCK_LATENCY_MS, Math.floor(n)));
  const pick = (k: string): number | null => {
    const v = map[k];
    return typeof v === "number" && Number.isFinite(v) ? clamp(v) : null;
  };
  const direct = pick(lookupKey);
  if (direct != null) return direct;
  const aliases = cfg.mockTranAliases ?? {};
  const mappedName = aliases[lookupKey];
  if (mappedName) {
    const p = pick(mappedName);
    if (p != null) return p;
  }
  for (const [tranKey, apiName] of Object.entries(aliases)) {
    if (apiName === lookupKey) {
      const q = pick(tranKey);
      if (q != null) return q;
    }
  }
  return 0;
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

function pickConfiguration(rows: StoreRow[] | undefined): string | null {
  if (!rows?.length) return null;
  const def = rows.find((r) => r.editorType === "default");
  return (def ?? rows[0]).configuration;
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
): Promise<string | null> {
  const pathVariants = expandMockPathKeys(pathKey, tranAliases);
  if (pathVariants.size === 0) return null;

  const keysToTry = new Set<string>(pathVariants);

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
        }
      }
    }
  }

  for (const k of keysToTry) {
    if (!k) continue;
    for (const projectRoot of projectRoots) {
      const store = await readResponsesStoreFromDisk(projectRoot);
      const rows = store.byApiName[k] as StoreRow[] | undefined;
      const picked = pickConfiguration(rows);
      if (picked != null) return picked;
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

  let rawConfig: string | null = await findRawConfigurationFromProjects(projectRoots, lookupKey, tranAliases);

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

  await sleepMs(resolveMockLatencyMs(diskCfg, lookupKey));

  if (profile === "legacy-tran-envelope" && envelopeTranId) {
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", ...cors });
    res.end(wrapEnvelopeResponse(envelopeTranId, parsed));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...cors });
  res.end(body);
}

export async function applyMockProxyFromConfig(): Promise<void> {
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
      void handleMockRequest(req, res);
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

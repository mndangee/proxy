import http from "node:http";
import { request as httpRequest } from "node:http";
import { promises as fs } from "node:fs";
import { join } from "node:path";

import { app } from "electron";

import { applyUpstreamSpawnFromConfig, stopUpstreamSpawn } from "./upstream-spawn";
import {
  isInterceptGatewayClientEqualsUpstream,
  isInterceptGatewayMockPortCollision,
  isInterceptGatewayMockUpstreamCollision,
  readAppProxyConfigDisk,
} from "./project-fs";

let gatewayServer: http.Server | null = null;
let gatewayListenPort: number | null = null;
let gatewayLastError: string | undefined;

export type InterceptGatewayStatus = { listening: boolean; port: number | null; lastError?: string };
export type ProxyRequestRecord = {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  result: "mock" | "upstream" | "error";
  statusCode: number;
  durationMs: number;
  tranId?: string;
  responseLabel?: string;
  apiName?: string;
  responseValue?: string;
  editorType?: "default" | "test" | "error";
  error?: string;
};

const recentRequests: ProxyRequestRecord[] = [];
const RECENT_REQUEST_LIMIT = 100;
const RECENT_REQUEST_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
let requestSequence = 0;
let historyFilePath: string | null = null;
let historyWriteQueue: Promise<void> = Promise.resolve();

function isProxyRequestRecord(value: unknown): value is ProxyRequestRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<ProxyRequestRecord>;
  return typeof row.id === "string"
    && typeof row.timestamp === "string"
    && typeof row.method === "string"
    && typeof row.path === "string"
    && (row.result === "mock" || row.result === "upstream" || row.result === "error")
    && typeof row.statusCode === "number"
    && typeof row.durationMs === "number";
}

function pruneRecentRequests(requests: ProxyRequestRecord[], now = Date.now()): ProxyRequestRecord[] {
  const oldestAllowed = now - RECENT_REQUEST_RETENTION_MS;
  return requests
    .filter((request) => {
      const timestamp = new Date(request.timestamp).getTime();
      return Number.isFinite(timestamp) && timestamp >= oldestAllowed;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, RECENT_REQUEST_LIMIT);
}

function queueRecentRequestHistoryWrite(): void {
  if (!historyFilePath) return;
  const filePath = historyFilePath;
  const snapshot = JSON.stringify({ version: 1, requests: recentRequests }, null, 2);
  historyWriteQueue = historyWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const temporaryPath = `${filePath}.tmp`;
      await fs.writeFile(temporaryPath, snapshot, "utf8");
      await fs.rename(temporaryPath, filePath);
    })
    .catch((error: unknown) => {
      console.error("[recent-requests] failed to save request history:", error);
    });
}

export async function initializeProxyRequestHistory(): Promise<void> {
  historyFilePath = join(app.getPath("userData"), "recent-proxy-requests.json");
  try {
    const raw = await fs.readFile(historyFilePath, "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown; requests?: unknown };
    if (!Array.isArray(parsed.requests)) return;
    const valid = parsed.requests.filter(isProxyRequestRecord);
    const restored = pruneRecentRequests(valid);
    recentRequests.splice(0, recentRequests.length, ...restored);
    if (restored.length !== parsed.requests.length) queueRecentRequestHistoryWrite();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") console.error("[recent-requests] failed to load request history:", error);
  }
}

export async function flushProxyRequestHistory(): Promise<void> {
  await historyWriteQueue;
}

function isPostApiRequest(req: http.IncomingMessage): boolean {
  if ((req.method ?? "GET").toUpperCase() !== "POST") return false;
  try {
    return new URL(req.url ?? "/", "http://127.0.0.1").pathname === "/api";
  } catch {
    return (req.url ?? "/").split("?", 1)[0] === "/api";
  }
}

function recordRequest(
  req: http.IncomingMessage,
  startedAt: number,
  data: Omit<ProxyRequestRecord, "id" | "timestamp" | "method" | "path" | "durationMs">,
): void {
  if (!isPostApiRequest(req)) return;
  requestSequence += 1;
  recentRequests.unshift({
    id: `${Date.now()}-${requestSequence}`,
    timestamp: new Date().toISOString(),
    method: (req.method ?? "GET").toUpperCase(),
    path: req.url ?? "/",
    durationMs: Math.max(0, Date.now() - startedAt),
    ...data,
  });
  const pruned = pruneRecentRequests(recentRequests);
  recentRequests.splice(0, recentRequests.length, ...pruned);
  queueRecentRequestHistoryWrite();
}

export function getRecentProxyRequests(): ProxyRequestRecord[] {
  return recentRequests.slice(0, RECENT_REQUEST_LIMIT);
}

export async function clearRecentProxyRequests(): Promise<void> {
  recentRequests.splice(0, recentRequests.length);
  queueRecentRequestHistoryWrite();
  await flushProxyRequestHistory();
}

function tranIdFromValue(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const direct = typeof row.tranId === "string" ? row.tranId.trim() : "";
  if (direct) return direct;
  for (const key of ["header", "requestMessage", "request", "data"]) {
    let nested = row[key];
    if (typeof nested === "string") {
      try { nested = JSON.parse(nested) as unknown; } catch { continue; }
    }
    const found = tranIdFromValue(nested);
    if (found) return found;
  }
  return null;
}

function extractTranId(req: http.IncomingMessage, body: Buffer): string | undefined {
  const headerValue = req.headers["x-tran-id"] ?? req.headers["tranid"];
  const headerTranId = Array.isArray(headerValue) ? headerValue[0]?.trim() : headerValue?.trim();
  if (headerTranId) return headerTranId;
  const careHeaderValue = req.headers["header"];
  const careHeader = Array.isArray(careHeaderValue) ? careHeaderValue[0] : careHeaderValue;
  if (careHeader) {
    try {
      const found = tranIdFromValue(JSON.parse(careHeader) as unknown);
      if (found) return found;
    } catch {
      // 일반 HTTP 헤더라면 다른 위치도 계속 확인한다.
    }
  }
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const fromQuery = url.searchParams.get("tranId")?.trim();
    if (fromQuery) return fromQuery;
    const fromPath = /^\/vd\/data\/([^/]+?)\.do$/i.exec(url.pathname)?.[1]?.trim();
    if (fromPath) return fromPath;
  } catch {
    // 본문 확인을 계속한다.
  }
  const raw = body.toString("utf8").trim();
  if (!raw) return undefined;
  try {
    const found = tranIdFromValue(JSON.parse(raw) as unknown);
    if (found) return found;
  } catch {
    // form-urlencoded 형식도 확인한다.
  }
  try {
    const params = new URLSearchParams(raw);
    const direct = params.get("tranId")?.trim();
    if (direct) return direct;
    const header = params.get("header");
    if (header) return tranIdFromValue(JSON.parse(header) as unknown) ?? undefined;
  } catch {
    // 알 수 없는 본문 형식은 기록에서 생략한다.
  }
  const contentType = typeof req.headers["content-type"] === "string" ? req.headers["content-type"] : "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    const headerPart = /name=["']header["'][^\r\n]*\r?\n(?:[^\r\n]*\r?\n)*?\r?\n([^\r\n]+)/i.exec(raw)?.[1]?.trim();
    if (headerPart) {
      try {
        return tranIdFromValue(JSON.parse(headerPart) as unknown) ?? undefined;
      } catch {
        // 손상되거나 알 수 없는 multipart 값은 생략한다.
      }
    }
  }
  return undefined;
}

export function getInterceptGatewayStatus(): InterceptGatewayStatus {
  return {
    listening: Boolean(gatewayServer?.listening),
    port: gatewayListenPort,
    ...(gatewayLastError ? { lastError: gatewayLastError } : {}),
  };
}

export async function stopInterceptGatewayServer(): Promise<void> {
  const s = gatewayServer;
  gatewayServer = null;
  gatewayListenPort = null;
  stopUpstreamSpawn();
  if (!s) return;
  await new Promise<void>((resolve) => {
    s.close(() => resolve());
  });
}

type MockServerResponse = {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
};

/** 원 요청을 모의 서버에 그대로 전달해 mock profile별 키 추출과 응답 포맷을 한곳에서 처리합니다. */
function fetchMockResponse(
  clientReq: http.IncomingMessage,
  body: Buffer,
  mockPort: number,
): Promise<MockServerResponse | null> {
  const headers = { ...clientReq.headers } as Record<string, string | string[] | undefined>;
  headers.host = `127.0.0.1:${mockPort}`;
  return new Promise((resolve) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port: mockPort,
        path: clientReq.url ?? "/",
        method: clientReq.method,
        headers,
      },
      (pres) => {
        const chunks: Buffer[] = [];
        pres.on("data", (c) => chunks.push(Buffer.from(c)));
        pres.on("end", () => {
          resolve({
            statusCode: pres.statusCode ?? 502,
            headers: pres.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("error", () => resolve(null));
    if (body.length > 0) req.write(body);
    req.end();
  });
}

function shouldTryMock(method: string): boolean {
  const m = method.toUpperCase();
  return m === "GET" || m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

function forwardToUpstream(
  clientReq: http.IncomingMessage,
  clientRes: http.ServerResponse,
  body: Buffer,
  upstreamPort: number,
  startedAt: number,
  tranId?: string,
): void {
  const headers = { ...clientReq.headers } as Record<string, string | string[] | undefined>;
  headers.host = `127.0.0.1:${upstreamPort}`;
  // 업스트림이 dummy.server.js(7777)이고, 거기서 다시 DataForge(게이트웨이)로 프록시하도록 패치된 경우
  // 무한 루프를 막기 위해 "업스트림에서는 프록시하지 말라"는 힌트를 준다.
  headers["x-dataforge-bypass"] = "1";

  const p = httpRequest(
    {
      hostname: "127.0.0.1",
      port: upstreamPort,
      path: clientReq.url ?? "/",
      method: clientReq.method,
      headers,
    },
    (pres) => {
      recordRequest(clientReq, startedAt, { result: "upstream", statusCode: pres.statusCode ?? 502, ...(tranId ? { tranId } : {}) });
      clientRes.writeHead(pres.statusCode ?? 502, pres.headers);
      pres.pipe(clientRes);
    },
  );
  p.on("error", (err) => {
    recordRequest(clientReq, startedAt, { result: "error", statusCode: 502, error: err?.message ?? "프로젝트 서버에 연결할 수 없습니다.", ...(tranId ? { tranId } : {}) });
    clientRes.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    clientRes.end(err?.message ?? "upstream unreachable");
  });
  if (body.length > 0) p.write(body);
  p.end();
}

async function handleInterceptClient(
  clientReq: http.IncomingMessage,
  clientRes: http.ServerResponse,
  mockEnabled: boolean,
  mockPort: number,
  upstreamPort: number,
): Promise<void> {
  const startedAt = Date.now();
  const body =
    clientReq.method === "GET" || clientReq.method === "HEAD"
      ? Buffer.alloc(0)
      : await new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          clientReq.on("data", (c) => chunks.push(Buffer.from(c)));
          clientReq.on("end", () => resolve(Buffer.concat(chunks)));
          clientReq.on("error", reject);
        });
  const tranId = extractTranId(clientReq, body);

  const shouldAskMock = clientReq.method === "OPTIONS" || shouldTryMock(clientReq.method ?? "GET");
  if (mockEnabled && shouldAskMock) {
    const mock = await fetchMockResponse(clientReq, body, mockPort);
    // 404는 저장된 mock이 없다는 뜻이므로 업스트림으로 넘기고, 그 외 결과는 그대로 반환합니다.
    if (mock && mock.statusCode !== 404) {
      const responseLabelRaw = mock.headers["x-dataforge-response-label"];
      const encodedResponseLabel = Array.isArray(responseLabelRaw) ? responseLabelRaw[0] : responseLabelRaw;
      const responseValueRaw = mock.headers["x-dataforge-response-value"];
      const encodedResponseValue = Array.isArray(responseValueRaw) ? responseValueRaw[0] : responseValueRaw;
      const apiNameRaw = mock.headers["x-dataforge-api-name"];
      const encodedApiName = Array.isArray(apiNameRaw) ? apiNameRaw[0] : apiNameRaw;
      const editorTypeRaw = mock.headers["x-dataforge-editor-type"];
      const rawEditorType = Array.isArray(editorTypeRaw) ? editorTypeRaw[0] : editorTypeRaw;
      const editorType = rawEditorType === "test" || rawEditorType === "error" ? rawEditorType : "default";
      let responseLabel = encodedResponseLabel;
      let responseValue = encodedResponseValue;
      let apiName = encodedApiName;
      try {
        if (encodedResponseLabel) responseLabel = decodeURIComponent(encodedResponseLabel);
        if (encodedResponseValue) responseValue = decodeURIComponent(encodedResponseValue);
        if (encodedApiName) apiName = decodeURIComponent(encodedApiName);
      } catch {
        // 이전 버전 또는 외부 모의 서버가 보낸 일반 문자열은 그대로 표시한다.
      }
      const responseHeaders = { ...mock.headers };
      delete responseHeaders["x-dataforge-response-label"];
      delete responseHeaders["x-dataforge-response-value"];
      delete responseHeaders["x-dataforge-api-name"];
      delete responseHeaders["x-dataforge-editor-type"];
      recordRequest(clientReq, startedAt, {
        result: "mock",
        statusCode: mock.statusCode,
        ...(tranId ? { tranId } : {}),
        ...(responseLabel ? { responseLabel } : {}),
        ...(apiName ? { apiName } : {}),
        ...(responseValue ? { responseValue } : {}),
        editorType,
      });
      clientRes.writeHead(mock.statusCode, responseHeaders);
      clientRes.end(mock.body);
      return;
    }
  }

  forwardToUpstream(clientReq, clientRes, body, upstreamPort, startedAt, tranId);
}

export async function applyInterceptGatewayFromConfig(): Promise<void> {
  gatewayLastError = undefined;
  await stopInterceptGatewayServer();

  const config = await readAppProxyConfigDisk();
  const ig = config.interceptGateway;
  if (!ig?.enabled) return;

  if (isInterceptGatewayMockPortCollision(config)) {
    gatewayLastError =
      "모의 서버 포트와 게이트웨이 수신(클라이언트 URL) 포트가 같습니다. 모의 전용 포트는 4780 등 별도로 두세요.";
    return;
  }
  if (isInterceptGatewayClientEqualsUpstream(config)) {
    gatewayLastError =
      "클라이언트 URL 포트와 업스트림 포트가 같습니다. 외부 프로젝트가 정의한 «호출 URL 포트»와 «실제 API listen 포트」는 서로 달라야 합니다. 단일 포트만 쓰는 구조는 이 게이트웨이와 맞지 않습니다.";
    return;
  }
  if (isInterceptGatewayMockUpstreamCollision(config)) {
    gatewayLastError =
      "모의 서버 포트와 업스트림 포트가 같습니다. 게이트웨이 실패 시 넘길 백엔드와 DataForge 모의 조회 서버는 서로 다른 포트여야 합니다.";
    return;
  }

  const clientPort = Math.min(65535, Math.max(1, Math.floor(ig.clientPort)));
  const upstreamPort = Math.min(65535, Math.max(1, Math.floor(ig.upstreamPort)));
  const mockPort = config.proxyServer.port;
  const mockEnabled = Boolean(config.proxyServer.enabled);

  const server = http.createServer((req, res) => {
    void handleInterceptClient(req, res, mockEnabled, mockPort, upstreamPort).catch((err: unknown) => {
      gatewayLastError = err instanceof Error ? err.message : String(err);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("gateway request failed");
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onErr = (err: Error) => {
      server.off("error", onErr);
      reject(err);
    };
    server.once("error", onErr);
    server.listen({ port: clientPort, host: "::", ipv6Only: false }, () => {
      server.off("error", onErr);
      resolve();
    });
  })
    .then(() => {
      gatewayServer = server;
      gatewayListenPort = clientPort;
      void applyUpstreamSpawnFromConfig();
    })
    .catch((err: NodeJS.ErrnoException) => {
      if (err?.code === "EADDRINUSE") {
        gatewayLastError = `포트 ${clientPort}가 이미 사용 중입니다(EADDRINUSE). 게이트웨이는 클라이언트가 고정으로 호출하는 URL의 포트(${clientPort})에서 listen 해야 하므로, 그 포트를 쓰던 프로세스를 먼저 종료한 뒤 다시 시도하세요. 실제 API는 업스트림 포트 ${upstreamPort}에서만 떠 있어야 합니다.`;
      } else {
        gatewayLastError = err?.message ?? String(err);
      }
      server.close();
    });
}

/** @deprecated */
export const getCareGatewayStatus = getInterceptGatewayStatus;
export type CareGatewayStatus = InterceptGatewayStatus;
export async function stopCareGatewayServer(): Promise<void> {
  await stopInterceptGatewayServer();
}
export async function applyCareGatewayFromConfig(): Promise<void> {
  await applyInterceptGatewayFromConfig();
}

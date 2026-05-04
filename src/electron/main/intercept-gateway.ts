import http from "node:http";
import { request as httpRequest } from "node:http";

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

function tranIdFromPath(pathname: string): string | null {
  const m = pathname.match(/\/([A-Za-z0-9_.-]+)\.do\/?$/i);
  if (!m?.[1]) return null;
  return m[1].trim() || null;
}

/** Care `Sfd.server._callServerModule`: `header={...}&body=encodeURIComponent(JSON)` — Content-Type이 비어 있어도 흔함 */
function looksLikeCareFormUrlEncoded(rawBody: string, contentType: string): boolean {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("application/json")) return false;
  const s = rawBody.trimStart();
  return s.startsWith("header=") && /(^|&)body=/.test(rawBody);
}

/** x-www-form-urlencoded(JSON header) / JSON body — Care류·유사 API 공통 */
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

function toEnvelopeBodyValue(data: unknown): unknown {
  if (data === null || data === undefined) return "";
  return data;
}

/** 일부 레거시 클라이언트는 responseMessage.body를 JSON 문자열로 둠 */
function wrapEnvelopeResponse(tranID: string, data: unknown): string {
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
      header: { tranId: tranID },
      body: toEnvelopeBodyValue(data),
    },
  });
}

function fetchMockJson(tranId: string, mockPort: number): Promise<{ ok: true; json: unknown } | { ok: false }> {
  const path = `/mock/${encodeURIComponent(tranId)}`;
  return new Promise((resolve) => {
    const req = httpRequest(
      { hostname: "127.0.0.1", port: mockPort, path, method: "GET", headers: { Connection: "close" } },
      (pres) => {
        const chunks: Buffer[] = [];
        pres.on("data", (c) => chunks.push(Buffer.from(c)));
        pres.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (pres.statusCode !== 200) {
            resolve({ ok: false });
            return;
          }
          try {
            resolve({ ok: true, json: JSON.parse(text) as unknown });
          } catch {
            resolve({ ok: false });
          }
        });
      },
    );
    req.on("error", () => resolve({ ok: false }));
    req.end();
  });
}

function shouldTryMock(method: string, pathname: string): boolean {
  const m = method.toUpperCase();
  if (m !== "GET" && m !== "POST" && m !== "PUT" && m !== "PATCH") return false;
  if (pathname === "/api" || pathname.startsWith("/api/")) return true;
  return /^\/vd\/data\/[a-zA-Z0-9_.-]+\.do$/i.test(pathname);
}

function forwardToUpstream(
  clientReq: http.IncomingMessage,
  clientRes: http.ServerResponse,
  body: Buffer,
  upstreamPort: number,
): void {
  const headers = { ...clientReq.headers } as Record<string, string | string[] | undefined>;
  headers.host = `127.0.0.1:${upstreamPort}`;

  const p = httpRequest(
    {
      hostname: "127.0.0.1",
      port: upstreamPort,
      path: clientReq.url ?? "/",
      method: clientReq.method,
      headers,
    },
    (pres) => {
      clientRes.writeHead(pres.statusCode ?? 502, pres.headers);
      pres.pipe(clientRes);
    },
  );
  p.on("error", (err) => {
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
  const urlRaw = clientReq.url ?? "/";
  let pathname = "/";
  try {
    pathname = new URL(urlRaw, "http://127.0.0.1").pathname;
  } catch {
    pathname = "/";
  }

  const body =
    clientReq.method === "GET" || clientReq.method === "HEAD"
      ? Buffer.alloc(0)
      : await new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          clientReq.on("data", (c) => chunks.push(Buffer.from(c)));
          clientReq.on("end", () => resolve(Buffer.concat(chunks)));
          clientReq.on("error", reject);
        });

  const ct = typeof clientReq.headers["content-type"] === "string" ? clientReq.headers["content-type"] : "";

  if (mockEnabled && shouldTryMock(clientReq.method ?? "GET", pathname)) {
    const tranId = mergeTranId(pathname, body.toString("utf8"), ct);
    if (tranId) {
      const mock = await fetchMockJson(tranId, mockPort);
      if (mock.ok) {
        const payload = wrapEnvelopeResponse(tranId, mock.json);
        clientRes.writeHead(200, {
          "Content-Type": "application/javascript; charset=utf-8",
          "Access-Control-Allow-Origin": clientReq.headers.origin ?? "*",
          "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Cache-Control, X-DIRECT-CLIENT-ID",
          "Access-Control-Allow-Credentials": "true",
        });
        clientRes.end(payload);
        return;
      }
    }
  }

  forwardToUpstream(clientReq, clientRes, body, upstreamPort);
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
      "모의 서버 포트와 업스트림 포트가 같습니다. 가로채기 실패 시 넘길 백엔드와 DataForge 모의 조회 서버는 서로 다른 포트여야 합니다.";
    return;
  }

  const clientPort = Math.min(65535, Math.max(1, Math.floor(ig.clientPort)));
  const upstreamPort = Math.min(65535, Math.max(1, Math.floor(ig.upstreamPort)));
  const mockPort = config.proxyServer.port;
  const mockEnabled = Boolean(config.proxyServer.enabled);

  const server = http.createServer((req, res) => {
    void handleInterceptClient(req, res, mockEnabled, mockPort, upstreamPort);
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

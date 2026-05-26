import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { readAppProxyConfigDisk } from "./project-fs";
import { appendStderrTail, resetStderrTail, spawnExitDetailAndHint, type StderrTailRef } from "./spawn-exit-message";
import { expandConfigPath, resolveUpstreamNodeExecutable, shouldVerifyNodeExecutableExists } from "./upstream-node-bin";

let upstreamChild: ChildProcess | null = null;
let upstreamSpawnLastError: string | undefined;
let upstreamSpawnLastStdoutLine = "";
let upstreamSpawnLastStderrLine = "";
const upstreamSpawnStderrTail: StderrTailRef = { s: "" };

export type UpstreamSpawnStatus = { running: boolean; lastError?: string };

export function getUpstreamSpawnStatus(): UpstreamSpawnStatus {
  const running = upstreamChild != null && !upstreamChild.killed;
  return {
    running,
    ...(upstreamSpawnLastError ? { lastError: upstreamSpawnLastError } : {}),
  };
}

export function stopUpstreamSpawn(): void {
  upstreamSpawnLastError = undefined;
  upstreamSpawnLastStdoutLine = "";
  upstreamSpawnLastStderrLine = "";
  resetStderrTail(upstreamSpawnStderrTail);
  const c = upstreamChild;
  upstreamChild = null;
  if (!c || c.killed) return;
  try {
    c.kill("SIGTERM");
  } catch {
    /* ignore */
  }
}

/**
 * 업스트림이 `dummy.server.js -port` 패턴인 경우(care server 등).
 * `npm run` 전용 프로젝트는 해당 스크립트에서 upstream 포트를 맞추면 됨.
 */
export async function applyUpstreamSpawnFromConfig(): Promise<void> {
  upstreamSpawnLastError = undefined;
  upstreamSpawnLastStdoutLine = "";
  upstreamSpawnLastStderrLine = "";
  resetStderrTail(upstreamSpawnStderrTail);
  stopUpstreamSpawn();

  const config = await readAppProxyConfigDisk();
  const ig = config.interceptGateway;
  const ps = config.proxyServer;
  if (!ig?.enabled || !ig.autoStartUpstream) return;

  const dirRaw =
    ig.upstreamWorkdir?.trim() ||
    config.proxyServer.upstreamServerWorkdir?.trim() ||
    config.proxyServer.careDummyServerWorkdir?.trim() ||
    "";
  if (!dirRaw) {
    upstreamSpawnLastError =
      "업스트림 자동 실행: 작업 폴더가 비어 있습니다. 프록시 설정의 프로젝트 서버 폴더를 지정하거나 interceptGateway.upstreamWorkdir를 설정하세요.";
    return;
  }

  const dir = expandConfigPath(dirRaw);
  const serverJs = join(dir, "dummy.server.js");
  if (!existsSync(serverJs)) {
    upstreamSpawnLastError = `자동 실행은 이 폴더에 dummy.server.js 가 있을 때만 지원합니다: ${serverJs} (npm 전용 프로젝트는 터미널에서 upstream 포트로 실행)`;
    return;
  }

  const upstreamPort = Math.min(65535, Math.max(1, Math.floor(ig.upstreamPort)));

  const nodeBinRaw = (ps.upstreamNodePath ?? "").trim();
  const nodeBin = resolveUpstreamNodeExecutable(nodeBinRaw || null, dir);
  if (shouldVerifyNodeExecutableExists(nodeBinRaw) && !existsSync(nodeBin)) {
    upstreamSpawnLastError = `업스트림 자동 실행: Node 실행 파일을 찾을 수 없습니다: ${nodeBin}`;
    return;
  }

  const clientPort =
    ig && typeof ig.clientPort === "number" && Number.isFinite(ig.clientPort)
      ? Math.min(65535, Math.max(1, Math.floor(ig.clientPort)))
      : 7779;
  const injectDataforgeProxy = clientPort !== upstreamPort;

  const child = spawn(nodeBin, ["dummy.server.js", "-port", String(upstreamPort)], {
    cwd: dir,
    env: {
      ...process.env,
      ...(injectDataforgeProxy ? { DATAFORGE_GATEWAY_ENABLED: "1", DATAFORGE_GATEWAY_PORT: String(clientPort) } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  upstreamChild = child;

  child.stdout?.on("data", (buf) => {
    const line = buf.toString().trim();
    if (line) {
      const oneLine = line.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).at(-1);
      if (oneLine) upstreamSpawnLastStdoutLine = oneLine;
      console.info("[upstream-spawn]", line);
    }
  });

  child.stderr?.on("data", (buf) => {
    appendStderrTail(upstreamSpawnStderrTail, Buffer.from(buf));
    const line = buf.toString().trim();
    if (line) {
      const oneLine = line.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).at(-1);
      if (oneLine) upstreamSpawnLastStderrLine = oneLine;
      console.warn("[upstream-spawn]", line);
    }
  });

  child.on("error", (err) => {
    if (upstreamChild === child) {
      upstreamSpawnLastError = err?.message ?? String(err);
      upstreamChild = null;
    }
  });

  child.on("exit", (code, signal) => {
    if (upstreamChild !== child) return;
    upstreamChild = null;
    if (signal === "SIGTERM") return;
    if (code != null && code !== 0) {
      const { detail, hint } = spawnExitDetailAndHint(
        upstreamSpawnStderrTail.s,
        upstreamSpawnLastStderrLine,
        upstreamSpawnLastStdoutLine,
      );
      upstreamSpawnLastError = `업스트림 프로세스가 비정상 종료되었습니다 (code ${code}).${detail}${hint}`;
    }
  });
}

/** @deprecated */
export const getCareDummySpawnStatus = getUpstreamSpawnStatus;
export type CareDummySpawnStatus = UpstreamSpawnStatus;
export function stopCareDummySpawn(): void {
  stopUpstreamSpawn();
}
export async function applyCareDummySpawnFromConfig(): Promise<void> {
  await applyUpstreamSpawnFromConfig();
}

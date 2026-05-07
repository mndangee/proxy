import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { readAppProxyConfigDisk } from "./project-fs";
import {
  detectPreferredNodeBin,
  expandConfigPath,
  shouldVerifyNodeExecutableExists,
} from "./upstream-node-bin";

let careMockChild: ChildProcess | null = null;
let careMockSpawnLastError: string | undefined;
let careMockLastStderrLine = "";
let careMockLastStdoutLine = "";

export type CareMockSpawnStatus = { running: boolean; lastError?: string };

export function getCareMockSpawnStatus(): CareMockSpawnStatus {
  const running = careMockChild != null && !careMockChild.killed;
  return {
    running,
    ...(careMockSpawnLastError ? { lastError: careMockSpawnLastError } : {}),
  };
}

export function stopCareMockSpawn(): void {
  careMockSpawnLastError = undefined;
  careMockLastStderrLine = "";
  careMockLastStdoutLine = "";
  const c = careMockChild;
  careMockChild = null;
  if (!c || c.killed) return;
  try {
    c.kill("SIGTERM");
  } catch {
    /* ignore */
  }
}

/**
 * 모의 서버(proxyServer)가 실제로 listen 중일 때 업스트림 서버를 자동 실행합니다.
 * 게이트웨이의 `autoStartUpstream`이 켜져 있으면 동일 역할이므로 여기서는 실행하지 않습니다.
 */
export async function applyCareMockSpawnFromConfig(mockServerListening: boolean): Promise<void> {
  careMockSpawnLastError = undefined;
  careMockLastStderrLine = "";
  careMockLastStdoutLine = "";
  if (!mockServerListening) {
    stopCareMockSpawn();
    return;
  }
  stopCareMockSpawn();

  const config = await readAppProxyConfigDisk();
  const ps = config.proxyServer;
  const autoStart = typeof ps.upstreamAutoStart === "boolean" ? ps.upstreamAutoStart : Boolean(ps.careDummyAutoStart);
  if (!ps.enabled || !autoStart) return;

  const ig = config.interceptGateway;
  if (ig?.enabled && ig.autoStartUpstream) return;

  const dirRaw = (ps.upstreamServerWorkdir ?? ps.careDummyServerWorkdir ?? "").trim();
  if (!dirRaw) {
    careMockSpawnLastError = "업스트림 자동 실행: 작업 폴더(upstreamServerWorkdir)가 비어 있습니다.";
    return;
  }

  const dir = expandConfigPath(dirRaw);
  const nodeBinRaw = (ps.upstreamNodePath ?? "").trim();
  const nodeBin = nodeBinRaw ? expandConfigPath(nodeBinRaw) : detectPreferredNodeBin();
  if (shouldVerifyNodeExecutableExists(nodeBinRaw) && !existsSync(nodeBin)) {
    careMockSpawnLastError = `업스트림 자동 실행: Node 실행 파일을 찾을 수 없습니다: ${nodeBin}`;
    return;
  }
  let carePort =
    typeof ps.upstreamServerPort === "number" && Number.isFinite(ps.upstreamServerPort)
      ? Math.floor(ps.upstreamServerPort)
      : typeof ps.careDummyServerPort === "number" && Number.isFinite(ps.careDummyServerPort)
        ? Math.floor(ps.careDummyServerPort)
        : 7778;
  carePort = Math.min(65535, Math.max(1, carePort));

  if (carePort === ps.port) {
    careMockSpawnLastError = `업스트림 자동 실행 포트(${carePort})는 모의 서버 포트와 같을 수 없습니다.`;
    return;
  }
  if (ig?.enabled && carePort === ig.clientPort) {
    careMockSpawnLastError = `업스트림 자동 실행 포트(${carePort})는 게이트웨이 클라이언트 포트와 같을 수 없습니다.`;
    return;
  }
  const cmdRaw = (ps.upstreamServerCommand ?? "").trim();
  let child: ChildProcess;
  let execDesc = "";
  if (cmdRaw) {
    const cmd = cmdRaw.replace(/\{\{\s*port\s*\}\}/gi, String(carePort)).replace(/\{\{\s*node\s*\}\}/gi, nodeBin);
    if (process.platform === "win32") {
      const comSpec = process.env.ComSpec?.trim() || join(process.env.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
      child = spawn(comSpec, ["/d", "/s", "/c", cmd], {
        cwd: dir,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } else {
      child = spawn("sh", ["-lc", cmd], {
        cwd: dir,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    }
    execDesc = cmd;
  } else {
    const serverJs = join(dir, "dummy.server.js");
    if (!existsSync(serverJs)) {
      careMockSpawnLastError = `업스트림 자동 실행: 기본 엔트리(dummy.server.js)를 찾을 수 없습니다: ${serverJs}`;
      return;
    }
    const igClientPort =
      ig && typeof ig.clientPort === "number" && Number.isFinite(ig.clientPort) ? Math.min(65535, Math.max(1, Math.floor(ig.clientPort))) : 7779;
    const injectDataforgeProxy = Boolean(ig?.enabled) && igClientPort !== carePort;
    child = spawn(nodeBin, ["dummy.server.js", "-port", String(carePort)], {
      cwd: dir,
      env: {
        ...process.env,
        ...(injectDataforgeProxy
          ? { DATAFORGE_GATEWAY_ENABLED: "1", DATAFORGE_GATEWAY_PORT: String(igClientPort) }
          : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    execDesc = injectDataforgeProxy
      ? `DATAFORGE_GATEWAY_ENABLED=1 DATAFORGE_GATEWAY_PORT=${igClientPort} ${nodeBin} dummy.server.js -port ${carePort}`
      : `${nodeBin} dummy.server.js -port ${carePort}`;
  }

  careMockChild = child;

  child.stdout?.on("data", (buf) => {
    const line = buf.toString().trim();
    if (line) {
      const oneLine = line.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).at(-1);
      if (oneLine) careMockLastStdoutLine = oneLine;
      console.info("[upstream-auto-spawn]", line);
    }
  });

  child.stderr?.on("data", (buf) => {
    const line = buf.toString().trim();
    if (line) {
      const oneLine = line.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).at(-1);
      if (oneLine) careMockLastStderrLine = oneLine;
      console.warn("[upstream-auto-spawn]", line);
    }
  });

  child.on("error", (err) => {
    if (careMockChild === child) {
      careMockSpawnLastError = err?.message ?? String(err);
      careMockChild = null;
    }
  });

  child.on("exit", (code, signal) => {
    if (careMockChild !== child) return;
    careMockChild = null;
    if (signal === "SIGTERM") return;
    if (code != null && code !== 0) {
      const reason = careMockLastStderrLine || careMockLastStdoutLine;
      const detail = reason ? ` 원인: ${reason}` : "";
      careMockSpawnLastError = `업스트림 자동 실행 프로세스가 비정상 종료되었습니다 (code ${code}). 실행: ${execDesc} (cwd: ${dir}).${detail}`;
    }
  });
}

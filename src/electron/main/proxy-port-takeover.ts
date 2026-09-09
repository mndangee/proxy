import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { app } from "electron";

import { resolveUpstreamNodeExecutable } from "./upstream-node-bin";

const execFileAsync = promisify(execFile);

type ListenerInfo = { pid: number; command?: string; cwd?: string };
type ActiveTakeover = { port: number; upstreamPort: number; workdir: string; command: string; stoppedPids?: number[]; createdAt?: string };

let activeTakeover: ActiveTakeover | null = null;

function takeoverStatePath(): string { return resolve(app.getPath("userData"), "active-proxy-takeover.json"); }
async function saveTakeoverState(value: ActiveTakeover): Promise<void> {
  await fs.writeFile(takeoverStatePath(), JSON.stringify({ version: 1, ...value }, null, 2), "utf-8");
}
async function clearTakeoverState(): Promise<void> {
  activeTakeover = null;
  await fs.rm(takeoverStatePath(), { force: true }).catch(() => {});
}
async function readTakeoverState(): Promise<ActiveTakeover | null> {
  try {
    const raw = JSON.parse(await fs.readFile(takeoverStatePath(), "utf-8")) as Partial<ActiveTakeover>;
    if (!raw.port || !raw.upstreamPort || !raw.workdir?.trim() || !raw.command?.trim()) return null;
    return { port: raw.port, upstreamPort: raw.upstreamPort, workdir: raw.workdir, command: raw.command, stoppedPids: raw.stoppedPids, createdAt: raw.createdAt };
  } catch { return null; }
}

function quoteShellArgument(value: string): string {
  return process.platform === "win32" ? `"${value.replace(/"/g, '""')}"` : `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function hasActiveProxyTakeover(): boolean {
  return activeTakeover != null;
}

async function run(file: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(file, args, { windowsHide: true, timeout: 5_000 });
    return String(stdout ?? "");
  } catch {
    return "";
  }
}

async function listenerPids(port: number): Promise<number[]> {
  if (process.platform === "win32") {
    const output = await run("netstat", ["-ano", "-p", "tcp"]);
    const pids = output
      .split(/\r?\n/)
      .filter((line) => /\bLISTENING\b/i.test(line))
      .flatMap((line) => {
        const columns = line.trim().split(/\s+/);
        const localAddress = columns[1] ?? "";
        const pid = Number.parseInt(columns.at(-1) ?? "", 10);
        return localAddress.endsWith(`:${port}`) && Number.isInteger(pid) ? [pid] : [];
      });
    return [...new Set(pids)].filter((pid) => pid > 0 && pid !== process.pid);
  }

  const output = await run("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"]);
  return [...new Set(output.split(/\s+/).map((value) => Number.parseInt(value, 10)))]
    .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}

async function describeListener(pid: number): Promise<ListenerInfo> {
  if (process.platform === "win32") {
    const script = `Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object CommandLine,ExecutablePath | ConvertTo-Json -Compress`;
    const raw = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
    try {
      const value = JSON.parse(raw) as { CommandLine?: string; ExecutablePath?: string };
      return { pid, command: value.CommandLine || value.ExecutablePath };
    } catch {
      return { pid };
    }
  }

  const [command, cwdRaw] = await Promise.all([
    run("ps", ["-p", String(pid), "-o", "command="]),
    run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]),
  ]);
  const cwd = cwdRaw.split(/\r?\n/).find((line) => line.startsWith("n"))?.slice(1).trim();
  return { pid, command: command.trim() || undefined, cwd: cwd || undefined };
}

export type PrepareProxyTakeoverResult =
  | { ok: true; stopped: number[] }
  | { ok: false; error: "confirmation-required"; port: number; detail: string }
  | { ok: false; error: "terminate-failed" | "port-still-in-use"; detail?: string };

export async function prepareProxyPortTakeover(
  port: number,
  upstreamPort: number,
  configuredWorkdir: string,
  configuredCommand: string,
  confirmed = false,
): Promise<PrepareProxyTakeoverResult> {
  const pids = await listenerPids(port);
  if (pids.length === 0) return { ok: true, stopped: [] };

  const listeners = await Promise.all(pids.map(describeListener));
  const details = listeners.map((item) => [
    `PID ${item.pid}`,
    item.cwd ? `폴더: ${item.cwd}` : "폴더: 확인할 수 없음",
    item.command ? `명령: ${item.command}` : "명령: 확인할 수 없음",
  ].join("\n")).join("\n\n");
  const detail = `${details}\n\n설정한 프로젝트 폴더: ${configuredWorkdir}\n\n종료 후 DataForge가 이 서버를 실제 서버 포트에서 다시 실행합니다. 저장하지 않은 서버 작업이 있다면 취소하세요.`;
  if (!confirmed) return { ok: false, error: "confirmation-required", port, detail };

  try {
    for (const pid of pids) process.kill(pid, "SIGTERM");
  } catch (error) {
    return { ok: false, error: "terminate-failed", detail: error instanceof Error ? error.message : String(error) };
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if ((await listenerPids(port)).length === 0) {
      activeTakeover = { port, upstreamPort, workdir: configuredWorkdir, command: configuredCommand, stoppedPids: pids, createdAt: new Date().toISOString() };
      await saveTakeoverState(activeTakeover);
      return { ok: true, stopped: pids };
    }
  }
  return { ok: false, error: "port-still-in-use" };
}

export async function restoreServerAfterFailedTakeover(
  port: number,
  configuredWorkdir: string,
  configuredCommand: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if ((await listenerPids(port)).length > 0) {
    if (activeTakeover?.port === port) await clearTakeoverState();
    return { ok: true };
  }
  const nodeForShell = quoteShellArgument(resolveUpstreamNodeExecutable(null, configuredWorkdir));
  let command = configuredCommand
    .replace(/\{\{\s*port\s*\}\}/gi, String(port))
    .replace(/\{\{\s*node\s*\}\}/gi, nodeForShell);
  command = command.replace(/^\s*node(?=\s+dummy\.server\.js\b)/i, nodeForShell);
  if (!command.trim()) return { ok: false, error: "empty-command" };

  try {
    const child = process.platform === "win32"
      ? spawn(process.env.ComSpec?.trim() || "cmd.exe", ["/d", "/s", "/c", command], {
          cwd: configuredWorkdir,
          detached: true,
          env: { ...process.env, PORT: String(port) },
          stdio: "ignore",
          windowsHide: true,
        })
      : spawn("sh", ["-lc", command], {
          cwd: configuredWorkdir,
          detached: true,
          env: { ...process.env, PORT: String(port) },
          stdio: "ignore",
        });
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    child.unref();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  for (let attempt = 0; attempt < 32; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if ((await listenerPids(port)).length > 0) {
      if (activeTakeover?.port === port) await clearTakeoverState();
      return { ok: true };
    }
  }
  return { ok: false, error: `포트 ${port}에서 복구된 서버를 확인하지 못했습니다.` };
}

function sameWorkdir(actual: string | undefined, expected: string): boolean {
  return Boolean(actual) && resolve(actual!) === resolve(expected);
}

async function stopMatchingUpstream(port: number, workdir: string): Promise<void> {
  for (const pid of await listenerPids(port)) {
    const info = await describeListener(pid);
    if (sameWorkdir(info.cwd, workdir)) {
      try { process.kill(pid, "SIGTERM"); } catch { /* already exited */ }
    }
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const remaining = await Promise.all((await listenerPids(port)).map(describeListener));
    if (!remaining.some((info) => sameWorkdir(info.cwd, workdir))) return;
    await new Promise((done) => setTimeout(done, 250));
  }
}

export async function restorePendingProxyTakeoverOnStartup(): Promise<
  { ok: true; restored: boolean } | { ok: false; error: string }
> {
  const takeover = await readTakeoverState();
  if (!takeover) return { ok: true, restored: false };
  activeTakeover = takeover;
  const current = await Promise.all((await listenerPids(takeover.port)).map(describeListener));
  if (current.some((info) => sameWorkdir(info.cwd, takeover.workdir))) {
    await clearTakeoverState();
    return { ok: true, restored: true };
  }
  if (current.length > 0) return { ok: false, error: `포트 ${takeover.port}을 다른 프로그램이 사용 중이어서 자동 복구하지 않았습니다.` };
  await stopMatchingUpstream(takeover.upstreamPort, takeover.workdir);
  const restored = await restoreServerAfterFailedTakeover(takeover.port, takeover.workdir, takeover.command);
  return restored.ok ? { ok: true, restored: true } : restored;
}

export async function restoreActiveProxyTakeover(): Promise<
  { ok: true; restored: boolean } | { ok: false; error: string }
> {
  const takeover = activeTakeover;
  if (!takeover) return { ok: true, restored: false };
  const restored = await restoreServerAfterFailedTakeover(takeover.port, takeover.workdir, takeover.command);
  return restored.ok ? { ok: true, restored: true } : restored;
}

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";

/** `~/foo` → 홈 기준 절대 경로 */
export function expandConfigPath(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("~/")) return join(homedir(), t.slice(2));
  return t;
}

/** NVM/공식 릴리스 폴더명: v22.13.0 등 */
const NVM_SEMVER_DIR = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d+)$/;

function sortSemverDesc(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const pa = a.replace(/^v/, "").split(".").map((x) => parseInt(x, 10));
    const pb = b.replace(/^v/, "").split(".").map((x) => parseInt(x, 10));
    for (let i = 0; i < 3; i++) {
      const da = pa[i] ?? 0;
      const db = pb[i] ?? 0;
      if (db !== da) return db - da;
    }
    return 0;
  });
}

function getNodeMajor(versionDir: string): number {
  const m = /^v(\d+)\./.exec(versionDir);
  return m?.[1] ? parseInt(m[1], 10) : -1;
}

/**
 * care/server 계열은 구버전 Node 호환성이 필요한 경우가 있어
 * 자동 선택 시 안정 우선 순위(16 → 18 → 20)를 먼저 시도한다.
 */
function sortPreferredForUpstream(names: string[]): string[] {
  const sorted = sortSemverDesc(names);
  const preferredMajors = [16, 18, 20];
  const out: string[] = [];
  const used = new Set<string>();
  for (const major of preferredMajors) {
    for (const n of sorted) {
      if (used.has(n)) continue;
      if (getNodeMajor(n) === major) {
        out.push(n);
        used.add(n);
      }
    }
  }
  for (const n of sorted) {
    if (used.has(n)) continue;
    out.push(n);
    used.add(n);
  }
  return out;
}

/** macOS GUI 앱은 셸의 NVM을 안 물려 받음 — `NVM_DIR` 우선 */
function getNvmVersionsNodeRootUnix(): string {
  const nvmDir = process.env.NVM_DIR?.trim();
  if (nvmDir) return join(nvmDir, "versions", "node");
  return join(homedir(), ".nvm", "versions", "node");
}

function listNvmVersionDirNamesUnix(): string[] {
  const nvmNodeRoot = getNvmVersionsNodeRootUnix();
  if (!existsSync(nvmNodeRoot)) return [];
  try {
    return readdirSync(nvmNodeRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((name) => NVM_SEMVER_DIR.test(name));
  } catch {
    return [];
  }
}

function tryNvmNodeBinUnix(): string | null {
  const root = getNvmVersionsNodeRootUnix();
  const dirs = listNvmVersionDirNamesUnix();
  for (const name of sortPreferredForUpstream(dirs)) {
    const bin = join(root, name, "bin", "node");
    if (existsSync(bin)) return bin;
  }
  return null;
}

/** Care dummy.server.js 호환용 — 설치된 NVM 중 해당 메이저 최신 패치 */
function tryNvmLatestMajorUnix(major: number): string | null {
  const root = getNvmVersionsNodeRootUnix();
  const dirs = listNvmVersionDirNamesUnix().filter((d) => getNodeMajor(d) === major);
  if (dirs.length === 0) return null;
  const best = sortSemverDesc(dirs)[0];
  if (!best) return null;
  const bin = join(root, best, "bin", "node");
  return existsSync(bin) ? bin : null;
}

function tryNvmNodeBinWindows(): string | null {
  const nvmHome = process.env.NVM_HOME?.trim();
  if (!nvmHome || !existsSync(nvmHome)) return null;
  try {
    const dirs = readdirSync(nvmHome, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((name) => NVM_SEMVER_DIR.test(name));
    for (const name of sortPreferredForUpstream(dirs)) {
      const exe = join(nvmHome, name, "node.exe");
      if (existsSync(exe)) return exe;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function tryNvmLatestMajorWindows(major: number): string | null {
  const nvmHome = process.env.NVM_HOME?.trim();
  if (!nvmHome || !existsSync(nvmHome)) return null;
  try {
    const dirs = readdirSync(nvmHome, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((name) => NVM_SEMVER_DIR.test(name))
      .filter((name) => getNodeMajor(name) === major);
    if (dirs.length === 0) return null;
    const best = sortSemverDesc(dirs)[0];
    if (!best) return null;
    const exe = join(nvmHome, best, "node.exe");
    return existsSync(exe) ? exe : null;
  } catch {
    return null;
  }
}

/** DMG·Finder 실행 시 PATH에 node가 없음 → Homebrew 등 고정 경로 */
function tryCommonUnixNodePaths(): string | null {
  const candidates =
    process.platform === "darwin"
      ? ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
      : ["/usr/local/bin/node", "/usr/bin/node"];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

let cachedLoginShellNode: string | null | undefined;

/**
 * zsh/bash 로그인 셸의 PATH에서 node 절대 경로 (GUI 앱은 ~/.zprofile 등이 반영되지 않는 경우가 많음).
 * 한 번 성공하면 캐시.
 */
function tryNodeFromLoginShell(): string | null {
  if (cachedLoginShellNode !== undefined) return cachedLoginShellNode;
  cachedLoginShellNode = null;
  if (process.platform === "win32") return null;
  const shells: Array<{ path: string; args: string[] }> = [
    { path: "/bin/zsh", args: ["-lc", "command -v node"] },
    { path: "/bin/bash", args: ["-lc", "command -v node"] },
  ];
  for (const { path: shellPath, args } of shells) {
    try {
      if (!existsSync(shellPath)) continue;
      const out = execFileSync(shellPath, args, {
        encoding: "utf8",
        timeout: 8000,
        stdio: ["ignore", "pipe", "ignore"],
        env: process.env,
      }).trim();
      const line = out.split(/\r?\n/).filter(Boolean).pop()?.trim();
      if (line && existsSync(line)) {
        cachedLoginShellNode = line;
        return line;
      }
    } catch {
      /* next */
    }
  }
  return null;
}

/**
 * 업스트림용 Node 바이너리 후보.
 * - 맥/Linux: NVM 최신 버전 → Homebrew/표준 경로 → 로그인 셸 `command -v node` → `node`(PATH)
 * - 윈도: NVM(모든 버전 중 최신) → Program Files → `node`
 */
export function detectPreferredNodeBin(): string {
  if (process.platform === "win32") {
    return detectPreferredNodeBinWindows();
  }
  return tryNvmNodeBinUnix() ?? tryCommonUnixNodePaths() ?? tryNodeFromLoginShell() ?? "node";
}

function detectPreferredNodeBinWindows(): string {
  const fromNvm = tryNvmNodeBinWindows();
  if (fromNvm) return fromNvm;
  const pf = process.env.ProgramFiles?.trim();
  if (pf) {
    const candidate = join(pf, "nodejs", "node.exe");
    if (existsSync(candidate)) return candidate;
  }
  const pf86 = process.env["ProgramFiles(x86)"]?.trim();
  if (pf86) {
    const candidate = join(pf86, "nodejs", "node.exe");
    if (existsSync(candidate)) return candidate;
  }
  return "node";
}

/** 사용자가 경로를 적었을 때만 파일 존재 여부를 검사한다. `node`만 쓰면 PATH에 맡긴다. */
export function shouldVerifyNodeExecutableExists(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const expanded = expandConfigPath(trimmed);
  const base = basename(expanded).toLowerCase();
  const bareName =
    (base === "node" || base === "node.exe") && !isAbsolute(expanded) && !/[\\/]/.test(trimmed);
  if (bareName) return false;
  return isAbsolute(expanded) || /[\\/]/.test(trimmed);
}

type ParsedNvmrcVersion = { major: number; minor?: number; patch?: number };

/** `.nvmrc` 첫 유효 줄 — `16`, `v16.20.2` 등만 인식 (lts/* 는 무시) */
function parseNvmrcVersion(content: string): ParsedNvmrcVersion | null {
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(t);
    if (!m) return null;
    return {
      major: parseInt(m[1]!, 10),
      ...(m[2] != null ? { minor: parseInt(m[2], 10) } : {}),
      ...(m[3] != null ? { patch: parseInt(m[3], 10) } : {}),
    };
  }
  return null;
}

function nvmDirMatchesParsed(dirName: string, parsed: ParsedNvmrcVersion): boolean {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(dirName);
  if (!m) return false;
  const maj = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  const pat = parseInt(m[3]!, 10);
  if (maj !== parsed.major) return false;
  if (parsed.minor != null && min !== parsed.minor) return false;
  if (parsed.patch != null && pat !== parsed.patch) return false;
  return true;
}

function pickBestNvmDirForParsed(dirs: string[], parsed: ParsedNvmrcVersion): string | null {
  const matched = dirs.filter((d) => nvmDirMatchesParsed(d, parsed));
  if (matched.length === 0) return null;
  return sortSemverDesc(matched)[0] ?? null;
}

/** 프로젝트 폴더의 `.nvmrc`가 있으면 NVM에서 해당 메이저(또는 정확 버전)에 맞는 node 경로 */
export function tryResolveNodeFromProjectNvmrc(projectDirExpanded: string): string | null {
  if (!projectDirExpanded.trim() || !existsSync(projectDirExpanded)) return null;
  const nvmrcPath = join(projectDirExpanded, ".nvmrc");
  if (!existsSync(nvmrcPath)) return null;
  let content: string;
  try {
    content = readFileSync(nvmrcPath, "utf8");
  } catch {
    return null;
  }
  const parsed = parseNvmrcVersion(content);
  if (!parsed) return null;

  if (process.platform === "win32") {
    const nvmHome = process.env.NVM_HOME?.trim();
    if (!nvmHome || !existsSync(nvmHome)) return null;
    try {
      const dirs = readdirSync(nvmHome, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .filter((name) => NVM_SEMVER_DIR.test(name));
      const pick = pickBestNvmDirForParsed(dirs, parsed);
      if (!pick) return null;
      const exe = join(nvmHome, pick, "node.exe");
      return existsSync(exe) ? exe : null;
    } catch {
      return null;
    }
  }

  const dirs = listNvmVersionDirNamesUnix();
  const pick = pickBestNvmDirForParsed(dirs, parsed);
  if (!pick) return null;
  const root = getNvmVersionsNodeRootUnix();
  const bin = join(root, pick, "bin", "node");
  return existsSync(bin) ? bin : null;
}

/**
 * 업스트림 실행용 node: 사용자 지정 → 프로젝트 `.nvmrc` → 자동 탐지
 */
export function resolveUpstreamNodeExecutable(configuredPathRaw: string | null | undefined, workdirExpanded: string): string {
  const raw = (configuredPathRaw ?? "").trim();
  if (raw) return expandConfigPath(raw);
  const fromNvmrc = tryResolveNodeFromProjectNvmrc(workdirExpanded);
  if (fromNvmrc) return fromNvmrc;
  if (process.platform === "win32") {
    const v16w = tryNvmLatestMajorWindows(16);
    if (v16w) return v16w;
  } else {
    const v16 = tryNvmLatestMajorUnix(16);
    if (v16) return v16;
  }
  return detectPreferredNodeBin();
}

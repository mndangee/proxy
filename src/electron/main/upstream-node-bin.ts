import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";

/** `~/foo` → 홈 기준 절대 경로 */
export function expandConfigPath(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("~/")) return join(homedir(), t.slice(2));
  return t;
}

/**
 * 업스트림용 Node 바이너리 후보.
 * - 맥/Linux: ~/.nvm/versions/node/v16.x.x/bin/node (최신 v16)
 * - 윈도: %NVM_HOME%\v16.x.x\node.exe → 없으면 Program Files\nodejs\node.exe → `node`(PATH)
 */
export function detectPreferredNodeBin(): string {
  if (process.platform === "win32") {
    return detectPreferredNodeBinWindows();
  }
  return detectPreferredNodeBinUnix();
}

function detectPreferredNodeBinUnix(): string {
  const nvmNodeRoot = join(homedir(), ".nvm", "versions", "node");
  if (!existsSync(nvmNodeRoot)) return "node";
  try {
    const dirs = readdirSync(nvmNodeRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((name) => /^v16\.\d+\.\d+$/.test(name))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    if (dirs.length === 0) return "node";
    const bin = join(nvmNodeRoot, dirs[0], "bin", "node");
    return existsSync(bin) ? bin : "node";
  } catch {
    return "node";
  }
}

function detectPreferredNodeBinWindows(): string {
  const nvmHome = process.env.NVM_HOME?.trim();
  if (nvmHome && existsSync(nvmHome)) {
    try {
      const dirs = readdirSync(nvmHome, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .filter((name) => /^v16\.\d+\.\d+$/.test(name))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const name of dirs) {
        const exe = join(nvmHome, name, "node.exe");
        if (existsSync(exe)) return exe;
      }
    } catch {
      /* ignore */
    }
  }
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

#!/usr/bin/env node
/**
 * LISTEN 중인 TCP 포트를 쓰는 로컬 프로세스에 SIGTERM 전송 (macOS/Linux: lsof).
 * 사용: node scripts/free-port.mjs 7777
 *       npm run free-port -- 7777
 */
import { execFileSync } from "node:child_process";

const port = String(process.argv[2] ?? process.env.PORT ?? "7777").trim();

function listListenPids(p) {
  try {
    const out = execFileSync("lsof", ["-ti", `tcp:${p}`, "-sTCP:LISTEN"], { encoding: "utf8" }).trim();
    if (!out) return [];
    return [...new Set(out.split(/\s+/).filter(Boolean))];
  } catch (e) {
    const code = /** @type {NodeJS.ErrnoException} */ (e).code;
    const status = /** @type {{ status?: number }} */ (e).status;
    if (code === "ENOENT") {
      console.error("lsof 명령을 찾을 수 없습니다. macOS/Linux에서 실행해 주세요.");
      process.exit(1);
    }
    if (status === 1) return [];
    throw e;
  }
}

const pids = listListenPids(port);
if (pids.length === 0) {
  console.log(`포트 ${port}에서 LISTEN 중인 프로세스가 없습니다.`);
  process.exit(0);
}

console.log(`포트 ${port} 사용 PID: ${pids.join(", ")} → SIGTERM`);
for (const pid of pids) {
  try {
    process.kill(Number(pid), "SIGTERM");
  } catch (err) {
    console.error(`PID ${pid} 종료 실패:`, /** @type {Error} */ (err).message);
  }
}
console.log(
  "완료. 이후 순서: (1) DataForge 실행 — 모의 서버·Care 게이트웨이 켜기 (2) Care: cd care/server && node dummy.server.js -port 7778",
);

/** stderr 누적 — 마지막 줄만 쓰면 EADDRINUSE 등 앞쪽 에러가 사라짐 */
const STDERR_TAIL_CAP = 12_000;

export type StderrTailRef = { s: string };

export function resetStderrTail(ref: StderrTailRef): void {
  ref.s = "";
}

export function appendStderrTail(ref: StderrTailRef, chunk: Buffer): void {
  ref.s = (ref.s + chunk.toString("utf8")).slice(-STDERR_TAIL_CAP);
}

/**
 * 프로세스 비정상 종료 시 사용자 메시지 — 포트 충돌을 Node 버전 줄보다 우선.
 */
export function spawnExitDetailAndHint(stderrTail: string, stderrLastLine: string, stdoutLastLine: string): { detail: string; hint: string } {
  if (/EADDRINUSE|address already in use/i.test(stderrTail)) {
    const port = stderrTail.match(/\bport[:\s]+(\d+)/i)?.[1];
    return {
      detail: port
        ? ` 원인: 포트 ${port}가 이미 사용 중입니다 (EADDRINUSE).`
        : ` 원인: 포트가 이미 사용 중입니다 (EADDRINUSE).`,
      hint:
        " 힌트: 터미널에서 이미 `dummy.server.js`를 띄웠거나, 이전 node 프로세스가 남아 있을 수 있습니다. 해당 터미널에서 종료하거나 `lsof -nP -iTCP:7777 -sTCP:LISTEN` 후 프로세스를 끄세요. DataForge만 쓸 때는 수동 서버를 끈 뒤 게이트웨이를 켜 보세요.",
    };
  }
  const reason = stderrLastLine || stdoutLastLine;
  const detail = reason ? ` 원인: ${reason}` : "";
  const hint =
    reason && /\bNode\.js\s+v(1[89]|2\d)\b/.test(reason)
      ? " 힌트: 터미널의 `node -v`와 달리 Electron은 지정·자동 탐지한 Node로 실행합니다. Node 실행 파일 경로에 v16을 넣으세요. 예: ~/.nvm/versions/node/v16.20.2/bin/node"
      : "";
  return { detail, hint };
}

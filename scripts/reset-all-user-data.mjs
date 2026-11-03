/**
 * Electron 앱이 쓰는 사용자 데이터를 초기화합니다.
 * - DataForge-projects/ 안의 모든 프로젝트 폴더 삭제
 * - proxy-app-config.json 삭제(다음 실행 시 기본값으로 재생성)
 * - 최근 API 요청 기록과 임시 API 정보 연결 파일 삭제
 *
 * 브라우저만 쓸 때의 localStorage는 이 스크립트로 지울 수 없습니다.
 * 개발자 도구 → Application → Local Storage에서 아래 키를 수동 삭제하세요.
 *
 * 실행: npm run reset:user-data
 */
import { existsSync, mkdirSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function electronUserDataDir() {
  const p = process.platform;
  if (p === "darwin") return join(homedir(), "Library", "Application Support", "proxy");
  if (p === "win32") return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "proxy");
  return join(homedir(), ".config", "proxy");
}

const root = electronUserDataDir();
const projectsDir = join(root, "DataForge-projects");
const configFile = join(root, "proxy-app-config.json");
const recentRequestsFile = join(root, "recent-proxy-requests.json");
const interfaceSourceFile = join(root, "import-interface-source.json");

console.log(`사용자 데이터 루트: ${root}`);

if (existsSync(projectsDir)) {
  for (const name of readdirSync(projectsDir, { withFileTypes: true })) {
    const full = join(projectsDir, name.name);
    rmSync(full, { recursive: true, force: true });
    console.log(`삭제: ${full}`);
  }
  rmSync(projectsDir, { recursive: true, force: true });
}
mkdirSync(projectsDir, { recursive: true });
console.log(`비움 후 생성: ${projectsDir}`);

for (const file of [configFile, recentRequestsFile, interfaceSourceFile]) {
  if (existsSync(file)) {
    unlinkSync(file);
    console.log(`삭제: ${file}`);
  } else {
    console.log(`(없음) ${file}`);
  }
}

console.log(`
[브라우저 dev만 쓸 때] 아래 localStorage 키를 수동으로 지우세요 (개발자 도구 → Application):
  - proxy-app-projects-v1
  - proxy-app-project-apis-v1
  - proxy-app-api-responses-v1
  - proxy-app-config-v1
  - proxy-app-api-latency-ms-v1
  - proxy-project-linked-clients-v1
  - dataforge-recent-requests-seen-at
  - active-api-response:* (접두사로 검색 후 삭제)
  - proxy-api-json-registered:* (접두사로 검색 후 삭제)
완료. Electron 앱을 다시 켠 뒤 홈이 비어 있는지 확인하세요.
`);

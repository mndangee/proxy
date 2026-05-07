/**
 * 프로젝트 개요 및 사용법 PPT 생성
 * 실행: npm run docs:project-overview-ppt
 * 출력: docs/DataForge-프로젝트-개요-및-사용법.pptx
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** pptxgenjs v4는 package exports로 ESM/CJS가 갈리는데, Node 스크립트에서는 CJS가 안정적입니다. */
const require = createRequire(import.meta.url);
const pptxgen = require("pptxgenjs");

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "docs");
const outFile = join(outDir, "DataForge-프로젝트-개요-및-사용법.pptx");

/** 슬라이드 공통: 한글 가독 (윈도 맑은 고딕 / 맥·리눅스에서도 대체 폰트 적용) */
const ko = { fontFace: "Malgun Gothic" };

function cover(pres, title, subtitle) {
  const s = pres.addSlide();
  s.background = { color: "1E3A5F" };
  s.addText(title, { x: 0.6, y: 2.2, w: 12, h: 1.2, fontSize: 36, bold: true, color: "FFFFFF", ...ko });
  s.addText(subtitle, { x: 0.6, y: 3.5, w: 12, h: 0.8, fontSize: 18, color: "C8D4E8", ...ko });
  s.addText("Electron + React + TypeScript", { x: 0.6, y: 6.2, w: 12, h: 0.5, fontSize: 14, color: "8FA8C4", ...ko });
}

function section(pres, title) {
  const s = pres.addSlide();
  s.addText(title, { x: 0.6, y: 2.6, w: 12, h: 1, fontSize: 30, bold: true, color: "1E3A5F", ...ko });
}

function bullets(pres, title, lines) {
  const s = pres.addSlide();
  const body = lines.map((t) => ({ text: t, options: { fontSize: 16, bullet: true, ...ko } }));
  s.addText(title, { x: 0.5, y: 0.45, w: 12.3, h: 0.55, fontSize: 22, bold: true, color: "1E3A5F", ...ko });
  s.addText(body, { x: 0.55, y: 1.1, w: 12.2, h: 6.2, valign: "top", lineSpacingMultiple: 1.15 });
}

function twoCol(pres, title, leftTitle, leftLines, rightTitle, rightLines) {
  const s = pres.addSlide();
  s.addText(title, { x: 0.5, y: 0.45, w: 12.3, h: 0.55, fontSize: 22, bold: true, color: "1E3A5F", ...ko });
  s.addText(leftTitle, { x: 0.5, y: 1.05, w: 5.9, h: 0.4, fontSize: 15, bold: true, ...ko });
  s.addText(
    leftLines.map((t) => ({ text: t, options: { fontSize: 14, bullet: true, ...ko } })),
    { x: 0.5, y: 1.45, w: 5.9, h: 5.8, valign: "top", lineSpacingMultiple: 1.12 },
  );
  s.addText(rightTitle, { x: 6.6, y: 1.05, w: 6.1, h: 0.4, fontSize: 15, bold: true, ...ko });
  s.addText(
    rightLines.map((t) => ({ text: t, options: { fontSize: 14, bullet: true, ...ko } })),
    { x: 6.6, y: 1.45, w: 6.1, h: 5.8, valign: "top", lineSpacingMultiple: 1.12 },
  );
}

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "DataForge (Proxy)";
pres.title = "DataForge 프로젝트 개요 및 사용법";
pres.subject = "개요 · 프록시 · 업스트림 · 배포";

cover(pres, "DataForge (Proxy)", "프로젝트 개요 및 사용 방법");

bullets(pres, "이 앱은 무엇인가요?", [
  "로컬에서 API 응답을 저장·선택하고, 모의(목) 서버로 제공하는 데스크톱 도구입니다.",
  "프로젝트별로 엔드포인트와 JSON 응답(로컬/테스트/에러 등)을 관리합니다.",
  "필요 시 업스트림(실제 백엔드)과 함께 써서 화면 전체 동작을 검증할 수 있습니다.",
]);

bullets(pres, "기술 스택", [
  "Electron — 데스크톱 런타임(앱 자체 실행에는 별도 Node 설치가 필요 없음)",
  "React 18 + TypeScript + Vite / electron-vite",
  "Tailwind CSS 4 — 디자인 토큰·공통 컴포넌트 기반 UI",
]);

twoCol(
  pres,
  "주요 화면",
  "탐색·편집",
  ["홈: 프로젝트 목록, 프록시 설정", "프로젝트 상세: API 엔드포인트 테이블", "API 상세: 응답 시나리오 선택", "JSON 편집: 응답 본문 수정"],
  "기타",
  ["라이선스 페이지", "디자인 시스템 샘플", "Electron 시 디스크 저장 / 브라우저만 쓸 때는 localStorage 폴백"],
);

bullets(pres, "데이터가 저장되는 곳", [
  "Electron: 사용자 데이터 폴더 아래 프로젝트 디렉터리(매니페스트·apis 등)",
  "브라우저만: localStorage 키로 프로젝트 목록 등 유지(출처(origin)마다 다름)",
  "API 화면에서 고른 활성 응답은 localStorage에 별도 키로 저장됩니다.",
]);

section(pres, "프록시 · 모의 서버");

bullets(pres, "역할 정리", [
  "모의 서버(프록시): 앱에 저장된 mock이 있으면 그 응답을 먼저 반환합니다.",
  "업스트림: mock이 없거나 전달이 필요한 요청을 실제 서버가 처리합니다.",
  "게이트웨이(선택): 클라이언트가 포트·URL을 바꿀 수 없을 때 중간에서 라우팅합니다.",
]);

bullets(pres, "요청/응답 방식(프로토콜 프로필)", [
  "트랜잭션 ID + responseMessage: header.tranId 등으로 조회, responseMessage 구조로 응답",
  "일반 JSON API(REST): 경로·헤더·쿼리·본문 기반 키로 조회, JSON 그대로 응답",
  "프로젝트 성격에 맞는 프로필을 선택해야 합니다.",
]);

bullets(pres, "홈에서 하는 설정(요약)", [
  "「프록시 설정」: 모의 서버 ON/OFF, 포트, 프로토콜 프로필",
  "업스트림 자동 실행: 작업 폴더·포트·(선택) 실행 명령·Node 실행 파일 경로",
  "tranId와 API 이름이 다르면 mockTranAliases로 매핑",
]);

twoCol(
  pres,
  "프로젝트 전체 동작 — 두 가지 패턴",
  "A. API 베이스 URL 변경 가능",
  ["게이트웨이 OFF", "클라이언트가 모의 서버 URL로 직접 호출", "예: http://localhost:4780/api", "mock 있음 → 프록시, 없음 → 업스트림"],
  "B. URL/포트 고정",
  ["게이트웨이 ON", "고정 포트는 게이트웨이, 업스트림은 다른 포트", "모의 서버는 별도 포트", "포트가 겹치면 안 됨(EADDRINUSE)"],
);

bullets(pres, "Node / Windows 참고", [
  "앱(EXE) 실행: Electron에 런타임 포함 → 사용자 PC에 Node 없어도 됨.",
  "업스트림 자동 실행: 외부 백엔드를 띄우므로 node.exe가 필요할 수 있음.",
  "Windows: NVM_HOME·Program Files\\nodejs 순으로 v16 후보 탐색, 커스텀 명령은 cmd /c 경로.",
]);

bullets(pres, "개발·빌드", [
  "개발: npm run dev",
  "타입체크/린트: npm run typecheck, npm run lint",
  "패키징: npm run build:mac | build:win | build:linux",
  "상세 문서: README.md, docs/project-full-flow-usage.md, docs/data-lifecycle-guide.md",
]);

bullets(pres, "PPT 파일 받는 방법", [
  "저장소의 docs/DataForge-프로젝트-개요-및-사용법.pptx 를 그대로 복사하거나 Git에서 내려받습니다.",
  "내용을 최신으로 다시 만들려면 프로젝트 루트에서: npm run docs:project-overview-ppt",
]);

mkdirSync(outDir, { recursive: true });
await pres.writeFile({ fileName: outFile });

console.log(`작성 완료: ${outFile}`);

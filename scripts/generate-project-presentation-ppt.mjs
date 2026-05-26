/**
 * DataForge(Proxy) 프로젝트 소개 PPT
 * 실행: npm run docs:project-ppt
 * 출력: docs/DataForge-프로젝트-소개.pptx
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pptxgen = require("pptxgenjs");

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "docs");
const outFile = join(outDir, "DataForge-프로젝트-소개.pptx");

const ko = { fontFace: "Malgun Gothic" };

function cover(pres, title, subtitle, tagline) {
  const s = pres.addSlide();
  s.background = { color: "1E3A5F" };
  s.addText(title, { x: 0.6, y: 1.85, w: 12, h: 1.2, fontSize: 36, bold: true, color: "FFFFFF", ...ko });
  s.addText(subtitle, { x: 0.6, y: 3.15, w: 12, h: 1.0, fontSize: 18, color: "C8D4E8", ...ko });
  s.addText(tagline, { x: 0.6, y: 6.0, w: 12, h: 0.55, fontSize: 13, color: "8FA8C4", ...ko });
}

function section(pres, title) {
  const s = pres.addSlide();
  s.addText(title, { x: 0.6, y: 2.6, w: 12, h: 1, fontSize: 30, bold: true, color: "1E3A5F", ...ko });
}

function bullets(pres, title, lines, opts = {}) {
  const s = pres.addSlide();
  const fontSize = opts.fontSize ?? 16;
  const body = lines.map((t) => ({ text: t, options: { fontSize, bullet: true, ...ko } }));
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

function callout(pres, title, bodyLines, accent = "8B1538") {
  const s = pres.addSlide();
  s.addText(title, { x: 0.5, y: 0.45, w: 12.3, h: 0.6, fontSize: 22, bold: true, color: accent, ...ko });
  const body = bodyLines.map((t) => ({ text: t, options: { fontSize: 15, bullet: false, ...ko } }));
  s.addText(body, {
    x: 0.55,
    y: 1.15,
    w: 12.1,
    h: 5.9,
    valign: "top",
    lineSpacingMultiple: 1.2,
    fill: { color: accent === "1E3A5F" ? "E8F4FD" : "FDF2F4" },
    margin: [0.2, 0.25, 0.2, 0.25],
  });
}

function tableSlide(pres, title, headers, rows) {
  const s = pres.addSlide();
  s.addText(title, { x: 0.5, y: 0.45, w: 12.3, h: 0.55, fontSize: 22, bold: true, color: "1E3A5F", ...ko });
  const tableRows = [
    headers.map((h) => ({ text: h, options: { bold: true, fill: { color: "E8F4FD" }, ...ko } })),
    ...rows.map((row) => row.map((cell) => ({ text: cell, options: { ...ko } }))),
  ];
  s.addTable(tableRows, {
    x: 0.5,
    y: 1.15,
    w: 12.2,
    colW: [2.8, 9.4],
    fontSize: 13,
    border: { type: "solid", color: "D4D4D4", pt: 0.75 },
    valign: "middle",
  });
}

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "DataForge (Proxy)";
pres.title = "DataForge 프로젝트 소개";
pres.subject = "제작 배경 · 기술 스택 · 중요망 대응";

cover(
  pres,
  "DataForge (Proxy)",
  "로컬 목업·프록시 기반 API 개발 도구",
  "TypeScript · React · Electron · Vite",
);

bullets(pres, "발표 목차", [
  "왜 이 프로그램을 만들었는가",
  "프로그램 한 줄 요약",
  "사용 언어·기술 스택",
  "구조와 주요 기능",
  "세 가지 제작 목표별 기대 효과",
  "중요망·오픈소스 관점",
  "추후 개선 사항",
]);

section(pres, "왜 만들었는가");

callout(
  pres,
  "제작 배경 — 세 가지 목표",
  [
    "① Mac 전용 개발 서버·환경에 덜 의존하고, 개발자 PC에서 바로 API 목업·연동 검증을 하려는 필요",
    "② Git 저장소에 개인정보가 섞인 더미 JSON·설정이 올라가는 위험을 줄이려는 필요",
    "③ 중요망(폐쇄망)에서도 개발 환경을 구축할 수 있게 하고, 오픈소스 취약점 대응을 수월하게 하려는 필요",
    "",
    "※ 중요망에서의 실제 운영·배포·표준 절차는 추후 개선·정비할 사항입니다. (현재는 로컬·DMZ 검증 중심)",
  ],
  "1E3A5F",
);

bullets(pres, "프로그램 한 줄 요약", [
  "DataForge(Proxy)는 로컬 PC에서 API 응답(목업)을 저장·선택하고, 모의 HTTP 서버로 내려주는 데스크톱 앱입니다.",
  "프로젝트별 API·JSON 응답(로컬 / 테스트 / 에러)을 관리하고, 필요 시 업스트림(실서버)과 게이트웨이(고정 URL·포트)로 연동합니다.",
  "응답 지연(초 단위), 활성 응답 선택, 프로젝트 가져오기·보내기 등으로 화면·API 검증을 한곳에서 처리합니다.",
  "Electron 설치형으로 배포할 수 있으며, Windows·macOS·Linux 빌드를 지원합니다.",
]);

section(pres, "사용 언어 · 기술 스택");

tableSlide(pres, "개발 언어·런타임", ["구분", "내용"], [
  ["주 언어", "TypeScript (프론트·Electron 메인 프로세스 공통)"],
  ["UI", "React 18 (함수형 컴포넌트)"],
  ["스타일", "Tailwind CSS 4"],
  ["데스크톱", "Electron 39 (Chromium + Node 내장)"],
  ["빌드·개발", "Vite 7, electron-vite 5"],
  ["패키징", "electron-builder (MSI/EXE, DMG/ZIP 등)"],
  ["품질", "ESLint, Prettier, TypeScript strict 체크"],
]);

bullets(pres, "기술 스택 — 역할", [
  "TypeScript: UI·비즈니스 로직·Electron IPC·모의 서버·게이트웨이 코드를 한 언어로 유지보수",
  "React + Tailwind: 프로젝트 목록, API 상세, JSON 편집, 프록시 설정 등 화면 구성",
  "Electron Main: 로컬 파일(userData) 저장, HTTP 모의 서버·API 게이트웨이, 업스트림 자동 실행",
  "Electron Renderer: 사용자 인터페이스 (Hash 기반 라우팅으로 file://·DMZ 패키지 대응)",
  "Vite / electron-vite: 빠른 개발 서버·프로덕션 번들",
]);

section(pres, "구조와 주요 기능");

twoCol(
  pres,
  "아키텍처 개요",
  "로컬 구성 요소",
  [
    "모의(프록시) HTTP 서버 — 저장된 JSON 응답 반환",
    "API 게이트웨이 — 고정 URL·포트 클라이언트용",
    "업스트림 — 실제 백엔드(선택·자동 실행)",
    "프로젝트 데이터 — userData / responses-store.json",
  ],
  "주요 화면·기능",
  [
    "홈: 프로젝트·프록시 설정",
    "API 상세: 로컬/테스트/에러 응답·「응답으로 사용」",
    "JSON 편집·가져오기",
    "응답 지연(초)·라이선스 페이지",
  ],
);

bullets(pres, "요청 처리 흐름(요약)", [
  "클라이언트 → (게이트웨이) → 모의 서버가 mock 조회 → 있으면 JSON 응답",
  "mock이 없으면 업스트림(실서버)으로 전달",
  "Care 등 레거시는 tranId·responseMessage 형식(legacy-tran-envelope) 지원",
  "API 이름·tran ID 매핑, 활성 응답(테스트/에러 포함) 반영",
]);

section(pres, "① Mac 서버 의존성 낮추기");

bullets(pres, "Mac 전용 서버·환경 의존을 줄이는 방법", [
  "공용 Mac 개발 서버·특정 망에 묶인 목업 환경 없이, 각자 PC에서 모의 서버를 띄워 개발",
  "클라이언트는 localhost 또는 게이트웨이 포트만 맞추면 되어 팀원·OS가 달라도 동일 패턴",
  "Windows·macOS·Linux용 설치 패키지 빌드 가능 (electron-builder)",
  "업스트림 자동 실행 시 서버 폴더의 .nvmrc·NVM으로 Node 버전 자동 탐지",
]);

section(pres, "② Git · 개인정보 · 더미 데이터");

callout(pres, "Git에 더미를 올릴 때의 위험", [
  "실명·전화·계좌·내부 URL 등이 JSON·설정·스크린샷에 섞이기 쉽고, push·fork·CI 로그에 남으면 되돌리기 어렵습니다.",
  "개인정보보호법·내부 ISMS 관점에서 규정 위반·신뢰 손실로 이어질 수 있습니다.",
]);

twoCol(
  pres,
  "DataForge가 돕는 운영 방향",
  "하지 말 것",
  [
    "responses.json·실데이터를 Git에 커밋",
    "테스트용 실정보를 그대로 push",
    "민감 설정을 저장소에 포함",
  ],
  "권장",
  [
    "Git에는 코드·비식별 샘플·스키마만",
    "응답 본문은 userData(로컬) 또는 import/ZIP",
    "팀 가이드: 「저장소에는 스키마, 응답은 각자 로컬」",
  ],
);

section(pres, "③ 중요망 · 오픈소스");

bullets(pres, "중요망(폐쇄망)에서 개발 환경을 구축하기 위해", [
  "외부 SaaS·클라우드 없이 로컬에서 모의 서버·게이트웨이·업스트림 구성",
  "설치 패키지만 반입하면 DMZ·내부망 정책에 맞게 사용 가능 (file://·해시 라우팅)",
  "의존성은 package.json·lockfile로 고정 → SBOM·취약점 스캐너 입력에 적합",
  "npm run licenses, 앱 내 라이선스 페이지로 서드파티 목록 문서화",
  "취약점 발표 시 버전 상향 → 재빌드 → 내부 배포 절차와 맞물림",
]);

callout(
  pres,
  "중요망 «실사용»에 대해",
  [
    "설계·구현 방향은 중요망·폐쇄망을 염두에 두었으나,",
    "조직 표준에 맞는 배포·서명·운영·접근 통제·감사 절차는 아직 정리·검증 중입니다.",
    "→ 추후 개선 사항으로 별도 관리합니다.",
  ],
  "5E3A9E",
);

section(pres, "추후 개선 사항");

bullets(pres, "추후 개선·정비 예정", [
  "중요망(폐쇄망) 실사용: 내부 배포 파이프라인, 코드 서명·공증, 표준 설치·업데이트 절차",
  "팀 공통 가이드: Git에 올릴 데이터 범위, 샘플 작성·비식별 규칙",
  "Mac 서버·기존 목업 환경과의 병행·전환 계획",
  "문서·교육: 프록시 설정, 게이트웨이, 응답 지연·테스트 응답 사용법",
  "필요 시 발표용 스크린샷·상세 사용법 PPT 보강 (docs:stakeholder-ppt, docs:project-overview-ppt)",
]);

twoCol(
  pres,
  "정리",
  "만든 이유",
  [
    "Mac 서버 의존 ↓ — 로컬 목업·크로스 플랫폼",
    "Git 더미·개인정보 위험 ↓ — 로컬 저장·운영 규칙",
    "중요망 개발 환경·OSS 대응 — 패키지·lockfile·라이선스",
  ],
  "기술",
  [
    "TypeScript + React + Electron",
    "Vite / electron-vite / Tailwind",
    "모의 서버 + 게이트웨이 + 업스트림",
  ],
);

bullets(pres, "PPT·문서 생성", [
  "이 파일: npm run docs:project-ppt → docs/DataForge-프로젝트-소개.pptx",
  "부서 발표(상세): npm run docs:stakeholder-ppt",
  "사용법 개요: npm run docs:project-overview-ppt",
  "README.md, docs/project-full-flow-usage.md, docs/data-lifecycle-guide.md",
]);

mkdirSync(outDir, { recursive: true });
await pres.writeFile({ fileName: outFile });

console.log(`작성 완료: ${outFile}`);

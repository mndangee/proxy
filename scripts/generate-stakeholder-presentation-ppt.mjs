/**
 * 부서 발표용 PPT (개인정보·중요망·크로스플랫폼·오픈소스 대응 포함)
 * 실행: npm run docs:stakeholder-ppt
 * 출력: docs/DataForge-부서발표-개요.pptx
 *
 * 선택 이미지(스크린샷): 아래 파일이 있으면 해당 슬라이드에 삽입됩니다.
 *   docs/ppt-assets-stakeholder/프록시-설정-스크린샷.png
 *   docs/ppt-assets-stakeholder/요청-흐름-스크린샷.png
 */
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pptxgen = require("pptxgenjs");

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "docs");
const outFile = join(outDir, "DataForge-부서발표-개요.pptx");
const stakeholderAssetDir = join(outDir, "ppt-assets-stakeholder");

const ko = { fontFace: "Malgun Gothic" };

function cover(pres, title, subtitle) {
  const s = pres.addSlide();
  s.background = { color: "1E3A5F" };
  s.addText(title, { x: 0.6, y: 2.0, w: 12, h: 1.3, fontSize: 34, bold: true, color: "FFFFFF", ...ko });
  s.addText(subtitle, { x: 0.6, y: 3.4, w: 12, h: 1.0, fontSize: 17, color: "C8D4E8", ...ko });
  s.addText("DataForge (Proxy) · Electron + React + TypeScript", {
    x: 0.6,
    y: 6.1,
    w: 12,
    h: 0.5,
    fontSize: 13,
    color: "8FA8C4",
    ...ko,
  });
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

function callout(pres, title, bodyLines) {
  const s = pres.addSlide();
  s.addText(title, { x: 0.5, y: 0.45, w: 12.3, h: 0.6, fontSize: 22, bold: true, color: "8B1538", ...ko });
  const body = bodyLines.map((t) => ({ text: t, options: { fontSize: 15, bullet: false, ...ko } }));
  s.addText(body, {
    x: 0.55,
    y: 1.15,
    w: 12.1,
    h: 5.9,
    valign: "top",
    lineSpacingMultiple: 1.2,
    fill: { color: "FDF2F4" },
    margin: [0.2, 0.25, 0.2, 0.25],
  });
}

/** 프록시·모의 서버 사용 요약 + 흐름 도식(도형). 선택 PNG는 assetDir 기준. */
function proxyServerUsageSlides(pres, assetDir) {
  section(pres, "프록시 서버 사용법");

  bullets(pres, "프록시(모의 서버) — 빠른 사용 순서", [
    "앱 실행 후 홈의 「프록시 설정」에서 모의 서버를 켜고 포트를 정합니다(다른 프로그램과 포트가 겹치면 안 됩니다).",
    "프로젝트에서 API·응답(JSON)을 저장한 뒤, 클라이언트의 API 베이스 URL을 `http://localhost:<모의서버포트>` 로 맞춥니다.",
    "해당 경로에 mock이 있으면 저장된 JSON이 응답되고, 없으면 설정된 업스트림(실서버)으로 넘깁니다.",
    "URL·포트를 바꿀 수 없는 클라이언트는 게이트웨이(고정 수신 포트)를 켜고, 모의 서버·업스트림 포트를 서로 다르게 둡니다.",
    "업스트림을 앱에서 자동 실행할 때는 Node 실행 파일 경로·작업 폴더·포트를 확인합니다(상세는 npm run docs:project-overview-ppt).",
  ]);

  const sFlow = pres.addSlide();
  sFlow.addText("요청 처리 흐름(도식)", {
    x: 0.5,
    y: 0.4,
    w: 12.3,
    h: 0.55,
    fontSize: 22,
    bold: true,
    color: "1E3A5F",
    ...ko,
  });
  sFlow.addText("클라이언트 → 모의 서버에서 mock 조회 → 있으면 즉시 응답, 없으면 업스트림으로 전달(게이트웨이 사용 시 고정 포트로 수신).", {
    x: 0.5,
    y: 0.95,
    w: 12.2,
    h: 0.55,
    fontSize: 13,
    color: "444444",
    ...ko,
  });

  const boxFill = { color: "E8F4FD" };
  const boxLine = { color: "1E3A5F", width: 1 };
  const y = 2.15;
  const h = 1.05;
  const ST = pres.ShapeType;

  const boxes = [
    { x: 0.45, w: 2.35, title: "클라이언트", sub: "앱·브라우저" },
    { x: 3.55, w: 2.55, title: "모의 서버", sub: "로컬 프록시" },
    { x: 6.95, w: 2.45, title: "Mock 저장소", sub: "프로젝트 JSON" },
    { x: 10.05, w: 2.75, title: "업스트림", sub: "실제 API(선택)" },
  ];

  for (const b of boxes) {
    sFlow.addShape(ST.roundRect, {
      x: b.x,
      y,
      w: b.w,
      h,
      fill: boxFill,
      line: boxLine,
    });
    sFlow.addText(b.title, {
      x: b.x,
      y: y + 0.18,
      w: b.w,
      h: 0.38,
      fontSize: 15,
      bold: true,
      align: "center",
      color: "1E3A5F",
      ...ko,
    });
    sFlow.addText(b.sub, {
      x: b.x,
      y: y + 0.56,
      w: b.w,
      h: 0.38,
      fontSize: 11,
      align: "center",
      color: "555555",
      ...ko,
    });
  }

  const ay = y + h * 0.42;
  const arrows = [
    { x: 2.85, w: 0.62 },
    { x: 6.2, w: 0.62 },
    { x: 9.45, w: 0.55 },
  ];
  for (const a of arrows) {
    sFlow.addShape(ST.rightArrow, {
      x: a.x,
      y: ay,
      w: a.w,
      h: 0.28,
      fill: { color: "5B8FC7" },
      line: { color: "1E3A5F", width: 0.5 },
    });
  }

  sFlow.addShape(ST.roundRect, {
    x: 3.9,
    y: 3.55,
    w: 5.9,
    h: 0.95,
    fill: { color: "FFF8E6" },
    line: { color: "C49A00", width: 1 },
  });
  sFlow.addText("mock이 있으면 여기서 응답 종료 · 없으면 오른쪽 업스트림으로 프록시", {
    x: 4.0,
    y: 3.68,
    w: 5.7,
    h: 0.75,
    fontSize: 12,
    align: "center",
    valign: "middle",
    color: "5C4A00",
    ...ko,
  });

  const gw = pres.addSlide();
  gw.addText("게이트웨이를 쓰는 경우(포트·URL 고정)", {
    x: 0.5,
    y: 0.4,
    w: 12.3,
    h: 0.55,
    fontSize: 22,
    bold: true,
    color: "1E3A5F",
    ...ko,
  });
  gw.addText(
    [
      { text: "클라이언트는 항상 게이트웨이 포트만 호출합니다.", options: { fontSize: 14, bullet: true, ...ko } },
      { text: "게이트웨이가 모의 서버·업스트림으로 라우팅합니다. 세 포트가 서로 겹치면 안 됩니다.", options: { fontSize: 14, bullet: true, ...ko } },
    ],
    { x: 0.55, y: 1.05, w: 12.0, h: 1.15, valign: "top" },
  );

  const gy = 2.35;
  const gh = 1.0;
  gw.addShape(ST.roundRect, { x: 0.5, y: gy, w: 2.6, h: gh, fill: boxFill, line: boxLine });
  gw.addText("클라이언트", { x: 0.5, y: gy + 0.32, w: 2.6, h: 0.45, fontSize: 14, bold: true, align: "center", color: "1E3A5F", ...ko });

  gw.addShape(ST.rightArrow, { x: 3.2, y: gy + 0.36, w: 0.65, h: 0.28, fill: { color: "5B8FC7" }, line: boxLine });

  gw.addShape(ST.roundRect, { x: 3.95, y: gy, w: 2.85, h: gh, fill: { color: "F0E8FF" }, line: { color: "5E3A9E", width: 1 } });
  gw.addText("게이트웨이", { x: 3.95, y: gy + 0.25, w: 2.85, h: 0.4, fontSize: 14, bold: true, align: "center", color: "4A2C7A", ...ko });
  gw.addText("고정 URL/포트", { x: 3.95, y: gy + 0.58, w: 2.85, h: 0.35, fontSize: 11, align: "center", color: "5E3A9E", ...ko });

  gw.addShape(ST.rightArrow, { x: 6.95, y: gy + 0.36, w: 0.65, h: 0.28, fill: { color: "5B8FC7" }, line: boxLine });

  gw.addShape(ST.roundRect, { x: 7.75, y: gy, w: 2.55, h: gh, fill: boxFill, line: boxLine });
  gw.addText("모의 서버", { x: 7.75, y: gy + 0.32, w: 2.55, h: 0.45, fontSize: 14, bold: true, align: "center", color: "1E3A5F", ...ko });

  gw.addText("+", { x: 10.38, y: gy + 0.38, w: 0.35, h: 0.35, fontSize: 18, bold: true, align: "center", color: "666666" });

  gw.addShape(ST.roundRect, { x: 10.75, y: gy, w: 2.45, h: gh, fill: { color: "E8F8EF" }, line: { color: "2D6A4F", width: 1 } });
  gw.addText("업스트림", { x: 10.75, y: gy + 0.32, w: 2.45, h: 0.45, fontSize: 14, bold: true, align: "center", color: "1B4332", ...ko });

  /** @param {string} relName 파일명 */
  function addScreenshotSlide(title, caption, relName) {
    const abs = join(assetDir, relName);
    if (!existsSync(abs)) return;
    const imgSlide = pres.addSlide();
    imgSlide.addText(title, {
      x: 0.5,
      y: 0.4,
      w: 12.3,
      h: 0.5,
      fontSize: 20,
      bold: true,
      color: "1E3A5F",
      ...ko,
    });
    imgSlide.addImage({
      path: abs,
      x: 0.55,
      y: 1.0,
      w: 12.15,
      h: 5.85,
      sizing: { type: "contain", w: 12.15, h: 5.85 },
    });
    imgSlide.addText(caption, {
      x: 0.5,
      y: 6.95,
      w: 12.3,
      h: 0.45,
      fontSize: 11,
      color: "666666",
      ...ko,
    });
  }

  addScreenshotSlide(
    "참고: 화면 캡처(선택)",
    `스크린샷 PNG는 ${relPathForLog(assetDir)}/ 폴더에 두면 다음 실행부터 이 슬라이드에 포함됩니다.`,
    "프록시-설정-스크린샷.png",
  );
  addScreenshotSlide(
    "참고: 요청 흐름 캡처(선택)",
    "별도 다이어그램·문서 캡처를 넣을 수 있습니다.",
    "요청-흐름-스크린샷.png",
  );
}

/** 로그용: docs 기준 상대 경로 */
function relPathForLog(absAssetDir) {
  const rel = absAssetDir.replace(outDir + "/", "").replace(outDir + "\\", "");
  return `docs/${rel}`;
}


const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "DataForge (Proxy)";
pres.title = "DataForge 부서 발표";
pres.subject = "개인정보 보호 · 중요망 개발 · 오픈소스 대응";

cover(pres, "DataForge (Proxy)", "부서 발표 — 목업·프록시 기반 개발 환경과 보안 관점");

bullets(pres, "발표 목차", [
  "프로젝트 한 줄 요약",
  "프록시 서버 사용법(순서·흐름 도식·선택 스크린샷)",
  "① Git 저장소와 개인정보·더미 데이터 위험",
  "② 중요망(폐쇄망)에서의 개발 환경 — 크로스 플랫폼(Windows 포함)",
  "③ 오픈소스 취약점 대응 관점",
  "정리 및 논의",
]);

bullets(pres, "프로젝트 한 줄 요약", [
  "로컬 PC에서 API 응답(목업)을 저장·선택하고, 모의 HTTP 서버로 제공하는 데스크톱 도구입니다.",
  "필요 시 업스트림(실제 백엔드)과 게이트웨이(고정 URL/포트)를 조합해 화면·연동 검증이 가능합니다.",
  "Electron 기반이라 설치형 앱으로 배포할 수 있고, 브라우저만으로도 일부 기능을 쓸 수 있습니다.",
]);

proxyServerUsageSlides(pres, stakeholderAssetDir);

section(pres, "① 개인정보 · 더미 데이터");

callout(pres, "Git에 올라가는 더미 데이터의 위험", [
  "실서비스와 유사한 JSON·로그·스크린샷에 이름, 전화, 주민번호, 계좌, 내부 URL 등이 섞이기 쉽습니다.",
  "저장소가 public이거나 fork·이슈 첨부·CI 로그에 흔적이 남으면 되돌리기 어렵습니다(히스토리 영구 보존).",
  "규제·내부 정책(개인정보보호법, 내부 ISMS) 위반 및 신뢰 손실로 직결될 수 있습니다.",
]);

twoCol(
  pres,
  "왜 “Git에 더미”가 특히 위험한가",
  "흔한 실수",
  [
    "로컬에서 쓰던 responses.json을 그대로 커밋",
    "테스트용 실명·실번호를 복사해 넣은 뒤 push",
    "외부 클라이언트 설정에 내부 도메인·토큰 포함",
  ],
  "권장 방향",
  [
    "개인정보·식별자는 샘플 규칙으로 치환 후 저장",
    "민감 데이터는 Git이 아닌 내부 공유 드라이브·암호화 ZIP만",
    ".gitignore + 저장 전 스캔(시크릿 검출) 습관화",
  ],
);

bullets(pres, "DataForge가 도와줄 수 있는 점(보안 관점)", [
  "목업·프로젝트 데이터를 사용자 PC(userData) 쪽에 두고, Git에는 코드·비식별 샘플만 두는 흐름과 맞습니다.",
  "팀 단위로 “저장소에는 스키마만, 응답 본문은 각자 로컬에서 import” 운영 정책을 설명하기 좋습니다.",
]);

section(pres, "② 중요망 · 크로스 플랫폼");

bullets(pres, "중요망(폐쇄망)에서 개발 환경 구축", [
  "외부 SaaS·클라우드 없이도 로컬에서 모의 서버·게이트웨이·업스트림을 구성할 수 있습니다.",
  "DMZ/내부망 정책에 맞게 설치 패키지(MSI/EXE, DMG/ZIP)만 반입하면 됩니다.",
  "API URL·포트가 고정된 레거시 클라이언트는 게이트웨이로 중간 수신 포트만 맞추는 패턴을 지원합니다.",
]);

bullets(pres, "크로스 플랫폼 — Windows에서도 사용 가능", [
  "Electron + electron-builder로 Windows·macOS·Linux 빌드 타깃을 둘 수 있습니다.",
  "동일한 UI/기능으로 부서 내 PC 환경이 달라도 같은 도구를 쓸 수 있습니다.",
  "업스트림 자동 실행은 Windows에서 NVM_HOME·nodejs 경로 등을 고려해 Node를 찾도록 구성할 수 있습니다.",
]);

section(pres, "③ 오픈소스 취약점 대응");

bullets(pres, "오픈소스 취약점 대응이 수월한 이유", [
  "의존성은 package.json / lockfile로 고정되어 있어 SBOM·스캐너 입력으로 쓰기 좋습니다.",
  "앱 내 라이선스 페이지·npm run licenses 로 서드파티 목록을 문서화할 수 있습니다.",
  "중요망에서는 외부 패키지 미러(npmmirror 등)만 허용하고, 검증된 버전으로만 빌드하는 절차와 맞물립니다.",
  "취약점 발표 시: 해당 버전 상향·패치 PR → 재빌드·내부 배포로 대응 경로가 단순합니다.",
]);

twoCol(
  pres,
  "정리 — 부장님·팀원께 전달할 메시지",
  "리스크 인식",
  [
    "Git + 더미 = 개인정보 유출·규정 위반 리스크가 현실적입니다.",
    "도구만으로 막을 수는 없고, 운영 규칙과 함께 가야 합니다.",
  ],
  "도입 가치",
  [
    "중요망에서도 로컬 목업·연동 검증 환경을 빠르게 갖출 수 있습니다.",
    "Windows 포함 동일 경험, 오픈소스 거버넌스와도 잘 맞습니다.",
  ],
);

bullets(pres, "다음 단계(논의)", [
  "팀 표준: Git에 올릴 수 있는 데이터 범위·샘플 작성 가이드 확정",
  "내부 배포: 서명·공증(Gatekeeper) 요구 여부",
  "상세 사용법: docs/DataForge-프로젝트-개요-및-사용법.pptx (npm run docs:project-overview-ppt)",
  "발표용 스크린샷: docs/ppt-assets-stakeholder/ 에 PNG를 두고 npm run docs:stakeholder-ppt 재실행",
]);

bullets(pres, "이 PPT 파일 생성 방법", [
  "프로젝트 루트에서: npm run docs:stakeholder-ppt",
  `출력 파일: docs/DataForge-부서발표-개요.pptx`,
]);

mkdirSync(outDir, { recursive: true });
mkdirSync(stakeholderAssetDir, { recursive: true });
await pres.writeFile({ fileName: outFile });

console.log(`작성 완료: ${outFile}`);

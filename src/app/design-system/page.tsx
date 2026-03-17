"use client";

import Header from "@/components/shared/Header";
import Btn from "@/components/common/Btn";
import palette from "@/styles/palette";

// const PAGE_BG = "bg-[#202123]";
const CARD_CLASS = "rounded-4 bg-white p-6";

/* ----- Spacing (이미지 규격: spacing-0~14, 2,4,8...64px) ----- */
const SPACING_VALUES = [0, 2, 4, 8, 12, 16, 20, 24, 32, 36, 40, 48, 52, 56, 64] as const;
const spacingTokens = SPACING_VALUES.map((px, i) => ({ token: `spacing-${i}`, value: `${px}px` }));

/* ----- Semantic colors (Background, Border, Label) ----- */
const semanticBackground = [
  { token: "background-primary", value: "blue-500", class: "bg-background-primary" },
  { token: "background-primary-hover", value: "blue-600", class: "bg-background-primary-hover" },
  { token: "background-primary-weak", value: "blue-50", class: "bg-background-primary-weak" },
  { token: "background-secondary", value: "gray-800", class: "bg-background-secondary" },
  { token: "background-secondary-hover", value: "gray-900", class: "bg-background-secondary-hover" },
  { token: "background-secondary-weak", value: "gray-50", class: "bg-background-secondary-weak" },
  { token: "background-white", value: "common-white", class: "bg-background-white border border-gray-200" },
  { token: "background-gray", value: "gray-100", class: "bg-background-gray" },
  { token: "background-negative", value: "red-500", class: "bg-background-negative" },
  { token: "background-negative-hover", value: "red-600", class: "bg-background-negative-hover" },
  { token: "background-negative-weak", value: "red-50", class: "bg-background-negative-weak" },
];
const semanticBorder = [
  { token: "border-primary", value: "blue-500", class: "bg-border-primary" },
  { token: "border-focused", value: "gray-800", class: "bg-border-focused" },
  { token: "border-enabled", value: "gray-300", class: "bg-border-enabled" },
  { token: "border-weak", value: "gray-100", class: "bg-border-week" },
  { token: "border-negative", value: "red-500", class: "bg-border-negative" },
];
const semanticLabel = [
  { token: "label-strong", value: "common-black", class: "bg-label-strong" },
  { token: "label-normal", value: "gray-900", class: "bg-label-normal" },
  { token: "label-neutral", value: "gray-700", class: "bg-label-neutral" },
  { token: "label-assistant", value: "gray-500", class: "bg-label-assistant" },
  { token: "label-disabled", value: "gray-200", class: "bg-label-disabled" },
  { token: "label-primary", value: "blue-500", class: "bg-label-primary" },
  { token: "label-common", value: "common-white", class: "bg-label-common border border-gray-200" },
  { token: "label-negative", value: "red-500", class: "bg-label-negative" },
];

/* ----- Border radius (rounded-0~10, 0,2,4,6,8,12,16,20,24,28,32) ----- */
const RADIUS_VALUES = [0, 2, 4, 6, 8, 12, 16, 20, 24, 28, 32] as const;
const radiusTokens = RADIUS_VALUES.map((px, i) => ({ token: `rounded-${i}`, value: `${px}px` }));
const radiusClass: Record<number, string> = {
  0: "rounded-0",
  1: "rounded-1",
  2: "rounded-2",
  3: "rounded-3",
  4: "rounded-4",
  5: "rounded-5",
  6: "rounded-6",
  7: "rounded-7",
  8: "rounded-8",
  9: "rounded-9",
  10: "rounded-10",
};

/* ----- Border width ----- */
const BORDER_VALUES = [0, 1, 2, 4] as const;
const borderTokens = BORDER_VALUES.map((px, i) => ({ token: `border-${i}`, value: `${px}px` }));

/* ----- Typography usage (typo-* + 예시) ----- */
const typoUsage = [
  { token: "typo-display-1", class: "typo-display-1", sample: "Display 1" },
  { token: "typo-title-1", class: "typo-title-1", sample: "Title 1" },
  { token: "typo-heading-1", class: "typo-heading-1", sample: "Heading 1" },
  { token: "typo-body-2-normal", class: "typo-body-2-normal", sample: "Body 2 Normal" },
  { token: "typo-caption-1", class: "typo-caption-1", sample: "Caption 1" },
];

/* ----- Table 공통 ----- */
function TokenTable({ rows }: { rows: { token: string; value: string }[] }) {
  return (
    <table className="typo-caption-1 w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-gray-200">
          <th className="text-label-normal py-2 font-semibold">Token</th>
          <th className="text-label-normal py-2 font-semibold">Value</th>
          <th className="text-label-normal py-2 font-semibold">Version</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.token} className="border-b border-gray-100">
            <td className="text-label-normal py-2">{r.token}</td>
            <td className="text-label-assistant py-2">{r.value}</td>
            <td className="text-label-assistant py-2">v1.0</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ----- Semantic swatch (이름 + 값 레퍼런스) ----- */
function SemanticSwatch({ token, valueRef, className }: { token: string; valueRef: string; className: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className={`rounded-2 h-12 w-20 ${className}`} title={token} />
      <span className="typo-caption-1 text-label-normal font-medium">{token}</span>
      <span className="typo-caption-2 text-label-assistant">{valueRef}</span>
    </div>
  );
}

/* ----- Palette card (이름 + hex) ----- */
function PaletteCard({ title, items }: { title: string; items: { name: string; hex: string; bgClass: string }[] }) {
  return (
    <div className={CARD_CLASS}>
      <h3 className="typo-heading-1 text-label-normal mb-4">{title}</h3>
      <div className="flex flex-wrap gap-4">
        {items.map((item) => (
          <div key={item.name} className="flex flex-col gap-1">
            <div className={`rounded-2 h-12 w-20 border border-gray-200 ${item.bgClass}`} />
            <span className="typo-caption-1 text-label-normal">{item.name}</span>
            <span className="typo-caption-2 text-label-assistant">{item.hex}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DesignSystemPage() {
  const paletteCommon = [
    { name: "black", hex: palette.common.black, bgClass: "bg-gray-900" },
    { name: "white", hex: palette.common.white, bgClass: "bg-white border border-gray-200" },
  ];
  const grayClasses: Record<string, string> = {
    "50": "bg-gray-50",
    "100": "bg-gray-100",
    "200": "bg-gray-200",
    "300": "bg-gray-300",
    "400": "bg-gray-400",
    "500": "bg-gray-500",
    "600": "bg-gray-600",
    "700": "bg-gray-700",
    "800": "bg-gray-800",
    "900": "bg-gray-900",
  };
  const blueClasses: Record<string, string> = {
    "50": "bg-blue-50",
    "100": "bg-blue-100",
    "200": "bg-blue-200",
    "300": "bg-blue-300",
    "400": "bg-blue-400",
    "500": "bg-blue-500",
    "600": "bg-blue-600",
    "700": "bg-blue-700",
    "800": "bg-blue-800",
    "900": "bg-blue-900",
  };
  const redClasses: Record<string, string> = {
    "50": "bg-red-50",
    "100": "bg-red-100",
    "200": "bg-red-200",
    "300": "bg-red-300",
    "400": "bg-red-400",
    "500": "bg-red-500",
    "600": "bg-red-600",
    "700": "bg-red-700",
    "800": "bg-red-800",
    "900": "bg-red-900",
  };
  const orangeClasses: Record<string, string> = {
    "50": "bg-orange-50",
    "100": "bg-orange-100",
    "200": "bg-orange-200",
    "300": "bg-orange-300",
    "400": "bg-orange-400",
    "500": "bg-orange-500",
    "600": "bg-orange-600",
    "700": "bg-orange-700",
    "800": "bg-orange-800",
    "900": "bg-orange-900",
  };
  const paletteGray = Object.entries(palette.gray).map(([k, v]) => ({
    name: `gray-${k}`,
    hex: v,
    bgClass: grayClasses[k] ?? "bg-gray-100",
  }));
  const paletteBlue = Object.entries(palette.blue).map(([k, v]) => ({
    name: `blue-${k}`,
    hex: v,
    bgClass: blueClasses[k] ?? "bg-blue-100",
  }));
  const paletteRed = Object.entries(palette.red).map(([k, v]) => ({
    name: `red-${k}`,
    hex: v,
    bgClass: redClasses[k] ?? "bg-red-100",
  }));
  const paletteOrange = Object.entries(palette.orange).map(([k, v]) => ({
    name: `orange-${k}`,
    hex: v,
    bgClass: orangeClasses[k] ?? "bg-orange-100",
  }));

  return (
    <>
      <Header title="Design System" onCreateProject={() => {}} />
      <div className={`min-h-screen px-6 py-8`}>
        <div className="mx-auto w-full max-w-[1200px] space-y-10">
          {/* ---------- SPACING ---------- */}
          <section className={CARD_CLASS}>
            <div className="mb-2 flex items-start justify-between gap-4">
              <div>
                <h2 className="typo-title-3 text-label-normal">SPACING</h2>
                <p className="typo-body-2-normal text-label-assistant mt-1">
                  규격화된 간격을 사용해 안정적이고 일관된 구성을 돕습니다.
                </p>
              </div>
              <span className="typo-caption-1 text-label-assistant shrink-0">*Token Kebab 표기법으로 사용</span>
            </div>
            <h3 className="typo-heading-1 text-label-normal mt-6 mb-2">SIZE UNIT</h3>
            <p className="typo-body-2-normal text-label-assistant mb-4">
              8의 배수를 기반으로 8의 배수가 포함하고 있는 2와 4의 배수도 함께 사용합니다. 화면에 적용되는 간격은 종횡
              구분 없이 해당 규칙을 따르는 것을 권장합니다.
            </p>
            <div className="mb-6 flex flex-wrap items-end gap-4">
              {SPACING_VALUES.filter((px) => px > 0).map((px) => (
                <div key={px} className="flex flex-col items-center gap-2">
                  <div className="bg-blue-300" style={{ width: Math.max(px, 4), height: 24 }} />
                  <span className="typo-caption-1 text-label-assistant">{px}px</span>
                </div>
              ))}
            </div>
            <TokenTable rows={spacingTokens} />
          </section>

          {/* ---------- Semantic Color (Background, Border, Label) ---------- */}
          <section className="space-y-4">
            <h2 className="typo-title-3 text-white">Semantic Color</h2>
            <div className={CARD_CLASS}>
              <h3 className="typo-heading-1 text-label-normal mb-4">Background</h3>
              <div className="flex flex-wrap gap-6">
                {semanticBackground.map((s) => (
                  <SemanticSwatch key={s.token} token={s.token} valueRef={s.value} className={s.class} />
                ))}
              </div>
            </div>
            <div className={CARD_CLASS}>
              <h3 className="typo-heading-1 text-label-normal mb-4">Border</h3>
              <div className="flex flex-wrap gap-6">
                {semanticBorder.map((s) => (
                  <SemanticSwatch key={s.token} token={s.token} valueRef={s.value} className={s.class} />
                ))}
              </div>
            </div>
            <div className={CARD_CLASS}>
              <h3 className="typo-heading-1 text-label-normal mb-4">Label</h3>
              <div className="flex flex-wrap gap-6">
                {semanticLabel.map((s) => (
                  <SemanticSwatch key={s.token} token={s.token} valueRef={s.value} className={s.class} />
                ))}
              </div>
            </div>
          </section>

          {/* ---------- Palette (Common, Gray, Blue, Red, Orange) ---------- */}
          <section className="space-y-4">
            <h2 className="typo-title-3 text-white">Palette</h2>
            <PaletteCard title="Common" items={paletteCommon} />
            <PaletteCard title="Gray" items={paletteGray} />
            <PaletteCard title="Blue" items={paletteBlue} />
            <PaletteCard title="Red" items={paletteRed} />
            <PaletteCard title="Orange" items={paletteOrange} />
          </section>

          {/* ---------- OBJECT STYLE (Border Radius, Border) ---------- */}
          <section className={CARD_CLASS}>
            <h2 className="typo-title-3 text-label-normal">OBJECT STYLE</h2>
            <p className="typo-body-2-normal text-label-assistant mt-1">
              Button, Input 등 화면에서 사용되는 컴포넌트의 Container를 구성하는 Border Radius, Border 값을 규격화하여
              안정적이고 일관된 구성을 돕습니다.
            </p>
            <span className="typo-caption-1 text-label-assistant mt-2 block">* Token 명은 Kebab 표기법으로 사용</span>

            <h3 className="typo-heading-1 text-label-normal mt-8 mb-2">BORDER RADIUS</h3>
            <p className="typo-body-2-normal text-label-assistant mb-4">
              시각적으로 일관된 화면을 구성하기 위해 Border Radius 값을 아래와 같이 규정하고, 디자인 요소들의 Border
              Radius는 가능한 아래의 규칙을 따라 적용할 것을 권장합니다.
            </p>
            <div className="mb-6 flex flex-wrap gap-6">
              {RADIUS_VALUES.map((px, idx) => (
                <div key={px} className="flex flex-col items-center gap-2">
                  <div className={`h-16 w-20 bg-gray-200 ${radiusClass[idx]}`} />
                  <span className="typo-caption-1 text-label-assistant">{px}px</span>
                </div>
              ))}
            </div>
            <TokenTable rows={radiusTokens} />

            <h3 className="typo-heading-1 text-label-normal mt-8 mb-2">BORDER</h3>
            <p className="typo-body-2-normal text-label-assistant mb-4">
              시각적으로 일관된 화면을 구성하기 위해 Border Width 값을 아래와 같이 규정하고, 디자인 요소들의 Border
              Width는 가능한 아래의 규칙을 따라 적용할 것을 권장합니다.
            </p>
            <div className="mb-6 flex flex-wrap gap-6">
              {BORDER_VALUES.map((px) => (
                <div key={px} className="flex flex-col items-center gap-2">
                  <div
                    className="h-10 w-32 bg-white"
                    style={{ borderWidth: px, borderStyle: "solid", borderColor: "#d4d4d4" }}
                  />
                  <span className="typo-caption-1 text-label-assistant">{px}px</span>
                </div>
              ))}
            </div>
            <TokenTable rows={borderTokens} />
          </section>

          {/* ---------- TYPOGRAPHY ---------- */}
          <section className={CARD_CLASS}>
            <h2 className="typo-title-3 text-label-normal">TYPOGRAPHY</h2>
            <p className="typo-body-2-normal text-label-assistant mt-1">
              영문은 Pretendard Regular, Medium, SemiBold 서체를 사용합니다. 국문은 프리텐다드 Regular, Medium, SemiBold
              서체를 사용합니다.
            </p>
            <h3 className="typo-heading-1 text-label-normal mt-6 mb-2">FONT</h3>
            <p className="typo-body-2-normal text-label-assistant">
              Pretendard Regular, Medium, SemiBold (영문 / 국문 공통)
            </p>
            <h3 className="typo-heading-1 text-label-normal mt-6 mb-2">USAGE</h3>
            <div className="space-y-3">
              {typoUsage.map((t) => (
                <div key={t.token} className="flex flex-wrap items-baseline gap-4 border-b border-gray-100 pb-2">
                  <span className="typo-caption-1 text-label-assistant w-40 shrink-0">{t.token}</span>
                  <span className={`${t.class} text-label-normal`}>{t.sample}</span>
                </div>
              ))}
            </div>
            <h3 className="typo-heading-1 text-label-normal mt-6 mb-2">TEXT COLOR</h3>
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-1">
                <div className="rounded-2 bg-label-normal h-10 w-20" />
                <span className="typo-caption-1 text-label-assistant">label-normal #222222</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="rounded-2 bg-label-neutral h-10 w-20" />
                <span className="typo-caption-1 text-label-assistant">label-neutral #666666</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="rounded-2 bg-label-assistant h-10 w-20" />
                <span className="typo-caption-1 text-label-assistant">label-assistant #999999</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="rounded-2 bg-label-primary h-10 w-20 border border-gray-200" />
                <span className="typo-caption-1 text-label-assistant">label-primary #0057FF</span>
              </div>
            </div>
          </section>

          {/* ---------- Button ---------- */}
          <section className={CARD_CLASS}>
            <h2 className="typo-title-3 text-label-normal">Button</h2>
            <p className="typo-body-2-normal text-label-assistant mt-1">
              2차 행동을 유도하거나, 상태를 표현하는 데 사용합니다.
            </p>
            <h3 className="typo-heading-1 text-label-normal mt-6 mb-3">타입 (Type)</h3>
            <div className="mb-8 flex flex-wrap gap-4">
              <Btn category="primary" size="medium">
                Label
              </Btn>
              <Btn category="secondary" size="medium">
                Label
              </Btn>
              <Btn category="primary" variant size="medium">
                Label
              </Btn>
              <Btn category="secondary" variant size="medium">
                Label
              </Btn>
            </div>
            <h3 className="typo-heading-1 text-label-normal mb-3">사이즈 (Size)</h3>
            <div className="mb-8 flex flex-wrap items-center gap-4">
              <Btn category="primary" size="small">
                Label
              </Btn>
              <Btn category="primary" size="medium">
                Label
              </Btn>
              <Btn category="primary" size="large">
                Label
              </Btn>
            </div>
            <h3 className="typo-heading-1 text-label-normal mb-3">상태 (Status)</h3>
            <div className="flex flex-wrap gap-4">
              <Btn category="primary" size="medium">
                Default
              </Btn>
              <Btn category="primary" size="medium" disabled>
                Disabled
              </Btn>
            </div>
            <h3 className="typo-heading-1 text-label-normal mt-6 mb-3">아이콘 (Icon)</h3>
            <div className="flex flex-wrap items-center gap-4">
              <Btn category="primary" size="medium">
                Label
              </Btn>
              <Btn category="primary" size="medium" startIcon={<PlusIcon />}>
                Left
              </Btn>
              <Btn category="primary" size="medium" endIcon={<PlusIcon />}>
                Right
              </Btn>
            </div>
            <h3 className="typo-heading-1 text-label-normal mt-6 mb-3">Component</h3>
            <div className="rounded-4 flex flex-wrap gap-3 border-2 border-dashed border-gray-200 p-4">
              <Btn category="primary" size="small" startIcon={<PlusIcon />}>
                {""}
              </Btn>
              <Btn category="primary" size="medium" startIcon={<PlusIcon />}>
                {""}
              </Btn>
              <Btn category="primary" size="large" startIcon={<PlusIcon />}>
                {""}
              </Btn>
              <Btn category="secondary" size="medium">
                Label
              </Btn>
              <Btn category="primary" variant size="medium">
                Label
              </Btn>
            </div>
          </section>

          {/* ---------- Icon Button ---------- */}
          <section className={CARD_CLASS}>
            <h2 className="typo-title-3 text-label-normal">Icon Button</h2>
            <p className="typo-body-2-normal text-label-assistant mt-1">
              아이콘을 버튼으로 사용해야 할 경우 사용합니다.
            </p>
            <h3 className="typo-heading-1 text-label-normal mt-6 mb-3">카테고리 (Category)</h3>
            <div className="mb-8 flex flex-wrap items-center gap-6">
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  className="cn-center bg-background-primary h-10 w-10 rounded-full"
                  aria-label="Solid"
                >
                  <PlusIcon className="text-label-common" />
                </button>
                <span className="typo-caption-1 text-label-assistant">Solid</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  className="cn-center h-10 w-10 rounded-full border-2 border-gray-300 bg-white"
                  aria-label="Outlined"
                >
                  <PlusIcon className="text-label-neutral" />
                </button>
                <span className="typo-caption-1 text-label-assistant">Outlined</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <button type="button" className="cn-center h-10 w-10 rounded-full hover:bg-gray-100" aria-label="Clear">
                  <PlusIcon className="text-label-neutral" />
                </button>
                <span className="typo-caption-1 text-label-assistant">Clear</span>
              </div>
            </div>
            <h3 className="typo-heading-1 text-label-normal mb-3">크기 (Size)</h3>
            <div className="mb-8 flex flex-wrap items-end gap-6">
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  className="cn-center bg-background-primary h-7 w-7 rounded-full"
                  aria-label="Small"
                >
                  <PlusIcon className="text-label-common h-3 w-3" />
                </button>
                <span className="typo-caption-1 text-label-assistant">Small (28px)</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  className="cn-center bg-background-primary h-8 w-8 rounded-full"
                  aria-label="Medium"
                >
                  <PlusIcon className="text-label-common h-4 w-4" />
                </button>
                <span className="typo-caption-1 text-label-assistant">Medium (32px)</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  className="cn-center bg-background-primary h-10 w-10 rounded-full"
                  aria-label="Large"
                >
                  <PlusIcon className="text-label-common" />
                </button>
                <span className="typo-caption-1 text-label-assistant">Large (40px)</span>
              </div>
            </div>
            <h3 className="typo-heading-1 text-label-normal mb-3">상태 (State)</h3>
            <div className="flex flex-wrap gap-6">
              <button
                type="button"
                className="cn-center bg-background-primary h-10 w-10 rounded-full"
                aria-label="Enabled"
              >
                <PlusIcon className="text-label-common" />
              </button>
              <button
                type="button"
                className="cn-center bg-background-primary-hover h-10 w-10 rounded-full"
                aria-label="Hover"
              >
                <PlusIcon className="text-label-common" />
              </button>
              <button
                type="button"
                className="cn-center h-10 w-10 cursor-not-allowed rounded-full bg-gray-200 opacity-50"
                aria-label="Disabled"
                disabled
              >
                <PlusIcon className="text-label-assistant" />
              </button>
            </div>
            <h3 className="typo-heading-1 text-label-normal mt-6 mb-3">Component</h3>
            <div className="rounded-4 flex flex-wrap gap-3 border-2 border-dashed border-gray-200 p-4">
              <button type="button" className="cn-center bg-background-primary h-7 w-7 rounded-full" aria-label="icon">
                <PlusIcon className="text-label-common h-3 w-3" />
              </button>
              <button type="button" className="cn-center bg-background-primary h-8 w-8 rounded-full" aria-label="icon">
                <PlusIcon className="text-label-common h-4 w-4" />
              </button>
              <button
                type="button"
                className="cn-center bg-background-primary h-10 w-10 rounded-full"
                aria-label="icon"
              >
                <PlusIcon className="text-label-common" />
              </button>
              <button
                type="button"
                className="cn-center h-10 w-10 rounded-full border-2 border-gray-300 bg-white"
                aria-label="icon"
              >
                <PlusIcon className="text-label-neutral" />
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function PlusIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
    </svg>
  );
}

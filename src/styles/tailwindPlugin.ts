const pxToRem = (px: number) => {
  return `${px / 16}rem`;
};

// tailwind @apply 사용하는 문법으로 변환하는 util 함수
const apply = (className: string, styles?: object) => {
  return { [`@apply ${className}`]: {}, ...styles };
};

const addPrefix = (data: any, prefix: string) => {
  for (const property in data) {
    delete Object.assign(data, { [`.${prefix}-${property}`]: data[property] })[property];
  }
};

const lineHeight = {
  "14": { lineHeight: pxToRem(14) },
  "16": { lineHeight: pxToRem(16) },
  "18": { lineHeight: pxToRem(18) },
  "20": { lineHeight: pxToRem(20) },
  "22": { lineHeight: pxToRem(22) },
  "24": { lineHeight: pxToRem(24) },
  "26": { lineHeight: pxToRem(26) },
  "28": { lineHeight: pxToRem(28) },
  "32": { lineHeight: pxToRem(32) },
  "36": { lineHeight: pxToRem(36) },
  "40": { lineHeight: pxToRem(40) },
  "48": { lineHeight: pxToRem(48) },
  "52": { lineHeight: pxToRem(52) },
  "56": { lineHeight: pxToRem(56) },
  "64": { lineHeight: pxToRem(64) },
  "72": { lineHeight: pxToRem(72) },
};

const fontSize = {
  "10": { fontSize: pxToRem(10) },
  "12": { fontSize: pxToRem(12) },
  "14": { fontSize: pxToRem(14) },
  "16": { fontSize: pxToRem(16) },
  "18": { fontSize: pxToRem(18) },
  "20": { fontSize: pxToRem(20) },
  "24": { fontSize: pxToRem(24) },
  "28": { fontSize: pxToRem(28) },
  "32": { fontSize: pxToRem(32) },
  "36": { fontSize: pxToRem(36) },
  "40": { fontSize: pxToRem(40) },
  "48": { fontSize: pxToRem(48) },
  "52": { fontSize: pxToRem(52) },
  "56": { fontSize: pxToRem(56) },
};

const typo = {
  "display-1": apply("font-size-56 line-height-72 -tracking-[0.5104px]"),
  "display-2": apply("font-size-40 line-height-52 -tracking-[0.4512px]"),
  "title-1": apply("font-size-36 line-height-48 -tracking-[0.432px]"),
  "title-2": apply("font-size-28 line-height-40 -tracking-[0.3776px]"),
  "title-3": apply("font-size-24 line-height-32 -tracking-[0.368px]"),
  "heading-1": apply("font-size-20 line-height-28 -tracking-[0.192px]"),
  "heading-2": apply("font-size-18 line-height-26 -tracking-[0.032px]"),
  "body-1-normal": apply("font-size-16 line-height-24 tracking-[0.0912px]"),
  "body-1-reading": apply("font-size-16 line-height-26 tracking-[0.0912px]"),
  "body-2-normal": apply("font-size-14 line-height-20 tracking-[0.232px]"),
  "body-2-reading": apply("font-size-14 line-height-22 tracking-[0.232px]"),
  "caption-1": apply("font-size-12 line-height-16 tracking-[0.4032px]"),
  "caption-2": apply("font-size-10 line-height-14 tracking-[0.4976px]"),
};

const proxy = {
  center: apply("flex items-center justify-center"),
  between: apply("flex items-center justify-between"),
  "modal-header": apply("px-7 py-6 typo-heading-1 font-semibold h-12 text-neutral-800"),
  "modal-body": apply("px-7 py-5 break-words"),
  "modal-footer": apply("p-7 typo-body-2-normal font-medium h-[96px]"),
};

addPrefix(typo, "typo");
addPrefix(proxy, "proxy");
addPrefix(lineHeight, "line-height");
addPrefix(fontSize, "font-size");

const customComponents = {
  ...typo,
  ...proxy,
  ...lineHeight,
  ...fontSize,
};

export { customComponents };

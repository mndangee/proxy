/**
 * Care `Sfd.module.js` 내 `interfaces` 항목에서 tranId·desc 추출.
 * `key: { tranId: '...', desc: '...' [, 추가필드] }` 형태를 가정.
 * (프로젝트/JSON 가져오기 시 응답 본문에서도 동일 패턴을 스캔해 API 이름·설명에 반영.)
 */

export type SfdCareInterface = { key: string; tranId: string; desc: string };

/** proxy·Sfd 간 tranId 비교용 (공백·NBSP 정리 후 대문자 통일) */
export function normalizeTranIdKey(s: string): string {
  return s
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function unescapeJsString(s: string): string {
  return s.replace(/\\([\s\S])/g, (_, ch: string) => ch);
}

/** 동일 tranId(정규화)는 먼저 나온 항목만 유지 */
function mergeByTranIdFirstWins(entries: SfdCareInterface[]): SfdCareInterface[] {
  const seen = new Set<string>();
  const out: SfdCareInterface[] = [];
  for (const e of entries) {
    const n = normalizeTranIdKey(e.tranId);
    if (!n || !e.key.trim()) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(e);
  }
  return out;
}

/** `{ "callName": { "tranId": "VD.x", "desc": "…" } }` 최상위 객체 */
function parseTopLevelJsonInterfaces(source: string): SfdCareInterface[] {
  const t = source.trim();
  if (!t.startsWith("{")) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(t) as unknown;
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [];
  const rootObj = parsed as Record<string, unknown>;
  let iter: Record<string, unknown> = rootObj;
  if (
    Object.keys(rootObj).length === 1 &&
    rootObj.interfaces != null &&
    typeof rootObj.interfaces === "object" &&
    !Array.isArray(rootObj.interfaces)
  ) {
    iter = rootObj.interfaces as Record<string, unknown>;
  }
  const out: SfdCareInterface[] = [];
  for (const [k, v] of Object.entries(iter)) {
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const o = v as Record<string, unknown>;
    const tranIdRaw = o.tranId ?? o.tran_id;
    if (typeof tranIdRaw !== "string") continue;
    const tranId = tranIdRaw.trim();
    if (!tranId) continue;
    const key = k.trim();
    if (!key) continue;
    const descRaw = o.desc ?? o.description;
    const desc = typeof descRaw === "string" ? descRaw.trim() : "";
    out.push({ key, tranId, desc });
  }
  return out;
}

function parseTranFirstJsPattern(source: string): SfdCareInterface[] {
  const out: SfdCareInterface[] = [];
  const re =
    /(\b[a-zA-Z_$][\w$]*)\s*:\s*\{\s*tranId\s*:\s*(['"])((?:\\.|(?!\2).)*?)\2\s*,\s*desc\s*:\s*(['"])((?:\\.|(?!\4).)*?)\4/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    out.push({
      key: m[1],
      tranId: unescapeJsString(m[3]),
      desc: unescapeJsString(m[5]),
    });
  }
  return out;
}

function parseDescFirstJsPattern(source: string): SfdCareInterface[] {
  const out: SfdCareInterface[] = [];
  const re =
    /(\b[a-zA-Z_$][\w$]*)\s*:\s*\{\s*desc\s*:\s*(['"])((?:\\.|(?!\2).)*?)\2\s*,\s*tranId\s*:\s*(['"])((?:\\.|(?!\4).)*?)\4/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    out.push({
      key: m[1],
      tranId: unescapeJsString(m[5]),
      desc: unescapeJsString(m[3]),
    });
  }
  return out;
}

/**
 * 소스 전체를 스캔해 interfaces 엔트리 목록 반환.
 * - 최상위 JSON 객체(tranId/desc)
 * - JS 리터럴 `key: { tranId, desc }` / `key: { desc, tranId }`
 */
export function parseSfdModuleInterfaces(source: string): SfdCareInterface[] {
  const chunks: SfdCareInterface[] = [
    ...parseTopLevelJsonInterfaces(source),
    ...parseTranFirstJsPattern(source),
    ...parseDescFirstJsPattern(source),
  ];
  return mergeByTranIdFirstWins(chunks);
}

/**
 * 동일 tranId(정규화 기준)가 여러 key에 있으면 파일에서 먼저 나온 항목만 사용.
 * 조회는 원문·정규화 키 모두 등록해 대소문자·공백 차이를 흡수.
 */
export function buildCareTranLookup(entries: SfdCareInterface[]): Map<string, SfdCareInterface> {
  const logicalFirst = new Map<string, SfdCareInterface>();
  for (const e of entries) {
    const n = normalizeTranIdKey(e.tranId);
    if (!n) continue;
    if (!logicalFirst.has(n)) logicalFirst.set(n, e);
  }
  const lookup = new Map<string, SfdCareInterface>();
  for (const e of logicalFirst.values()) {
    const raw = e.tranId.trim();
    const norm = normalizeTranIdKey(e.tranId);
    for (const k of new Set([raw, norm].filter((x) => x.length > 0))) {
      if (!lookup.has(k)) lookup.set(k, e);
    }
  }
  return lookup;
}

/** proxy 행의 트랜(`tran`) 또는 API이름(`name`)이 care `tranId`와 맞으면 해당 SFD 항목 반환 */
export function findCareForProxyApi(
  lookup: Map<string, SfdCareInterface>,
  row: { tran: string; name: string },
): SfdCareInterface | undefined {
  for (const candidate of [row.tran, row.name]) {
    const v = candidate.trim();
    if (!v) continue;
    const care = lookup.get(v) ?? lookup.get(normalizeTranIdKey(v));
    if (care) return care;
  }
  return undefined;
}

#!/usr/bin/env node
/**
 * Care Sfd.module.js의 interfaces와 프로젝트 디스크 데이터(apis/index.json, apis/responses-store.json)를 맞춤.
 * 로직은 src/libs/care/sfdModuleInterfaces.ts 및 project-fs sync와 동일하게 유지할 것.
 *
 * 사용:
 *   node scripts/apply-care-sfd-to-project.mjs <프로젝트폴더> <Sfd.module.js 절대경로>
 * 예:
 *   node scripts/apply-care-sfd-to-project.mjs \
 *     "$HOME/Library/Application Support/proxy/DataForge-projects/mobility" \
 *     "$HOME/git/care/common/core/Sfd.module.js"
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function unescapeJsString(s) {
  return s.replace(/\\([\s\S])/g, (_, ch) => ch);
}

function normalizeTranIdKey(s) {
  return s
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function parseSfdModuleInterfaces(source) {
  const out = [];
  const re =
    /(\b[a-zA-Z_$][\w$]*)\s*:\s*\{\s*tranId\s*:\s*(['"])((?:\\.|(?!\2).)*?)\2\s*,\s*desc\s*:\s*(['"])((?:\\.|(?!\4).)*?)\4/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    out.push({
      key: m[1],
      tranId: unescapeJsString(m[3]),
      desc: unescapeJsString(m[5]),
    });
  }
  return out;
}

function buildCareTranLookup(entries) {
  const logicalFirst = new Map();
  for (const e of entries) {
    const n = normalizeTranIdKey(e.tranId);
    if (!n) continue;
    if (!logicalFirst.has(n)) logicalFirst.set(n, e);
  }
  const lookup = new Map();
  for (const e of logicalFirst.values()) {
    const raw = e.tranId.trim();
    const norm = normalizeTranIdKey(e.tranId);
    for (const k of new Set([raw, norm].filter((x) => x.length > 0))) {
      if (!lookup.has(k)) lookup.set(k, e);
    }
  }
  return lookup;
}

function findCareForProxyApi(lookup, row) {
  for (const candidate of [row.tran, row.name]) {
    const v = String(candidate ?? "").trim();
    if (!v) continue;
    const care = lookup.get(v) ?? lookup.get(normalizeTranIdKey(v));
    if (care) return care;
  }
  return undefined;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function main() {
  const projectRoot = process.argv[2]?.trim();
  const sfdPath = process.argv[3]?.trim();
  if (!projectRoot || !sfdPath) {
    console.error("사용: node scripts/apply-care-sfd-to-project.mjs <프로젝트폴더> <Sfd.module.js>");
    process.exit(1);
  }

  const indexPath = join(projectRoot, "apis", "index.json");
  const storePath = join(projectRoot, "apis", "responses-store.json");

  const sfdText = readFileSync(sfdPath, "utf-8");
  const careLookup = buildCareTranLookup(parseSfdModuleInterfaces(sfdText));
  const items = readJson(indexPath);
  if (!Array.isArray(items)) {
    console.error("index.json 형식 오류");
    process.exit(1);
  }

  let store = { version: 1, byApiName: {} };
  try {
    store = readJson(storePath);
  } catch {
    /* no store */
  }
  if (!store.byApiName || typeof store.byApiName !== "object") store.byApiName = {};
  const nest = { ...store.byApiName };

  const now = new Date().toISOString();
  let updated = 0;
  const skipped = [];

  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    if (!row || typeof row !== "object") continue;

    const care = findCareForProxyApi(careLookup, row);
    if (!care) continue;

    const newName = String(care.key).trim();
    const newDesc = String(care.desc).trim() || String(row.description ?? "").trim();
    const oldName = String(row.name ?? "").trim();
    const t = String(row.tran ?? "").trim() || oldName;

    if (String(row.name ?? "").trim() === newName && String(row.description ?? "").trim() === newDesc) continue;

    if (items.some((x, j) => j !== i && String(x.name ?? "").trim() === newName)) {
      skipped.push(`${t}: duplicate target name "${newName}"`);
      continue;
    }

    if (oldName !== newName && Object.prototype.hasOwnProperty.call(nest, oldName)) {
      const moved = nest[oldName];
      if (moved != null && moved.length > 0) {
        nest[newName] = [...moved, ...(nest[newName] ?? [])];
      }
      delete nest[oldName];
    }

    items[i] = {
      ...row,
      name: newName,
      description: newDesc,
      updatedAt: now,
    };
    updated++;
  }

  writeFileSync(indexPath, JSON.stringify(items, null, 2), "utf-8");
  writeFileSync(storePath, JSON.stringify({ version: 1, byApiName: nest }, null, 2), "utf-8");

  if (updated > 0) {
    const manifestPath = join(projectRoot, "project.json");
    try {
      const manifest = readJson(manifestPath);
      if (manifest && typeof manifest === "object") {
        manifest.updatedAt = now;
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
      }
    } catch {
      /* no manifest */
    }
  }

  console.log(`완료: ${updated}개 API 갱신, index·responses-store 반영`);
  if (skipped.length) console.log("건너뜀:\n" + skipped.join("\n"));
}

main();

/**
 * P0-SEC SEC-2 정적 가드 — "readWithMigration 결과로 권한 판정 금지"
 *
 * readWithMigration() 은 assets 행(owner_id 컬럼 없음)을 돌려줄 수 있다. 그 결과의 owner_id/broker_id/user_id 로
 * 소유권을 판정하면 (a) undefined 일 때 검사를 건너뛰는 fail-open 또는 (b) 정당한 소유자도 항상 404 가 된다.
 * 소유권은 반드시 `@/lib/authz/assert-owner` 의 assertBuildingOwner() (building_ssot_lite.owner_id 직접 조회) 로 판정한다.
 *
 * 탐지 방식 (저오탐 휴리스틱): src/app/api/** 파일에서
 *   1) readWithMigration 결과 변수(R) / 구조분해 data 별칭 / `R.data` 를 담은 변수 / 그 1단계 별칭을 수집하고
 *   2) 그 변수의 `.owner_id` · `.broker_id` · `.user_id` · `.ownerId` · `.attrs…ownerId` 접근이 있으면 실패한다.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const API_ROOT = path.resolve(__dirname, '../../app/api');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** readWithMigration 결과에서 파생된 식별자 목록 */
export function collectMigrationDerivedVars(src: string): string[] {
  const resultVars = new Set<string>();
  const dataVars = new Set<string>();

  for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*await\s+readWithMigration\s*\(/g)) resultVars.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*await\s+readWithMigration\s*\(/g)) {
    const inner = m[1];
    const alias = inner.match(/\bdata\s*:\s*(\w+)/);
    if (alias) dataVars.add(alias[1]);
    else if (/\bdata\b/.test(inner)) dataVars.add('data');
  }
  for (const r of resultVars) {
    const re = new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*\\(?\\s*${escape(r)}\\s*(?:\\?\\.|\\.)\\s*data\\b`, 'g');
    for (const m of src.matchAll(re)) dataVars.add(m[1]);
    dataVars.add(`${r}.data`);
  }
  // 1단계 별칭: const building = buildingData as any; / const b = (buildingData ...
  for (const v of [...dataVars]) {
    if (v.includes('.')) continue;
    const re = new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*\\(?\\s*${escape(v)}\\b(?!\\s*\\()`, 'g');
    for (const m of src.matchAll(re)) dataVars.add(m[1]);
  }
  return [...dataVars];
}

/** 파생 변수의 소유자 필드 접근 (권한 판정 의심) 목록 */
export function findMigrationOwnerAccess(src: string): string[] {
  if (!/readWithMigration\s*\(/.test(src)) return [];
  const hits: string[] = [];
  for (const v of collectMigrationDerivedVars(src)) {
    const base = v.split('.').map(escape).join('\\s*(?:\\?\\.|\\.)\\s*');
    const direct = new RegExp(`\\b${base}\\s*(?:\\?\\.|\\.)\\s*(owner_id|broker_id|user_id|ownerId|brokerId)\\b`, 'g');
    const viaAttrs = new RegExp(`\\b${base}\\s*(?:\\?\\.|\\.)\\s*attrs\\b[^;\\n]*\\bownerId\\b`, 'g');
    for (const m of src.matchAll(direct)) hits.push(m[0]);
    for (const m of src.matchAll(viaAttrs)) hits.push(m[0]);
  }
  return hits;
}

describe('정적 가드: readWithMigration 결과로 권한 판정 금지 (SEC-2)', () => {
  it('탐지기 자기검증 — 과거 결함 패턴을 모두 잡는다', () => {
    const legacyDealCard = `
      const result = await readWithMigration(id);
      const building = result.data as any;
      const ownerId = building?.owner_id ?? building?.user_id ?? (building?.attrs as any)?.ownerId;
      if (!building || (ownerId && ownerId !== guard.user!.id)) {}`;
    const legacyDisclosure = `
      const result = await readWithMigration(id);
      const building = result.data as any;
      if (bErr || !building || (building.owner_id && building.owner_id !== user!.id)) {}`;
    const legacyBriefing = `
      const { data: buildingData } = await readWithMigration((await params).id);
      const building = (buildingData?.id && buildingData.broker_id === user!.id ? buildingData : null) as any;`;
    const legacyEnrich = `
      const result = await readWithMigration(buildingId);
      const building = result.data as any;
      if (building && building.broker_id && building.broker_id !== user!.id) {}`;
    const direct = `
      const res = await readWithMigration(id);
      if (res.data.owner_id !== user.id) {}`;
    for (const snippet of [legacyDealCard, legacyDisclosure, legacyBriefing, legacyEnrich, direct]) {
      expect(findMigrationOwnerAccess(snippet).length).toBeGreaterThan(0);
    }
  });

  it('탐지기 자기검증 — 정상 패턴(헬퍼 판정 후 데이터만 사용, 별도 문서 owner 비교)은 통과', () => {
    const ok = `
      const ownership = await assertBuildingOwner(svc, id, user.id);
      if (!ownership.ok) return ownership.response;
      const result = await readWithMigration(id);
      const ssotRow = result.data as any;
      const x = ssotRow.area_signal;
      const ownerId = doc.broker_id ?? doc.owner_id;
      if (ownerId !== guard.user!.id) {}
      await supabase.from('document_objects').insert({ owner_id: userId });`;
    expect(findMigrationOwnerAccess(ok)).toEqual([]);
  });

  it('src/app/api 전체에 readWithMigration 결과 기반 소유권 판정이 없다', () => {
    const offenders: Array<{ file: string; hits: string[] }> = [];
    for (const file of walk(API_ROOT)) {
      const src = fs.readFileSync(file, 'utf8');
      const hits = findMigrationOwnerAccess(src);
      if (hits.length > 0) offenders.push({ file: path.relative(API_ROOT, file), hits });
    }
    expect(offenders).toEqual([]);
  });

  it('SEC-1/SEC-2 수정 대상 라우트는 assertBuildingOwner 로 판정한다', () => {
    const targets = [
      'broker/im-lite/generate-async/route.ts',
      'broker/im-lite/generate/handler.ts',
      'broker/deal-card/[id]/route.ts',
      'broker/deal-card/from-memo/route.ts',
      'broker/buildings/[id]/disclosure/route.ts',
      'broker/buildings/[id]/evidence/route.ts',
      'broker/buildings/[id]/studio/route.ts',
      'broker/buildings/[id]/lease/route.ts',
      'broker/buildings/[id]/briefing/route.ts',
      'broker/buildings/[id]/conversion/route.ts',
      'broker/buildings/[id]/enrich-vacancy/route.ts',
      'broker/buildings/[id]/snapshot/generate/route.ts',
    ];
    const missing = targets.filter((rel) => {
      const src = fs.readFileSync(path.join(API_ROOT, rel), 'utf8');
      return !/assertBuildingOwner\s*(<[^(]*>)?\s*\(/.test(src);
    });
    expect(missing).toEqual([]);
  });

  it('스튜디오(PPTX/Basic IM) 라우트는 assertStudioDealOwner 로 프로젝트 소유권을 판정한다', () => {
    const studioRoutes = [
      'broker/basic-im-studio/route.ts',
      'broker/basic-im-studio/[id]/route.ts',
      'broker/basic-im-studio/[id]/ai-text/route.ts',
      'broker/basic-im-studio/[id]/download/route.ts',
      'broker/basic-im-studio/[id]/map-upload/route.ts',
      'broker/pptx-studio/projects/route.ts',
      'broker/pptx-studio/projects/[id]/route.ts',
      'broker/pptx-studio/projects/[id]/approve-editorial/route.ts',
      'broker/pptx-studio/projects/[id]/approve-file/route.ts',
      'broker/pptx-studio/projects/[id]/download/route.ts',
      'broker/pptx-studio/projects/[id]/slides/route.ts',
    ];
    const missing = studioRoutes.filter((rel) => {
      const src = fs.readFileSync(path.join(API_ROOT, rel), 'utf8');
      const handlers = (src.match(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g) ?? []).length;
      const checks = (src.match(/assertStudioDealOwner\s*\(/g) ?? []).length;
      return checks < handlers;
    });
    expect(missing).toEqual([]);
  });
});

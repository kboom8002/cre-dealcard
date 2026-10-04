/**
 * 레거시 IM 문서의 '[건물명 비공개]' 마스크 일괄 정리 (Hardening D5).
 *
 * 기본은 dry-run(조회만). --apply 를 주면 **draft** 상태 문서의 body 문자열에서만 치환한다.
 * published 문서는 승인 해시(approval_target_hash)와 충돌하므로 절대 수정하지 않고 목록만 보고한다.
 * 치환 전 원본 body 는 docs/test/legacy-mask-backup/<id>.json 에 저장한다.
 *
 * 사용: node scripts/migrate-legacy-name-mask.mjs [--apply] [--replacement 본 자산]
 *
 * 참고: body 가 커서 대량 조회 시 statement timeout 이 나므로 id 순 소페이지(10건)로 스캔한다.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const ri = args.indexOf('--replacement');
const replacement = ri >= 0 ? args[ri + 1] : '본 자산';
const MASK = /\[건물명 비공개\]/g;

const env = Object.fromEntries(
  readFileSync(join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)
    .filter(l => /^[A-Z_]+=/.test(l))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }),
);
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function countAndReplace(node) {
  let n = 0;
  const walk = (v) => {
    if (typeof v === 'string') {
      const m = v.match(MASK);
      if (m) { n += m.length; return v.replace(MASK, replacement); }
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  const out = walk(node);
  return { n, out };
}

const PAGE = 10;
let from = 0;
const hits = [];
let scanned = 0;
for (;;) {
  const { data, error } = await s.from('document_objects')
    .select('id,status,created_at,body').order('id').range(from, from + PAGE - 1);
  if (error) { console.error('조회 실패:', error.message, 'offset', from); process.exit(1); }
  if (!data?.length) break;
  for (const d of data) {
    scanned++;
    const { n, out } = countAndReplace(d.body);
    if (n > 0) hits.push({ id: d.id, status: d.status, created_at: d.created_at, n, out, body: d.body });
  }
  if (data.length < PAGE) break;
  from += PAGE;
}

console.log(`스캔 ${scanned}건 / 마스크 포함 ${hits.length}건`);
const byStatus = {};
for (const h of hits) byStatus[h.status] = (byStatus[h.status] ?? 0) + 1;
console.log('상태별:', JSON.stringify(byStatus));
for (const h of hits.slice(0, 30)) console.log(` - ${h.id} [${h.status}] ${h.created_at} x${h.n}`);

if (!apply) { console.log('dry-run 종료 (--apply 로 draft 만 치환)'); process.exit(0); }

const backupDir = join(process.cwd(), 'docs', 'test', 'legacy-mask-backup');
mkdirSync(backupDir, { recursive: true });
let fixed = 0;
for (const h of hits) {
  if (h.status !== 'draft') continue;
  writeFileSync(join(backupDir, `${h.id}.json`), JSON.stringify(h.body), 'utf8');
  const { error } = await s.from('document_objects').update({ body: h.out }).eq('id', h.id).eq('status', 'draft');
  if (error) console.error('  실패', h.id, error.message); else fixed++;
}
console.log(`draft ${fixed}건 치환 완료. published 는 미수정.`);

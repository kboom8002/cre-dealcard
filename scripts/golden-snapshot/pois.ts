/**
 * @file scripts/golden-snapshot/pois.ts
 * @description 골든별 랜드마크 풀(poi-pool.json) → 입지 POI 선별 결과 + W2 랜드마크 기대값 진단 (오프라인, 네트워크/LLM 없음).
 *
 *   npx tsx scripts/golden-snapshot/pois.ts <name|core>
 *
 * 선별은 image-optimizer.selectAndPlacePois 와 동일 인자(posture/assetType/center)로 selectLocationPois 를 호출한다
 * (뷰 기반 isPlaceable/minSeparation 은 지도 뷰 의존이라 기본값 사용 — 근사). 결과: out/pois-report.md
 *
 * 기대 랜드마크가 선별되지 않으면 원인을 분류한다:
 *   A. pool 에 없음          — 수집 단계(쿼리/반경/상한)에서 누락
 *   B. 이름 불일치           — pool 에 유사 이름은 있으나 기대 표기와 다름
 *   C. 분류 탈락(other)      — classifyPoi 가 'other' 로 분류 (점수 0)
 *   D. 선택기 탈락           — 점수/클래스 상한/중복/이격/최대 5건 때문에 미선택 (순위·점수·사유 표기)
 */
import fs from 'fs';
import path from 'path';
import { CORE_GOLDEN_NAMES, GOLDENS, OUT_DIR, loadExpectedFacts, loadSnapshot, loadPoiPool, landmarkPoolArgs } from './lib';

type Row = { name: string; poiClass: string; score: number; distanceM: number; gfaSqm: number | null; accuracyRank: number | null; isAnchor: boolean };

export interface PoiDiag {
  golden: string;
  posture: string;
  assetType: string | null;
  poolCandidates: number;
  selected: Array<{ index: number; kind: string; poiClass: string; name: string; distanceM: number; label: string; score: number | null }>;
  expectations: Array<{ label: string; anyOf: string[]; pending: string | null; picked: boolean; verdict: string; detail: string }>;
}

export async function diagnose(name: string): Promise<PoiDiag | null> {
  const pool = loadPoiPool(name);
  if (!pool) return null;
  const snap = loadSnapshot(name);
  const { coords, posture, assetType } = landmarkPoolArgs(snap);
  if (!coords) return null;
  const sel = await import('../../src/domain/building/mobile-im/pptx/location-poi-selector');
  const lp = await import('../../src/lib/external/landmark-pool');
  const rebased = lp.rebasePoolToCenter(pool as any, coords);
  const cands = rebased.candidates;

  let explainRows: Row[] = [];
  // 렌더 경로와 동일한 선별 옵션: 중개인 실입력 원문 언급 + 대형 기관 하한 (image-optimizer selectAndPlacePois 참조)
  const { collectBrokerMentionTexts } = await import('../../src/domain/building/mobile-im/pptx/utils/broker-mention-texts');
  const mentionTexts = collectBrokerMentionTexts(snap.building, snap.doc.body ?? {});
  const selected = sel.selectLocationPois(cands, {
    posture, assetType, center: coords, minSeparationM: 20,
    mentionTexts, guaranteeMajorInstitutions: true,
    explain: rows => { explainRows = rows as Row[]; },
  });

  const facts = loadExpectedFacts(name);
  const expectations: PoiDiag['expectations'] = [];
  for (const lm of facts?.landmarks ?? []) {
    const anyOf: string[] = lm.anyOf ?? [];
    const norm = (s: string) => s.replace(/\s+/g, '');
    const hit = (n: string) => anyOf.some(a => norm(n).includes(norm(a)));
    const picked = selected.find(s => hit(s.name) || hit(s.displayName));
    if (picked) {
      expectations.push({ label: lm.label, anyOf, pending: lm.pending ?? null, picked: true, verdict: 'SELECTED', detail: `#${picked.index} ${picked.displayName} ${picked.distanceM}m (${picked.poiClass})` });
      continue;
    }
    const inPool = cands.filter(c => hit(c.name) || hit(c.registerName ?? ''));
    if (inPool.length === 0) {
      // B: 느슨한 이름 일치 (앞 3글자 토큰)
      const toks = anyOf.map(a => norm(a).slice(0, 3)).filter(t => t.length >= 2);
      const loose = cands.filter(c => toks.some(t => norm(c.name).includes(t))).slice(0, 5);
      if (loose.length) {
        expectations.push({ label: lm.label, anyOf, pending: lm.pending ?? null, picked: false, verdict: 'B 이름 불일치?', detail: `유사 후보: ${loose.map(c => `${c.name}(${c.distanceM}m,${sel.classifyPoi(c)})`).join(' / ')}` });
      } else {
        expectations.push({ label: lm.label, anyOf, pending: lm.pending ?? null, picked: false, verdict: 'A pool 에 없음', detail: `후보 ${cands.length}건 중 일치 없음` });
      }
      continue;
    }
    const details: string[] = [];
    let verdict = 'D 선택기 탈락';
    const topScore = explainRows[0]?.score ?? 0;
    const weights = sel.classWeights(sel.normalizePosture(posture), sel.classifyAssetType(assetType));
    const ranked = [...inPool].sort((a, b) => Number(sel.classifyPoi(a) === 'other') - Number(sel.classifyPoi(b) === 'other') || a.distanceM - b.distanceM);
    let allOther = true;
    for (const c of ranked.slice(0, 6)) {
      const cls = sel.classifyPoi(c);
      if (cls === 'other') { details.push(`${c.name} ${c.distanceM}m [cn=${c.categoryName ?? c.category}] → class=other(점수0)`); continue; }
      allOther = false;
      const rank = explainRows.findIndex(r => r.name === c.name);
      if (rank < 0) {
        const why = c.distanceM > (cls === 'road' ? 3000 : 1500) ? `거리 ${c.distanceM}m > 상한` : (weights[cls] ?? 0) === 0 ? `class=${cls} 가중치 0` : '40m/동일건물 중복 제거에서 탈락';
        details.push(`${c.name} ${c.distanceM}m class=${cls} → 점수 후보 아님 (${why})`);
      } else {
        const r = explainRows[rank];
        const pickedSameClass = selected.filter(s => s.poiClass === cls).map(s => s.displayName);
        const pickedClsStr = pickedSameClass.length ? `같은 클래스 선택됨: ${pickedSameClass.join(',')}` : '같은 클래스 미선택';
        const cutoff = selected.length >= 5 ? '5건 상한 도달' : `선택 ${selected.length}건`;
        details.push(`${c.name} ${c.distanceM}m class=${cls} w=${weights[cls]} score=${r.score.toFixed(3)} 순위 ${rank + 1}/${explainRows.length} (최상위 ${topScore.toFixed(3)}, gfa=${r.gfaSqm ?? '-'}, accRank=${r.accuracyRank ?? '-'}) | ${pickedClsStr} | ${cutoff}`);
      }
    }
    if (allOther) verdict = 'C 분류 탈락(other)';
    expectations.push({ label: lm.label, anyOf, pending: lm.pending ?? null, picked: false, verdict, detail: details.join(' ‖ ') });
  }

  return {
    golden: name, posture, assetType, poolCandidates: cands.length,
    selected: selected.map(s => ({ index: s.index, kind: s.kind, poiClass: s.poiClass, name: s.name, distanceM: s.distanceM, label: s.label, score: explainRows.find(r => r.name === s.name)?.score ?? null })),
    expectations,
  };
}

async function main() {
  const target = process.argv[2] ?? 'core';
  const names = target === 'core' ? CORE_GOLDEN_NAMES : target === 'all' ? GOLDENS.map(g => g.name) : [target];
  const md: string[] = ['# POI 선별 / W2 랜드마크 진단', ''];
  for (const n of names) {
    const d = await diagnose(n);
    if (!d) { console.log(`⏭  ${n}: poi-pool.json 없음`); continue; }
    console.log(`\n■ ${n} (posture=${d.posture}, asset=${d.assetType}, pool=${d.poolCandidates})`);
    md.push(`## ${n}`, `posture=${d.posture} asset=${d.assetType} pool=${d.poolCandidates}`, '', '| # | 종류 | 클래스 | 이름 | 거리(m) | 점수 |', '|--:|:--|:--|:--|--:|--:|');
    for (const s of d.selected) {
      console.log(`  ${s.index}. [${s.poiClass}] ${s.name} ${s.distanceM}m${s.score != null ? ` score=${s.score.toFixed(3)}` : ''}`);
      md.push(`| ${s.index} | ${s.kind} | ${s.poiClass} | ${s.name} | ${s.distanceM} |${s.score != null ? ` ${s.score.toFixed(3)} |` : ' - |'}`);
    }
    md.push('');
    for (const e of d.expectations) {
      console.log(`  ↳ 기대 "${e.label}" [${e.pending ?? '-'}] → ${e.verdict}: ${e.detail}`);
      md.push(`- 기대 **${e.label}** (${e.pending ?? 'untagged'}) → **${e.verdict}** — ${e.detail}`);
    }
    md.push('');
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'pois-report.md'), md.join('\n'), 'utf8');
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

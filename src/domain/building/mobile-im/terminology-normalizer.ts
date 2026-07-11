// src/domain/building/mobile-im/terminology-normalizer.ts
// [B3] CRE 금융 구어체 → 표준 투자 용어 정규화
//
// 목적: AI 또는 브로커가 입력한 비전문 표현을 CRE 업계 표준 용어로 자동 치환하여
//       투자자 신뢰도와 법적 안전성을 동시에 제고
//
// v3: DB 기반 동적 로딩 + 함수형 치환 Registry + 캐싱(5분) + hit_count 추적

import { createServiceClient } from "@/lib/supabase/service";

export interface NormalizationResult {
  text: string;
  replaced: { original: string; normalized: string }[];
}

/** 치환 규칙 */
export type ReplacementRule = {
  id?: string;
  pattern: RegExp;
  replacement: string | ((match: string, ...groups: string[]) => string);
  category: string;
};

// ─── 함수형 치환 Registry (SOTA) ──────────────────────────────────────────────

const FUNCTIONAL_REPLACEMENTS: Record<string, (match: string, ...groups: string[]) => string> = {
  'fn:pyeongToSqm': (_match: string, num: string) => {
    const pyeong = parseFloat(num);
    const sqm = Math.round(pyeong * 3.3058 * 10) / 10;
    return `${num}평(약 ${sqm}㎡)`;
  },
  'fn:conjugateLease': (_match: string, suffix: string) => {
    const map: Record<string, string> = { '다': '하다', '고': '하고', '은': '한', '을': '할', '는': '하는' };
    return `임대${map[suffix] ?? suffix}`;
  },
  'fn:conjugateFill': (_match: string, suffix: string) => {
    const map: Record<string, string> = { '야': '해야', '서': '하여', '진': '된', '지': '되지' };
    return `임차인 유치${map[suffix] ?? ''}`;
  }
};

// ─── 하드코딩 Fallback Rules ──────────────────────────────────────────────────

export const HARDCODED_TERM_RULES: ReplacementRule[] = [
  {
    id: 'hardcoded_pyeongToSqm',
    pattern: /(\d+(?:\.\d+)?)\s*평(?!\(약)/g,
    replacement: FUNCTIONAL_REPLACEMENTS['fn:pyeongToSqm'],
    category: '면적',
  },
  {
    id: 'hardcoded_conjugateLease',
    pattern: /세놓(다|고|은|을|는)/g,
    replacement: FUNCTIONAL_REPLACEMENTS['fn:conjugateLease'],
    category: '면적',
  },
  { id: 'hardcoded_make_deal', pattern: /매물\s*내놓/g, replacement: '매각 의뢰', category: '거래' },
  { id: 'hardcoded_single_floor', pattern: /한\s*층\s*전체/g, replacement: '단일 층 전용', category: '면적' },
  { id: 'hardcoded_capex_repair', pattern: /건물\s*고치는\s*비용/g, replacement: '자본적 지출(CAPEX)', category: '비용' },
  { id: 'hardcoded_opex_repair', pattern: /수리\s*비용/g, replacement: '유지보수 비용(OPEX)', category: '비용' },
  { id: 'hardcoded_capex_remodel', pattern: /리모델링\s*비용/g, replacement: '리모델링 투자 비용(CAPEX)', category: '비용' },
  { id: 'hardcoded_master_lease', pattern: /통으로\s*빌려주는/g, replacement: '마스터리스(Master Lease) 구조', category: '임대' },
  { id: 'hardcoded_myeongdo_work', pattern: /방\s*빼는\s*(것|작업|절차)/g, replacement: '명도 프로세스', category: '임대' },
  { id: 'hardcoded_myeongdo_tenant', pattern: /임차인\s*내보내는/g, replacement: '명도 절차 진행', category: '임대' },
  { id: 'hardcoded_myeongdo_tenant2', pattern: /세입자\s*내보내/g, replacement: '명도 절차 진행', category: '임대' },
  { id: 'hardcoded_vacant_floor', pattern: /빈\s*층/g, replacement: '공실 층', category: '임대' },
  {
    id: 'hardcoded_conjugateFill',
    pattern: /채워(야|서|진|지)/g,
    replacement: FUNCTIONAL_REPLACEMENTS['fn:conjugateFill'],
    category: '임대',
  },
  { id: 'hardcoded_monthly_rent', pattern: /달세/g, replacement: '월 임대료', category: '임대' },
  { id: 'hardcoded_lease_handover', pattern: /임대차\s*승계/g, replacement: '기존 임대차계약 포괄 승계', category: '거래' },
  { id: 'hardcoded_credit_safe', pattern: /연체\s*(안\s*하는|적은|없는)/g, replacement: '신용 안정성이 높은', category: '신용' },
  { id: 'hardcoded_prime_tenant', pattern: /돈\s*잘\s*내는\s*임차인/g, replacement: '우량 임차인(Prime Tenant)', category: '신용' },
  { id: 'hardcoded_discount_deal', pattern: /급매/g, replacement: '시세 대비 할인 매각', category: '거래' },
  { id: 'hardcoded_nego', pattern: /네고\s*(가능|여지|있)/g, replacement: '가격 협상 $1', category: '거래' },
  { id: 'hardcoded_albakgi', pattern: /알박기/g, replacement: '잔존 권리관계', category: '거래' },
  { id: 'hardcoded_informal_broker', pattern: /떳다방/g, replacement: '비정규 중개 채널', category: '거래' },
  { id: 'hardcoded_old_building', pattern: /오래된\s*건물/g, replacement: '준공 후 상당 기간 경과한 건물', category: '건물상태' },
  { id: 'hardcoded_good_condition', pattern: /상태\s*좋(은|다)/g, replacement: '양호한 유지관리 상태', category: '건물상태' },
  { id: 'hardcoded_worn_out', pattern: /허름(한|하)/g, replacement: '리모델링 검토 대상', category: '건물상태' },
  { id: 'hardcoded_clean_state', pattern: /깨끗(한|하)/g, replacement: '관리 상태 양호', category: '건물상태' },
  { id: 'hardcoded_new_building', pattern: /새\s*건물/g, replacement: '준공 5년 이내 신축급', category: '건물상태' },
  { id: 'hardcoded_remodeled', pattern: /리모(한|됨|된)/g, replacement: '리모델링 완료', category: '건물상태' },
  { id: 'hardcoded_senior_debt', pattern: /근저당\s*많/g, replacement: '선순위 채권 부담이 큰', category: '법률' },
  { id: 'hardcoded_has_debt', pattern: /빚\s*(많|있)/g, replacement: '금융 부채가 존재하는', category: '법률' },
  { id: 'hardcoded_illegal_building', pattern: /위반\s*건축/g, replacement: '건축법 위반 사항', category: '법률' },
  { id: 'hardcoded_illegal_expansion', pattern: /불법\s*증축/g, replacement: '무허가 증축(건축법 위반)', category: '법률' },
  { id: 'hardcoded_jeonse_right', pattern: /전세권\s*설정/g, replacement: '전세권 등기 설정', category: '법률' },
  { id: 'hardcoded_ads_best', pattern: /최고의|제일\s*좋은/g, replacement: '우수한', category: '홍보' },
  { id: 'hardcoded_ads_awesome', pattern: /대박|놀라운|완벽한/g, replacement: '주목할 만한', category: '홍보' },
  { id: 'hardcoded_profitable', pattern: /돈\s*되는/g, replacement: '수익성이 있는', category: '투자' },
  { id: 'hardcoded_goldmine', pattern: /노다지/g, replacement: '수익률 우수 자산', category: '투자' },
  { id: 'hardcoded_premium_asset', pattern: /알짜/g, replacement: '핵심 우량 자산', category: '투자' },
  { id: 'hardcoded_attractive_deal', pattern: /꿀\s*매물/g, replacement: '투자 매력도가 높은 매물', category: '투자' },
  { id: 'hardcoded_rising_area', pattern: /뜨는\s*동네/g, replacement: '신흥 상권', category: '투자' },
  { id: 'hardcoded_hotplace', pattern: /핫\s*플레이스/g, replacement: '상권 활성화 지역', category: '투자' },
  { id: 'hardcoded_guaranteed_return', pattern: /무조건\s*(수익|벌리는|됩니다)/g, replacement: '안정적 수익이 기대되는(실사 확인 필요)', category: '법적위험' },
  { id: 'hardcoded_principal_guaranteed', pattern: /원금\s*보장/g, replacement: '원금 손실 가능성 최소화 구조(보장 불가)', category: '법적위험' },
  { id: 'hardcoded_fixed_return', pattern: /확정\s*수익/g, replacement: '예상 수익(실제 조건에 따라 변동)', category: '법적위험' },
  { id: 'hardcoded_huge_profit', pattern: /떼돈/g, replacement: '상당한 투자 수익(리스크 병행 검토 필요)', category: '법적위험' },
  { id: 'hardcoded_no_loss', pattern: /절대\s*(안\s*)?손해/g, replacement: '원금 보전 가능성이 높은(리스크 존재)', category: '법적위험' },
  { id: 'hardcoded_stable_rent', pattern: /월세\s*따박따박/g, replacement: '안정적 월 임대 수익', category: '법적위험' },
];

// ─── DB 캐싱 & 로드 로직 ──────────────────────────────────────────────────────

let dbRulesCache: ReplacementRule[] | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5분 캐시

async function getTerminologyRules(): Promise<ReplacementRule[]> {
  const now = Date.now();
  if (dbRulesCache && now - cacheLoadedAt < CACHE_TTL) {
    return dbRulesCache;
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('im_terminology_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: true });

    if (error || !data || data.length === 0) {
      return HARDCODED_TERM_RULES;
    }

    interface DbRuleRow {
      id: string;
      pattern: string;
      is_regex: boolean;
      replacement: string;
      category: string;
    }

    const rules: ReplacementRule[] = (data as DbRuleRow[]).map(r => {
      // Regex 패턴 복원
      const regexFlags = 'g';
      const patternRegex = r.is_regex ? new RegExp(r.pattern, regexFlags) : new RegExp(escapeRegExp(r.pattern), regexFlags);

      // 함수형 치환 매핑 또는 정적 치환
      const replacementVal = FUNCTIONAL_REPLACEMENTS[r.replacement] || r.replacement;

      return {
        id: r.id,
        pattern: patternRegex,
        replacement: replacementVal,
        category: r.category,
      };
    });

    dbRulesCache = rules;
    cacheLoadedAt = now;
    return rules;
  } catch (err) {
    console.warn('[terminology-normalizer] Failed to load rules from DB, using fallback:', err);
    return HARDCODED_TERM_RULES;
  }
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Hit Count 비동기 배치 기록 (J3) ───────────────────────────────────────────

const hitBuffer: Map<string, number> = new Map();
let hitTimeout: NodeJS.Timeout | null = null;

function recordRuleHit(ruleId: string) {
  if (!ruleId || ruleId.startsWith('hardcoded_')) return;
  hitBuffer.set(ruleId, (hitBuffer.get(ruleId) || 0) + 1);

  if (!hitTimeout) {
    hitTimeout = setTimeout(flushRuleHits, 3000);
  }
}

async function flushRuleHits() {
  hitTimeout = null;
  const currentHits = new Map(hitBuffer);
  hitBuffer.clear();

  if (currentHits.size === 0) return;

  try {
    const supabase = createServiceClient();
    for (const [id, count] of currentHits.entries()) {
      // hit_count 원자적 증가는 Supabase JS 클라이언트가 미지원하므로 기존값 조회 후 업데이트
      const { data } = await supabase
        .from('im_terminology_rules')
        .select('hit_count')
        .eq('id', id)
        .maybeSingle();

      const existingCount = data?.hit_count || 0;
      await supabase
        .from('im_terminology_rules')
        .update({
          hit_count: existingCount + count,
          last_hit_at: new Date().toISOString(),
        })
        .eq('id', id);
    }
  } catch (err) {
    console.warn('[terminology-normalizer] Failed to flush rule hits:', err);
  }
}

// ─── Core Normalizer ─────────────────────────────────────────────────────────

/**
 * 입력 텍스트에서 구어체·비표준 표현을 CRE 표준 용어로 정규화합니다.
 * DB 연동 비동기 버전.
 */
export async function normalizeTerminologyAsync(text: string): Promise<NormalizationResult> {
  const rules = await getTerminologyRules();
  return applyRules(text, rules);
}

/**
 * 동기식 폴백 버전 (동기 컴포넌트나 static 환경용)
 */
export function normalizeTerminology(text: string): NormalizationResult {
  return applyRules(text, HARDCODED_TERM_RULES);
}

function applyRules(text: string, rules: ReplacementRule[]): NormalizationResult {
  const replaced: { original: string; normalized: string }[] = [];
  let result = text;

  for (const rule of rules) {
    const { id, pattern, replacement } = rule;
    const cloned = new RegExp(pattern.source, pattern.flags);
    const matches = [...result.matchAll(cloned)];

    if (matches.length === 0) continue;

    // Hit Count 추적
    if (id) {
      recordRuleHit(id);
    }

    if (typeof replacement === 'string') {
      for (const match of matches) {
        let resolved = replacement;
        match.forEach((group, idx) => {
          if (idx > 0 && group !== undefined) {
            resolved = resolved.replace(`$${idx}`, group);
          }
        });
        replaced.push({ original: match[0], normalized: resolved });
      }
      result = result.replace(pattern, replacement);
    } else {
      // 함수형 치환
      for (const match of matches) {
        const normalized = replacement(match[0], ...match.slice(1));
        replaced.push({ original: match[0], normalized });
      }
      result = result.replace(pattern, replacement as (...args: string[]) => string);
    }
  }

  return { text: result, replaced };
}

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
  // D32 M-6: CRE 용어집 표준 (AGENTS.md §2)
  { id: 'd32_naming_rights', pattern: /네이밍\s*라이츠/g, replacement: '사옥 단독 명칭 표기(간판 설치권)', category: 'CRE용어' },
  { id: 'd32_branding_rights', pattern: /브랜딩\s*라이츠/g, replacement: '기업 단독 브랜딩', category: 'CRE용어' },
  { id: 'd32_cap_rate_kr', pattern: /캡레이트/g, replacement: '연 순수익률(Cap Rate)', category: 'CRE용어' },
  { id: 'd32_gop_kr', pattern: /(?<![실질\s])GOP(?!\s*마진)/g, replacement: '실질 영업이익(GOP)', category: 'CRE용어' },
  { id: 'd32_ti_raw', pattern: /(?<!\()TI(?!\)|\s*\/)/g, replacement: '인테리어 지원금(TI)', category: 'CRE용어' },
  { id: 'd32_rent_free', pattern: /(?<!\()Rent\s*Free(?!\))/gi, replacement: '렌트프리(무상임대)', category: 'CRE용어' },
  { id: 'd32_my_money', pattern: /내\s*돈/g, replacement: '실투자금', category: 'CRE용어' },
  // D33 M-B: 누락 CRE 용어 추가
  { id: 'd33_noi_standalone', pattern: /(?<![순\s])NOI(?!\s*기준|\s*\()/g, replacement: '순영업소득(NOI)', category: 'CRE용어' },
  { id: 'd33_cap_rate_en', pattern: /(?<![연\s])Cap\s*Rate(?!\s*[,(])/gi, replacement: '연 순수익률(Cap Rate)', category: 'CRE용어' },
  { id: 'd33_nnn_lease', pattern: /NNN\s*리스/g, replacement: '삼중순임대(NNN Lease)', category: 'CRE용어' },
  { id: 'd33_super_station', pattern: /초역세권/g, replacement: '역세권 도보 3분 이내', category: 'CRE용어' },
  { id: 'd33_sublease', pattern: /전대차/g, replacement: '전대(轉貸)임대차', category: 'CRE용어' },
  { id: 'd33_ltv_raw', pattern: /(?<!\()LTV(?!\))/g, replacement: '담보인정비율(LTV)', category: 'CRE용어' },
  { id: 'd33_dscr_raw', pattern: /(?<!\()DSCR(?!\))/g, replacement: '원리금상환비율(DSCR)', category: 'CRE용어' },
  { id: 'd33_irr_raw', pattern: /(?<!\()IRR(?!\))/g, replacement: '내부수익률(IRR)', category: 'CRE용어' },
  { id: 'd33_vacancy_informal', pattern: /비어\s*있는\s*방/g, replacement: '공실', category: 'CRE용어' },
  { id: 'd33_myeongdo_evict', pattern: /쫓아내/g, replacement: '명도 절차 진행', category: 'CRE용어' },
  { id: 'd33_deposit_colloquial', pattern: /보증금\s*때먹/g, replacement: '보증금 미반환', category: 'CRE용어' },
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
      const { error: rpcError } = await (supabase as any).rpc('increment_term_hit_count', { rule_id: id, amount: count });
      
      if (rpcError) {
        // Fallback if RPC is not available
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

// ══════════════════════════════════════════════════════════════════════
// v0.5: 전역 텍스트 위생(Text Hygiene) 파이프라인
// ══════════════════════════════════════════════════════════════════════

/**
 * v0.5: SSoT → IM 데이터 브릿지 직전에 적용되는 전역 텍스트 위생 함수.
 * 마크다운 찌꺼기, 시스템 메시지, 어휘 중복, 이모지, dangling 기호를 선제 정제합니다.
 *
 * 이 함수는 렌더러(PPTX/웹/PDF)가 아닌 SSoT 데이터 레이어에서 호출되어,
 * 모든 하류 채널에 깨끗한 데이터를 보장합니다.
 */
export function sanitizeTextHygiene(text: string): string {
  if (!text) return '';

  return text
    // ── 마크다운 서식 제거 ──
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')      // 수평선(---, ***)
    .replace(/\*\*(.*?)\*\*/g, '$1')          // **bold**
    .replace(/\*(.*?)\*/g, '$1')              // *italic*
    .replace(/`(.*?)`/g, '$1')                // `code`
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')       // [link](url)
    .replace(/^>\s*/gm, '')                   // blockquote

    // ── HTML 태그 ──
    .replace(/<[^>]*>/g, '')

    // ── 이모지 ──
    .replace(/[🏢📍📊💰⚠️🎯📋✨🚇✓★▲●◇🔍📌📈📉🏗️🏠💼🔑📝✅❌⭐🏆🎉🚀💡🔥❗❓]/gu, '')

    // ── 내부 시스템 메시지 ──
    .replace(/>\s*🔍?\s*\*{0,2}건축물대장\s*조회\s*미완료\*{0,2}[^\n]*/g, '')
    .replace(/공공데이터\s*API\s*응답을\s*받지\s*못했습니다[^\n]*/g, '')
    .replace(/추후\s*업데이트\s*시\s*자동\s*반영됩니다\.?/g, '')

    // ── SSoT 내부 표기 정제 ──
    .replace(/\s*\(BSSoT\s*Lite[^)]*\)/gi, '')
    .replace(/\s*\(기재\s*공란\)/g, ' (미확인)')
    .replace(/근린생활시설\s*또는\s*상업용\s*건물로\s*추정\s*/g, '')
    .replace(/건축물대장상\s*확인\s*필요/g, '확인 필요')
    .replace(/(으로|로)\s*추정(되는|됨|)\s*/g, '')
    .replace(/인\s*것으로\s*(보임|판단됨|보여짐)\s*/g, '')
    .replace(/일\s*가능성이\s*있(음|습니다)\s*/g, '')
    .replace(/~?(으로|로)\s*보(임|입니다|여집니다)\s*/g, '')

    // ── 어휘 중복 정제 ──
    .replace(/(권역|입지|상권|역세권|대로변|인프라|교통|접근성)\s+\1/g, '$1')

    // ── 문미 dangling 기호 ──
    .replace(/\s*[—–-]\s*$/gm, '')

    // ── 공백 정규화 ──
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * v0.5: 다수의 텍스트 필드에 일괄 적용하는 래퍼.
 * Record의 string 값 필드에만 sanitizeTextHygiene을 적용합니다.
 */
export function sanitizeRecordTextFields<T extends Record<string, unknown>>(record: T): T {
  const result = { ...record };
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string') {
      (result as Record<string, unknown>)[key] = sanitizeTextHygiene(value);
    }
  }
  return result;
}

import { buildYieldFromHeroCard, buildYieldFromIMCore, yieldLabel, type Yield } from "../yield-object";
import type { ClaimRegistry } from "@/domain/building/im-core/claim-registry";
import type { PermitZoneResult } from "@/domain/building/im-core/permit-zone";
import type { ConvertedDepositResult, EffectiveRentResult } from "@/domain/building/im-core/lease-calc";
import type { KoreanLegalFields } from "@/domain/building/im-core/korean-legal";
import { calculateWALE, type LeaseUnit, type WaleResult } from "../../wale-calculator";
import { PRIME_TEMPLATE_ALIASES } from "../pptx-theme";
import { calculateSetbackRatio, inferTenantCategory } from "../archetypes/a22-stacking-plan";
import type { StackingPlanFloor, StackingPlanSummary } from "../../types";
import { enforceTextBudget } from "../text-budget";
import type { IMCore, Comp } from "@/types/im-core";
import { createModuleLogger } from "@/lib/logger";
import { SectionData, ParsedTable, DATA_KEY_ARCHETYPE, buildCapitalFromIncome, buildFarUpsideProps, buildDcfFromIncome, buildSensitivityFromDcf, buildLoanFromIncome, buildTaxFromIncome, buildOwnerOccupiedPlanProps, buildOwnerOccupiedVsLeaseProps, buildOwnerOccupiedCommuteProps, buildOwnerOccupiedValueProps, buildDevelopmentLandDetailProps, buildDevelopmentScaleProps, buildDevelopmentEvictionProps, buildDevelopmentCostProps, buildDevelopmentFeasibilityProps, bindInstitutionalTemplateData, bindCorporateTemplateData, bindCommercialTemplateData, bindDevelopmentTemplateData, bindSpecializedTemplateData, bindFromIMCore, bindFromExternalData, bindFromClaimRegistry, transformForArchetype, buildA13Props, buildA15Props, buildA17Props, buildA22Props, buildA11Props, buildA12Props, buildA18Props, buildA02Props, buildA03Props, mergeRentRollTables, buildA04Props, buildA05Props, buildA06Props, buildA07Props, buildA08Props, buildA09Props, buildGenericProps, buildSummaryFromOverview, buildLandFromOverview, buildA16Props, CRE_LEXICON_REPLACEMENTS } from "../data-binder";

/** 역명 정규화: '양재역 신분당선' → '양재역', '강남역 2호선' → '강남역' (HP-10, HP-11) */
export function normalizeStationName(raw: string): string {
    if (!raw) return '';
    return raw
    .replace(/\s*(?:\d+호선|신분당선|수인분당선|공항철도|경의중앙선|경춘선|GTX-?[A-Z]|우이신설선|서해선|경강선|인천\d호선).*$/i, '')
    .replace(/\([^)]*\)$/, '')
    .trim()
    .replace(/역$/, '') + '역';
}

export function findLeadSentence(lines: string[]): string {
    const lead = lines.find(l => 
            !l.startsWith('#') && !l.startsWith('|') && !l.startsWith('-') && 
            !l.startsWith('>') && !/^\d+\./.test(l) && l.length > 10
          );
    return stripMarkdown(lead || '');
}

export function extractStatMetrics(tables: ParsedTable[], lines: string[]): Array<{label: string; value: string; unit?: string}> {
    const metrics: Array<{label: string; value: string; unit?: string}> = [];
    for (const t of tables) {
    for (const row of t.rows) {
      if (row.length >= 2 && metrics.length < 8) {
        metrics.push({
          label: stripMarkdown(row[0]),
          value: stripMarkdown(row[1]),
          unit: row[2] ? stripMarkdown(row[2]) : undefined,
        });
      }
    }
    }

    if (metrics.length === 0) {
    const boldKVs = extractBoldKeyValues(lines);
    boldKVs.slice(0, 8).forEach(bv => {
      metrics.push({ label: bv.key, value: bv.value });
    });
    }

    return metrics;
}

export function extractCallouts(lines: string[]): Array<{kind?: string; title: string; body: string}> {
    const callouts: Array<{kind?: string; title: string; body: string}> = [];
    for (const line of lines) {
    if (line.startsWith('>')) {
      const content = line.replace(/^>\s*/, '');
      const stripped = stripMarkdown(content);
      if (stripped.length < 5) continue;
      
      const kind = content.includes('⚠') ? 'warn' : 'info';
      const parts = stripped.split(/[：:]/);
      callouts.push({
        kind,
        title: parts.length > 1 ? parts[0].trim() : '',
        body: parts.length > 1 ? parts.slice(1).join(':').trim() : stripped,
      });
    }
    }

    return callouts.slice(0, 4);
}

export function extractBulletItems(lines: string[]): Array<{title: string; body: string}> {
    return lines
    .filter(l => l.startsWith('-') || l.startsWith('•') || l.startsWith('·'))
    .map(l => {
      const content = l.replace(/^[-•·]\s*/, '');
      const stripped = stripMarkdown(content);
      const parts = stripped.split(/[：:]/);
      return {
        title: parts.length > 1 ? parts[0].trim() : '',
        body: parts.length > 1 ? parts.slice(1).join(':').trim() : stripped,
      };
    });
}

export function extractBoldKeyValues(lines: string[]): Array<{key: string; value: string}> {
    const results: Array<{key: string; value: string}> = [];
    for (const line of lines) {
    const match = line.match(/\*\*(.*?)\*\*\s*[：:||\-|]\s*(.*)/);
    if (match) {
      results.push({ key: match[1].trim(), value: stripMarkdown(match[2].trim()) });
    }
    }

    return results;
}

export function extractBoldValue(text: string): string {
    const match = text.match(/\*\*(.*?)\*\*/);
    return match ? match[1] : '';
}

/**
 * Markdown 구조(#, **, |, -)를 보존하면서
 * 페르소나 지칭·시스템 메시지·이모지만 제거하는 경량 sanitizer.
 * bindSectionData에서 content 필드 저장 전 적용하여
 * 아키타입 빌더에 전달되는 raw content에서 페르소나 누출을 방지합니다.
 */
export function sanitizePersona(text: string): string {
    if (!text) return '';
    return text
    // ── Poison token eradication: replace NaN/undefined/null/[object Object] with clean neutral '-' ──
    .replace(/\[object Object\]/g, '-')
    .replace(/\bNaN\s*[%원만억천㎡평]/g, '-')
    .replace(/\bundefined\s*[원만억천%㎡평]/g, '-')
    .replace(/\bnull\s*[원만억천%㎡평]/g, '-')
    .replace(/\bNaN\b/g, '-')
    .replace(/\bundefined\b/g, '-')
    .replace(/\bnull\b(?!\s*[=;,\]})])/g, '-')
    // ── 내부 시스템 메시지 제거 ──
    .replace(/>?\s*🔍?\s*\*{0,2}건축물대장\s*조회\s*미완료\*{0,2}[^\n]*/g, '')
    .replace(/>?\s*🔒?\s*\*{0,2}임대차\s*상세\s*현황[^\n]*/g, '')
    .replace(/공공데이터\s*API\s*응답을\s*받지\s*못했습니다[^\n]*/g, '')
    .replace(/추후\s*업데이트\s*시\s*자동\s*반영됩니다\.?/g, '')
    // ── 이모지 → 카테고리 라벨 매핑 (단순 제거 대신 맥락 보존) ──
    .replace(/🚇/g, '[교통]').replace(/🛣️/g, '[교통]').replace(/🚗/g, '[교통]')
    .replace(/🏢/g, '[건물]').replace(/🏥/g, '[의료]').replace(/🏫/g, '[교육]')
    .replace(/📈/g, '[성장]').replace(/📉/g, '[하락]').replace(/💰/g, '[수익]')
    .replace(/⚠️/g, '[주의]').replace(/🔒/g, '[보안]').replace(/⚖️/g, '[법률]')
    .replace(/📋/g, '[임대]').replace(/🎯/g, '[전략]').replace(/🚀/g, '[실행]')
    .replace(/💡/g, '[참고]').replace(/🔍/g, '[분석]').replace(/🛡️/g, '[안전]')
    .replace(/☕/g, '[상권]').replace(/⭐/g, '__STAR__').replace(/✨/g, '').replace(/✓/g, '✔')
    // 나머지 매핑 안 된 이모지는 제거
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{1F300}-\u{1FAFF}\u{25A0}-\u{25FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}🟢🔵🔶▲●◇]/gu, '')
    // ★ 플레이스홀더 복원 (벤치마크 별점 및 Provenance 배지용)
    .replace(/__STAR__/g, '★')
    // ── 페르소나 직접 지칭 정제 (W-PPTX-4: 범용 캐치올 강화) ──
    .replace(/(?:70대|60대|50대|40대|30대|20대|MZ|초보|고액|고자산|법인|개인|VIP|기관|리츠|시행사|디벨로퍼|부부|은퇴)\s*(?:자산가|투자자|법인\s*대표|대표|고객|매수자|운용사|펀드|가족)(?:를\s*위한|의\s*관점|에게\s*추천하는|용|맞춤|에\s*적합한|을\s*위한)?\s*/gu, '')
    // W-PPTX-4: 범용 캐치올 — "~자/가/인 맞춤/전용/추천" 패턴
    .replace(/(?:[가-힣]+(?:자|가|인|사)\s+(?:맞춤|전용|추천|적합)\s*(?:형|용)?)\s*/gu, '')
    // ── 가드레일/익명화 토큰 정제 ──
    .replace(/\[인명\s*비공개\]게/g, '담당자에게')
    .replace(/\[인명\s*비공개\]에게/g, '담당자에게')
    .replace(/\[인명\s*비공개\]/g, '담당자')
    .replace(/\[지역\s*신호로\s*대체됨\]/g, '해당 권역')
    .replace(/\[임차인\s*업종\s*정보로\s*대체됨\]/g, '주요 임차 업종')
    .replace(/\[이메일\s*비공개\]/g, '문의처')
    .replace(/\[연락처\s*비공개\]/g, '문의처')
    // ── 갱신요구권 환각 방어: 최초계약일 미확인 시 연수 단정 방지 (G18 보완) ──
    .replace(/갱신요구권\s*\d+(?:\.\d+)?\s*년(?:\s*잔여)?/g, '계약갱신요구권(관련 법령 적용)')
    // ── 회피성 문구 정제 (본문을 참조 / 자산 개요 참조 등) ──
    .replace(/(?:IM\s*)?본문을?\s*참조\S*(?:\s*바랍니다|\s*하세요|\s*바람)?/g, '')
    .replace(/(?:자산\s*개요(?:\s*섹션)?|실사\s*보고서|실사\s*자료)(?:을|를)?\s*참조\S*(?:\s*바랍니다|\s*하세요|\s*바람)?/g, '');
}

/** Markdown 서식 및 SSoT 내부 표기 정제 */
export function stripMarkdown(text: string): string {
    if (!text) return '';
    let cleaned = text
            // ── 내부 시스템 메시지 먼저 제거 (마크다운/이모지 파싱 전) ──
            .replace(/>?\s*🔍?\s*\*{0,2}건축물대장\s*조회\s*미완료\*{0,2}[^\n]*/g, '')
            .replace(/>?\s*🔒?\s*\*{0,2}임대차\s*상세\s*현황[^\n]*/g, '')
            .replace(/공공데이터\s*API\s*응답을\s*받지\s*못했습니다[^\n]*/g, '')
            .replace(/추후\s*업데이트\s*시\s*자동\s*반영됩니다\.?/g, '')
            .replace(/^#+\s*/gm, '')
            // ── 수평선(---/***) 제거 ──
            .replace(/^\s*[-*_]{3,}\s*$/gm, '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/`(.*?)`/g, '$1')
            .replace(/\[(.*?)\]\(.*?\)/g, '$1')
            // ── HTML 태그 제거 (XSS 방어, PPTX 텍스트 보호) ──
            .replace(/<[^>]*>/g, '')
            .replace(/\u2605/g, '__STAR__')
            .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{1F300}-\u{1FAFF}\u{25A0}-\u{25FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}✨🚇✓▲●◇🟢🔵🔶💡🛣️🚗🏥🏢☕⚖️📋🔒⚠️🔍]/gu, '')
            .replace(/__STAR__/g, '★')
            .replace(/(?:70대|60대|50대|40대|30대|20대|MZ|초보|고액|고자산|법인|개인|VIP|기관|리츠|시행사|디벨로퍼|부부|은퇴)\s*(?:자산가|투자자|법인\s*대표|대표|고객|매수자|운용사|펀드|가족)(?:를\s*위한|의\s*관점|에게\s*추천하는|용|맞춤|에\s*적합한|을\s*위한)?\s*/gu, '')
            .replace(/(?:[가-힣]+(?:자|가|인|사)\s+(?:맞춤|전용|추천|적합)\s*(?:형|용)?)\s*/gu, '');
    for (const [pattern, replacement] of CRE_LEXICON_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
    }

    return cleaned
    // ── SSoT 내부 표기 정제 ──
    .replace(/\s*\(BSSoT\s*Lite[^)]*\)/gi, '')
    .replace(/\s*\(기재\s*공란\)/g, '')
    .replace(/근린생활시설\s*또는\s*상업용\s*건물로\s*추정\s*/g, '')
    .replace(/건축물대장상\s*확인\s*필요/g, '건축물대장 등재 기준')
    .replace(/(으로|로)\s*추정(되는|됨|)\s*/g, '')
    .replace(/인\s*것으로\s*(보임|판단됨|보여짐)\s*/g, '')
    .replace(/일\s*가능성이\s*있(음|습니다)\s*/g, '')
    .replace(/~?(으로|로)\s*보(임|입니다|여집니다)\s*/g, '')
    // ── 가드레일/익명화 토큰 자연어 정제 (조사 탈락 방지) ──
    .replace(/\[인명\s*비공개\]게/g, '담당자에게')
    .replace(/\[인명\s*비공개\]에게/g, '담당자에게')
    .replace(/\[인명\s*비공개\]/g, '담당자')
    .replace(/\[지역\s*신호로\s*대체됨\]/g, '해당 권역')
    .replace(/\[임차인\s*업종\s*정보로\s*대체됨\]/g, '주요 임차 업종')
    .replace(/\[이메일\s*비공개\]/g, '문의처')
    .replace(/\[연락처\s*비공개\]/g, '문의처')
    // ── 어휘 중복 정제 (예: '핵심 권역 권역' -> '핵심 권역') ──
    // D38 BL-2: 3회 이상 반복도 축소 (예: '상권 상권 상권' → '상권')
    .replace(/(권역|입지|상권|역세권|대로변|인프라)(\s+\1)+/g, '$1')
    // D38 BL-2: 면적 중복 정제 "476㎡ (약 144평(약 476㎡))" → "476㎡ (약 144평)"
    .replace(/(\d[\d,.]*㎡)\s*\(약\s*(\d[\d,.]*평)\s*\(약\s*\d[\d,.]*㎡\)\)/g, '$1 (약 $2)')
    .replace(/약\s*(\d[\d,.]*평)\s*\(약\s*\d[\d,.]*㎡\)/g, '약 $1')
    // ── 문미 dangling 대시/기호 정제 ──
    .replace(/\s*[—–-]\s*$/g, '')
    // ── 연속된 마침표/구두점 정제 (예: 필요합니다.. -> 필요합니다.) ──
    .replace(/\.{2,}/g, '.')
    // ── 회피성 문구 정제 (본문을 참조 / 자산 개요 참조 등) ──
    .replace(/(?:IM\s*)?본문을?\s*참조\S*(?:\s*바랍니다|\s*하세요|\s*바람)?/g, '')
    .replace(/(?:자산\s*개요(?:\s*섹션)?|실사\s*보고서|실사\s*자료)(?:을|를)?\s*참조\S*(?:\s*바랍니다|\s*하세요|\s*바람)?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 텍스트 길이 제한 (PPTX 셀 오버플로 방지) */
export function truncate(text: string, maxLen: number): string {
    const cleaned = stripMarkdown(text);
    return enforceTextBudget(cleaned, maxLen);
}

export function parseMarkdownTable(markdown: string): ParsedTable[] {
    const tables: ParsedTable[] = [];
    const lines = markdown.split('\n');
    let currentTable: ParsedTable | null = null;
    for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).filter((_, index, arr) => index > 0 && index < arr.length - 1);
      const isSep = cells.every(c => /^[-:]+$/.test(c));
      
      if (isSep) {
        if (currentTable && currentTable.rows.length > 0) {
          // 직전 행이 새 테이블의 헤더였던 경우: 직전 행을 꺼내서 새 테이블 생성
          const newHeaders: string[] = currentTable.rows.pop()!;
          if (currentTable.headers.length > 0 || currentTable.rows.length > 0) {
            tables.push(currentTable);
          }
          currentTable = { headers: newHeaders, rows: [] };
        }
        continue;
      }
      
      if (!currentTable) {
        currentTable = { headers: cells, rows: [] };
      } else {
        // 다음 행이 테이블 구분선인지 확인 (헤더 탐지)
        const nextLine = lines[i + 1]?.trim() || '';
        const nextIsSep = nextLine.startsWith('|') &&
          nextLine.split('|').map(c => c.trim()).filter((_, idx, a) => idx > 0 && idx < a.length - 1).every(c => /^[-:]+$/.test(c));

        if (nextIsSep) {
          tables.push(currentTable);
          currentTable = { headers: cells, rows: [] };
        } else if (cells.length === currentTable.headers.length) {
          currentTable.rows.push(cells);
        } else {
          // 열 수가 다른 행이 바로 이어지는 경우 새 테이블로 격리
          if (cells.length > 0) {
            tables.push(currentTable);
            currentTable = { headers: cells, rows: [] };
          }
        }
      }
    } else {
      if (currentTable) {
        tables.push(currentTable);
        currentTable = null;
      }
    }
    }

    if (currentTable) {
    tables.push(currentTable);
    }

    return tables;
}

export function extractMetrics(markdown: string): Record<string, string> {
    const metrics: Record<string, string> = {};
    const moneyMatch = markdown.match(/([0-9,]+(?:억|만원|원))/g);
    if (moneyMatch) {
    metrics.money = moneyMatch[0];
    }

    const areaMatch = markdown.match(/([0-9,.]+(?:㎡|평))/g);
    if (areaMatch) {
    metrics.area = areaMatch[0];
    }

    const ratioMatch = markdown.match(/([0-9.]+[%])/g);
    if (ratioMatch) {
    metrics.ratio = ratioMatch[0];
    }

    return metrics;
}

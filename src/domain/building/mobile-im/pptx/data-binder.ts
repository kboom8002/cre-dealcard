import { SECTION_LABELS } from '@/domain/ontology/d56-labels';
import {
  normalizeStationName,
  findLeadSentence,
  extractStatMetrics,
  extractCallouts,
  extractBulletItems,
  extractBoldKeyValues,
  extractBoldValue,
  sanitizePersona,
  stripMarkdown,
  truncate,
  parseMarkdownTable,
  extractMetrics
} from './binder/binder-utils';
import {
  buildCapitalFromIncome,
  buildFarUpsideProps,
  buildDcfFromIncome,
  buildSensitivityFromDcf,
  buildLoanFromIncome,
  buildTaxFromIncome,
  buildOwnerOccupiedPlanProps,
  buildOwnerOccupiedVsLeaseProps,
  buildOwnerOccupiedCommuteProps,
  buildOwnerOccupiedValueProps,
  buildDevelopmentLandDetailProps,
  buildDevelopmentScaleProps,
  buildDevelopmentEvictionProps,
  buildDevelopmentCostProps,
  buildDevelopmentFeasibilityProps,
  buildOperatingKpiProps,
  buildOperatingRevenueProps,
  buildOperatingSeasonalityProps,
  buildOperatingOperatorProps
} from './binder/posture-builders';
import {
  bindInstitutionalTemplateData,
  bindCorporateTemplateData,
  bindCommercialTemplateData,
  bindDevelopmentTemplateData,
  bindSpecializedTemplateData
} from './binder/premium-binders';
import {
  bindOwnerOccupiedInlineSection,
  bindDevelopmentInlineSection,
  bindOperatingInlineSection,
  bindTradingInlineSection,
  ensureOwnerOccupiedSafetyNet,
  ensureDevelopmentSafetyNet,
} from './binder/posture-dispatch';
export {
  bindOwnerOccupiedInlineSection,
  bindDevelopmentInlineSection,
  bindOperatingInlineSection,
  bindTradingInlineSection,
  ensureOwnerOccupiedSafetyNet,
  ensureDevelopmentSafetyNet,
};
import {
  generateMultiYearCashFlow,
  generate2DSensitivityMatrix,
  generateDevelopmentFeasibilityBudget,
  validateProImFinancialConsistency,
} from '../../im-core/pro-financial-model';
import {
  chunkTenantRoster,
  calculateTenantRosterSubtotal,
  calculateProWALE,
  type InstitutionalTenantRosterItem,
} from '../../im-core/pro-tenant-roster';
import {
  bindFromIMCore,
  bindFromExternalData,
  bindFromClaimRegistry
} from './binder/core-binders';
import {
  transformForArchetype,
  buildA13Props,
  buildA15Props,
  buildA17Props,
  buildA22Props,
  buildA11Props,
  buildA12Props,
  buildA18Props,
  buildA02Props,
  buildA03Props,
  mergeRentRollTables,
  buildA04Props,
  buildA05Props,
  buildA06Props,
  buildA07Props,
  buildA08Props,
  buildA09Props,
  buildGenericProps,
  buildSummaryFromOverview,
  buildLandFromOverview,
  buildA16Props
} from './binder/archetype-builders';
import { formatPyeong } from '@/lib/utils/area-conversion';
import { GALLERY_EXCLUDE_CATEGORIES } from './gallery-planner';

export {
  normalizeStationName,
  findLeadSentence,
  extractStatMetrics,
  extractCallouts,
  extractBulletItems,
  extractBoldKeyValues,
  extractBoldValue,
  sanitizePersona,
  stripMarkdown,
  truncate,
  parseMarkdownTable,
  extractMetrics
};
export {
  buildCapitalFromIncome,
  buildFarUpsideProps,
  buildDcfFromIncome,
  buildSensitivityFromDcf,
  buildLoanFromIncome,
  buildTaxFromIncome,
  buildOwnerOccupiedPlanProps,
  buildOwnerOccupiedVsLeaseProps,
  buildOwnerOccupiedCommuteProps,
  buildOwnerOccupiedValueProps,
  buildDevelopmentLandDetailProps,
  buildDevelopmentScaleProps,
  buildDevelopmentEvictionProps,
  buildDevelopmentCostProps,
  buildDevelopmentFeasibilityProps
};
export {
  bindInstitutionalTemplateData,
  bindCorporateTemplateData,
  bindCommercialTemplateData,
  bindDevelopmentTemplateData,
  bindSpecializedTemplateData
};
export {
  bindFromIMCore,
  bindFromExternalData,
  bindFromClaimRegistry
};
export {
  transformForArchetype,
  buildA13Props,
  buildA15Props,
  buildA17Props,
  buildA22Props,
  buildA11Props,
  buildA12Props,
  buildA18Props,
  buildA02Props,
  buildA03Props,
  mergeRentRollTables,
  buildA04Props,
  buildA05Props,
  buildA06Props,
  buildA07Props,
  buildA08Props,
  buildA09Props,
  buildGenericProps,
  buildSummaryFromOverview,
  buildLandFromOverview,
  buildA16Props
};

// ── 분할된 하위 모듈 (re-export로 기존 import 경로 100% 호환) ──
import type { SectionData } from './binder/binder-types';
import { SECTION_TYPE_TO_DATA_KEY, DATA_KEY_ARCHETYPE } from './binder/binder-types';
import { bindProImChapterData } from './binder/pro-chapter-binder';
import { bindRentRollTable } from './binder/rent-roll-table-builder';
export type { SectionData, ParsedTable } from './binder/binder-types';
export { SECTION_TYPE_TO_DATA_KEY, DATA_KEY_ARCHETYPE } from './binder/binder-types';
export { CRE_LEXICON_REPLACEMENTS } from './binder/lexicon';
export { bindProImChapterData } from './binder/pro-chapter-binder';
export { bindRentRollTable } from './binder/rent-roll-table-builder';

import { buildYieldFromHeroCard, buildYieldFromIMCore, yieldLabel, type Yield } from './yield-object';
import type { ClaimRegistry } from '@/domain/building/im-core/claim-registry';
import type { PermitZoneResult } from '@/domain/building/im-core/permit-zone';
import type { ConvertedDepositResult, EffectiveRentResult } from '@/domain/building/im-core/lease-calc';
import type { KoreanLegalFields } from '@/domain/building/im-core/korean-legal';
import { calculateWALE, type LeaseUnit, type WaleResult } from '../wale-calculator';
import { PRIME_TEMPLATE_ALIASES } from './pptx-theme';
import { calculateSetbackRatio, inferTenantCategory } from './archetypes/a22-stacking-plan';
import type { StackingPlanFloor, StackingPlanSummary } from '../types';

export function bindSectionData(
  doc: { title?: string; body: Record<string, any>; sections?: Array<{title: string; markdown: string; confidence?: string; boundary_note?: string; section_type?: string}> },
  building?: { area_signal?: string; asset_type?: string; price_band?: string },
  templateId?: string,
): Record<string, SectionData> {
  const result: Record<string, SectionData> = {};
  const posture = doc.body?.investment_posture
    || doc.body?.identity?.investmentPosture
    || doc.body?.posture
    || 'income';
  // D32 BL-6: 결손 문구 수집 배열 (체크리스트 이관용)
  const collectedDeficiencies: string[] = [];

  if (!doc.sections || doc.sections.length === 0) {
    return result;
  }

  for (const section of doc.sections) {
    // 1. section_type으로 primary dataKey 결정 (다양한 section 객체 스키마 지원)
    const sec = section as Record<string, any>;
    const sectionType = sec.section_type
      || sec.type
      || sec.sectionType
      || sec.sectionId
      || (
        section.title?.includes('사옥으로') ? 'occupancy_fit' :
        section.title?.includes('임차 유지') ? 'cost_comparison' :
        section.title?.includes('왜 지금') ? 'investment_thesis' :
        section.title?.includes('어떤 자산') ? 'property_overview' :
        section.title?.includes('입지') ? 'location_access' :
        section.title?.includes('권리관계') ? 'title_rights' :
        section.title?.includes('체크리스트') ? 'checklist' :
        section.title?.includes('다음 단계') ? 'next_steps' :
        section.title?.includes('리스크') ? 'risk_check' : undefined
      );
    const dataKey = (sectionType && SECTION_TYPE_TO_DATA_KEY[sectionType])
      ? SECTION_TYPE_TO_DATA_KEY[sectionType]
      : sectionType || section.title.toLowerCase().replace(/\s+/g, '_');

    // 2. D32 BL-6: 결손 문구 추출 → 삭제 대신 체크리스트로 이관
    const deficiencyPatterns = [
      /건축물대장\s*조회\s*미완료/,
      /임대차\s*상세\s*현황.*미확보/,
      /공공데이터\s*API\s*응답을\s*받지\s*못했습니다/,
      /조회\s*미완료/,
      /확인\s*필요/,
      /미확보/,
      /자료\s*없음/,
    ];
    const deficiencyItems: string[] = [];
    // D38 BL-1: 내부 dataKey → 한국어 섹션 라벨 매핑 (Rule 2 CRE 용어 준수)
        const sectionLabel = SECTION_LABELS[dataKey] || dataKey;
    const mdLines = (section.markdown || '').split('\n');
    for (const line of mdLines) {
      const trimmed = line.replace(/^[>\s*#\-•·]+/, '').trim();
      if (trimmed && deficiencyPatterns.some(p => p.test(trimmed))) {
        // 테이블 행이면 파이프 분리 후 의미 있는 셀만 추출
        let cleanItem: string;
        if (trimmed.includes('|')) {
          const cells = trimmed.split('|').map(c => c.trim()).filter(Boolean);
          cleanItem = stripMarkdown(cells.join(' · '));
        } else {
          cleanItem = stripMarkdown(trimmed);
          // 긴 문단이면 결손 패턴이 매칭된 단일 문장만 추출
          if (cleanItem.length > 60) {
            const sentences = cleanItem.split(/(?<=[.?!])\s+/);
            const matched = sentences.find(s => deficiencyPatterns.some(p => p.test(s)));
            cleanItem = matched ? matched.trim() : cleanItem;
          }
        }
        if (cleanItem.length > 60) {
          cleanItem = cleanItem.slice(0, 57) + '...';
        }
        deficiencyItems.push(`[${sectionLabel}] ${cleanItem}`);
      }
    }
    if (deficiencyItems.length > 0) {
      collectedDeficiencies.push(...deficiencyItems);
    }

    // 페르소나/시스템 메시지 사전 제거 (markdown 구조 보존)
    let cleanMarkdown = sanitizePersona(section.markdown);

    // D-JSON-LEAK: AI가 프롬프트 컨텍스트 JSON을 마크다운에 그대로 출력한 경우 제거
    // 예: {"ok":true,"mocked":true,"extractedFields":{...}} 형태의 API 응답 원문 리크
    if (cleanMarkdown && /^\{["\s]/.test(cleanMarkdown.trim()) && /"[^"]+"\s*:/.test(cleanMarkdown)) {
      // 마크다운 전체가 JSON이면 빈 문자열로 (이후 폴백 처리에 위임)
      const trimmed = cleanMarkdown.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        console.warn(`[D-JSON-LEAK] Section content is raw JSON — cleared`, { dataKey, sectionType });
        cleanMarkdown = '';
      } else {
        // 마크다운 내 JSON 블록만 줄 단위로 제거
        const filteredLines = cleanMarkdown.split('\n').filter(line => {
          const t = line.trim();
          return !(t.length > 80 && /^\{["\s]/.test(t) && /"[^"]+"\s*:/.test(t));
        });
        cleanMarkdown = filteredLines.join('\n');
      }
    }

    // 3. 테이블/메트릭 기본 파싱
    const tables = parseMarkdownTable(cleanMarkdown);
    const metrics = extractMetrics(cleanMarkdown);

    // 3. 아키타입별 props 변환
    const archetype = DATA_KEY_ARCHETYPE[dataKey];
    const props = transformForArchetype(cleanMarkdown, tables, archetype, doc.body);

    // 4. 기존 key가 없거나, 기존 key가 파생 폴백(_derived)인 경우 명시적 섹션으로 덮어씀 (중복 방지 및 명시적 섹션 우선)
    if (!result[dataKey] || result[dataKey]._derived) {
      const resolvePhotoUrl = (p: any): string | null => {
        if (!p) return null;
        if (typeof p === 'string') return p;
        if (typeof p === 'object' && p.url) return String(p.url);
        if (typeof p === 'object' && p.path) return String(p.path);
        return null;
      };
      // D4: 도면·지도 문서 이미지(위치도/지구단위계획도/도면/지적도 등)는 대표 사진 후보에서 제외
      const isDocPhoto = (p: any): boolean => !!p && typeof p === 'object'
        && GALLERY_EXCLUDE_CATEGORIES.has(String(p.category || p.type || '').toLowerCase());
      const photoCandidates = (arr: any): any => (Array.isArray(arr) ? arr.filter((p: any) => !isDocPhoto(p)) : arr);
      const firstPhoto = resolvePhotoUrl(photoCandidates(doc.body.photos_v2)?.[0])
        ?? resolvePhotoUrl(photoCandidates(doc.body.photos)?.[0])
        ?? (Array.isArray(doc.body.photo_urls) ? doc.body.photo_urls[0] : null);
      result[dataKey] = {
        title: section.title,
        content: cleanMarkdown,
        tables,
        metrics,
        confidence: section.confidence || '확인 중',
        boundaryNote: section.boundary_note,
        photoUrl: firstPhoto,
        photos: photoCandidates(doc.body.photos_v2) || photoCandidates(doc.body.photos) || doc.body.photo_urls,
        ...props
      };
    }

    // summary 섹션이 명시적으로 주어졌을 때는 summary 슬라이드 데이터로 직접 덮어쓰기
    if (sectionType === 'summary') {
      result['summary'] = {
        title: section.title || '핵심 투자 지표 요약',
        content: cleanMarkdown,
        tables,
        metrics,
        confidence: section.confidence || '미확인',
        boundaryNote: section.boundary_note,
        ...props
      };
    }

    // property_overview → land/summary에도 파생 데이터 제공 (summary가 없을 때만)
    if (sectionType === 'property_overview') {
      const enrichedBody = { ...doc.body, preset: templateId ?? doc.body?.preset };
      if (!result['summary']) {
        const summaryProps = buildSummaryFromOverview(cleanMarkdown, tables, enrichedBody);
        result['summary'] = { title: '핵심요약', content: '', tables: [], metrics: {}, _derived: true, ...summaryProps };
        // D33 BL-C: Yield 단일 객체를 dataMap 최상위에 주입 — 전 슬라이드 공유
        if (summaryProps._yield) {
          result._yield = summaryProps._yield;
        }
      }
      // V-World 데이터(_source 있음)가 없을 때만 마크다운 파싱 폴백
      const landProps = buildLandFromOverview(cleanMarkdown, tables);
      if (!result['land'] || !result['land']._source) {
        result['land'] = { title: '토지', content: '', tables: [], metrics: {}, _derived: true, ...landProps };
      }
    }
    
    // income_analysis → capital, dcf, sensitivity, loan, tax에도 파생 데이터 제공
    if (sectionType === 'income_analysis') {
      const capitalProps = buildCapitalFromIncome(cleanMarkdown, tables, doc.body, building);
      if (!result['capital'] || result['capital']._derived) result['capital'] = { title: '자본구조', content: '', tables: [], metrics: {}, _derived: true, ...capitalProps };

      // Pro 전용 파생 슬라이드 데이터 바인딩
      if (!result['dcf'] || result['dcf']._derived) result['dcf'] = { title: 'DCF 분석', content: '', tables: [], metrics: {}, _derived: true, ...buildDcfFromIncome(cleanMarkdown, tables, doc.body) };
      if (!result['sensitivity'] || result['sensitivity']._derived) result['sensitivity'] = { title: '수익률 민감도', content: '', tables: [], metrics: {}, _derived: true, ...buildSensitivityFromDcf(doc.body) };
      if (!result['loan'] || result['loan']._derived) result['loan'] = { title: '대출 구조', content: '', tables: [], metrics: {}, _derived: true, ...buildLoanFromIncome(cleanMarkdown, tables, doc.body) };
      if (!result['tax'] || result['tax']._derived) result['tax'] = { title: '세금 추정', content: '', tables: [], metrics: {}, _derived: true, ...buildTaxFromIncome(doc.body) };
    }

    // lease_status / stacking_plan → stability, vacancy, current, stackingPlan 등에도 파생 데이터 제공
    if (sectionType === 'lease_status' || sectionType === 'stacking_plan') {
      const stabilityProps = transformForArchetype(cleanMarkdown, tables, 'A04');

      // D41 A4: floor_leases 기반 공실률/임대료 직접 계산
      const leases: any[] = (doc.body?.floor_leases ?? []).filter(Boolean);
      if (leases.length > 0) {
        const totalSpaces = leases.length;
        const vacantSpaces = leases.filter((l: any) => l && l.is_vacant === true).length;
        const occupiedSpaces = totalSpaces - vacantSpaces;
        const vacancyRate = totalSpaces > 0 ? ((vacantSpaces / totalSpaces) * 100).toFixed(1) : '0.0';
        const monthlyRent = leases.reduce((sum: number, l: any) => sum + (l?.rent_manwon ?? 0), 0);
        const annualRent = monthlyRent * 12;

        // stability rows에 계산된 수치 주입
        const computedRows: [string, string][] = [
          ['공실 현황', vacantSpaces === 0 ? `공실 없음 (${totalSpaces}구획 중 ${occupiedSpaces}구획 임대중)` : `${vacantSpaces}구획 공실 (공실률 ${vacancyRate}%)`],
          ['월 임대료 합계', `${monthlyRent.toLocaleString()}만 원/월`],
          ['연 임대 수입', `약 ${(annualRent / 10000).toFixed(1)}억 원/년`],
          ['임차인 구성', leases.filter((l: any) => l.tenant_name && (l.rent_manwon ?? 0) > 0).map((l: any) => `${l.floor} ${l.tenant_name}`).join(', ')],
        ];

        if (stabilityProps.left) {
          stabilityProps.left.rows = computedRows;
        } else {
          stabilityProps.left = { sub: '임대 안정성 지표 (렌트롤 기반)', rows: computedRows };
        }
        // 우측에 "비공개 처리" 안내 제거 — 빈 callout 대신 업종 분포 표시
        const typeDistribution = leases.filter((l: any) => l.tenant_type).reduce((acc: Record<string, number>, l: any) => {
          acc[l.tenant_type] = (acc[l.tenant_type] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const distStr = Object.entries(typeDistribution).map(([type, cnt]) => `${type}: ${cnt}구획`).join(', ');
        stabilityProps.right = {
          sub: '업종 분포',
          callouts: [
            { kind: 'good', title: '임차인 구성 안정성', body: distStr || '임차인 업종 정보 없음' },
          ],
        };
      }

      if (!result['stability'] || result['stability']._derived) result['stability'] = { title: '임대안정성', content: cleanMarkdown, tables, metrics, _derived: true, ...stabilityProps };
      if (!result['vacancy'] || result['vacancy']._derived) result['vacancy'] = { title: '공실 분석', content: cleanMarkdown, tables, metrics, _derived: true, ...stabilityProps };
      if (!result['current'] || result['current']._derived) result['current'] = { title: '현황 분석', content: cleanMarkdown, tables, metrics, _derived: true, ...stabilityProps };

      const a22Props = buildA22Props(cleanMarkdown, tables, cleanMarkdown.split('\n'), doc.body);
      if (!result['stackingPlan'] || result['stackingPlan']._derived) {
        result['stackingPlan'] = {
          title: section.title || '스태킹 플랜',
          content: cleanMarkdown,
          tables,
          metrics,
          _derived: true,
          ...a22Props,
        };
      }

      // A24 렌트롤 테이블 (floor_leases 상세 → ssot_summary 요약 폴백) — binder/rent-roll-table-builder.ts
      bindRentRollTable(doc, cleanMarkdown, result);
    }

    // income_analysis → rentGap, upside, leasing, remodel, comps 등 파생 데이터 제공
    if (sectionType === 'income_analysis') {
      const subsections = cleanMarkdown.split(/(?=^#{2,3}\s)/m).filter(Boolean);
      
      const mdRentGap = subsections[0] || cleanMarkdown;
      const mdUpside = subsections[1] || subsections[0] || cleanMarkdown;
      const mdLeasing = subsections[2] || subsections[0] || cleanMarkdown;
      const mdRemodel = subsections[3] || subsections[0] || cleanMarkdown;

      const pRentGap = transformForArchetype(mdRentGap, tables, 'A05');
      const pUpside = transformForArchetype(mdUpside, tables, 'A05');
      const pLeasing = transformForArchetype(mdLeasing, tables, 'A05');
      const pRemodel = transformForArchetype(mdRemodel, tables, 'A05');
      const a03Props = transformForArchetype(cleanMarkdown, tables, 'A03');

      if (!result['rentGap'] || result['rentGap']._derived) result['rentGap'] = { title: '임대료 갭', content: mdRentGap, tables, metrics, _derived: true, ...pRentGap };
      if (!result['upside'] || result['upside']._derived) result['upside'] = { title: '인상 경로', content: mdUpside, tables, metrics, _derived: true, ...pUpside };
      if (!result['leasing'] || result['leasing']._derived) result['leasing'] = { title: '임차 유치', content: mdLeasing, tables, metrics, _derived: true, ...pLeasing };
      if (!result['remodel'] || result['remodel']._derived) result['remodel'] = { title: '리모델링 계획', content: mdRemodel, tables, metrics, _derived: true, ...pRemodel };
      // D41 A2b: income_analysis → comps fallback 제거
      // 비교사례(comps) 슬라이드에 재무분석 데이터가 오염되는 버그 수정
      // comps는 manual_comps 또는 RTMS API에서만 바인딩되어야 함
      if (!result['farUpside'] || result['farUpside']._derived) {
        result['farUpside'] = { title: '용적률 여유', content: cleanMarkdown, tables, metrics, _derived: true, ...buildFarUpsideProps(cleanMarkdown, tables, doc.body, building) };
      }
    }

    // W-5: posture-specific inline section binding (extracted to posture-dispatch)
    bindOwnerOccupiedInlineSection(sectionType, posture, cleanMarkdown, tables, metrics, doc, building, result);
    bindDevelopmentInlineSection(sectionType, posture, cleanMarkdown, tables, metrics, doc, building, result);
    bindOperatingInlineSection(sectionType, cleanMarkdown, tables, metrics, doc, building, result);
    bindTradingInlineSection(sectionType, cleanMarkdown, tables, metrics, result);
  }

  // D38: capital 슬라이드가 없으면 A16 구조화 데이터 합성 (모든 포스처/등급 안전망)
  if (!result['capital']) {
    const capitalProps = buildCapitalFromIncome('', [], doc.body, building);
    result['capital'] = { title: '자본구조', content: '', tables: [], metrics: {}, _derived: true, ...capitalProps };
  }

  // D38: farUpside 슬라이드가 없으면 용적률 여유 데이터 합성 (R-INC-02 안전망)
  if (!result['farUpside']) {
    const farUpsideProps = buildFarUpsideProps('', [], doc.body, building);
    result['farUpside'] = { title: '용적률 여유', content: '', tables: [], metrics: {}, _derived: true, ...farUpsideProps };
  }

  // A22: stackingPlan 슬라이드가 없으면 스태킹 플랜 구조화 데이터 합성
  if (!result['stackingPlan']) {
    const a22Props = buildA22Props('', [], [], doc.body);
    result['stackingPlan'] = { title: '스태킹 플랜', content: '', tables: [], metrics: {}, _derived: true, ...a22Props };
  }

  // W-5: posture-specific safety-net slide generation (extracted to posture-dispatch)
  ensureOwnerOccupiedSafetyNet(doc, building, result);
  ensureDevelopmentSafetyNet(doc, building, result);

  // D32 BL-6 / D38: 결손 문구 및 실사 점검 항목을 checklist 슬롯에 온전히 주입 (A18 일원화)
  const existingChecklist = result['checklist']?.checkItems ?? [];
  const allCheckItems = [...existingChecklist, ...collectedDeficiencies];

  if (allCheckItems.length === 0) {
    allCheckItems.push(
      '등기부등본 갑구/을구 권리관계 및 근저당 채권최고액 전액 말소 조건 원본 대조',
      '임대차 원본 계약서 검토 (보증금, 월임대료, 관리비 실입금 내역 및 제소전화해조서)',
      '건축물대장상 위반건축물 등재 여부 및 불법 증축·용도변경 이행강제금 납부 이력 점검',
      '토지이용계획확인원상 도시계획시설 저촉, 건축선 후퇴, 지구단위계획 특별계획구역 확인',
      '기계식 주차기 정기 안전점검 합격증, 승강기 검사필증, 소방 완비증명서 실물 실사',
      '정화조 용량 대비 현 업종 적합성 및 하수도 원인자부담금 추가 부과 대상 여부 확인'
    );
  }

  const checklistMarkdown = allCheckItems.map(item => `• ${item}`).join('\n');
  result['checklist'] = {
    title: '실사 점검 항목 및 인수 조건',
    kicker: 'DUE DILIGENCE CHECKLIST',
    content: checklistMarkdown,
    markdown: checklistMarkdown,
    tables: [],
    metrics: {},
    checkItems: allCheckItems,
    _derived: true,
  };

  if (collectedDeficiencies.length > 0) {
    result['_deficiencies'] = {
      title: '결손 항목',
      content: '',
      tables: [],
      metrics: {},
      checkItems: [...collectedDeficiencies],
    };
    log.warn({ collectedDeficiencies: collectedDeficiencies }, `[BL-6 / D38] ${collectedDeficiencies.length}건의 결손 문구를 A18 체크리스트로 이관 완료`);
  }

  // 4대 완성형 프라임 템플릿 특화 데이터 바인딩
  const activeTemplateId = templateId ?? doc.body?.templateId ?? doc.body?.presetId;
  if (activeTemplateId) {
    bindSpecializedTemplateData(activeTemplateId, doc, result);
  }

  // Pro IM 5대 챕터 정형 데이터 바인딩
  bindProImChapterData(doc, building, result);

  return result;
}

import { enforceTextBudget } from './text-budget';
import type { IMCore, Comp } from '@/types/im-core';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('data-binder');

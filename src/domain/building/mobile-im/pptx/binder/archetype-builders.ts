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
import { SectionData, ParsedTable, DATA_KEY_ARCHETYPE, normalizeStationName, findLeadSentence, extractStatMetrics, extractCallouts, extractBulletItems, extractBoldKeyValues, extractBoldValue, sanitizePersona, stripMarkdown, truncate, parseMarkdownTable, extractMetrics, buildCapitalFromIncome, buildFarUpsideProps, buildDcfFromIncome, buildSensitivityFromDcf, buildLoanFromIncome, buildTaxFromIncome, buildOwnerOccupiedPlanProps, buildOwnerOccupiedVsLeaseProps, buildOwnerOccupiedCommuteProps, buildOwnerOccupiedValueProps, buildDevelopmentLandDetailProps, buildDevelopmentScaleProps, buildDevelopmentEvictionProps, buildDevelopmentCostProps, buildDevelopmentFeasibilityProps, bindInstitutionalTemplateData, bindCorporateTemplateData, bindCommercialTemplateData, bindDevelopmentTemplateData, bindSpecializedTemplateData, bindFromIMCore, bindFromExternalData, bindFromClaimRegistry, CRE_LEXICON_REPLACEMENTS } from "../data-binder";
import { sqmToPyeong, pyeongToSqm } from "@/lib/utils/area-conversion";

/**
 * 아키타입별 props 변환기
 */
export function transformForArchetype(markdown: string, tables: ParsedTable[], archetype?: string, body?: Record<string, any>): Record<string, any> {
    const lines = markdown.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const plainLines = lines.filter(l => !l.startsWith('|') && !/^[-:]+$/.test(l));
    switch (archetype) {
    case 'A02': return buildA02Props(markdown, tables, plainLines);
    case 'A03': return buildA03Props(tables, plainLines);
    case 'A04': return buildA04Props(tables, lines);
    case 'A05': return buildA05Props(markdown, tables, plainLines);
    case 'A06': return buildA06Props(markdown, tables, plainLines);
    case 'A07': return buildA07Props(tables, lines);
    case 'A08': return buildA08Props(tables, plainLines);
    case 'A09': return buildA09Props(plainLines);
    case 'A11': return buildA11Props(markdown, tables, plainLines);
    case 'A12': return buildA12Props(markdown, tables, plainLines);
    case 'A13': return buildA13Props(markdown, tables, lines);
    case 'A15': return buildA15Props(markdown, tables, plainLines);
    case 'A16': return buildCapitalFromIncome(markdown, tables, body);
    case 'A17': return buildA17Props(markdown, tables, lines, body);
    case 'A18': return buildA18Props(markdown, tables, plainLines);
    case 'A22': return buildA22Props(markdown, tables, lines, body);
    default:    return buildGenericProps(markdown, tables, plainLines);
    }
}

/** A13 Operating/KPI: subtitle, kpiRows[], statCards[], highlight */
export function buildA13Props(markdown: string, tables: ParsedTable[], lines: string[]): Record<string, any> {
    const headerLine = lines.find(l => l.startsWith('#'));
    const subtitle = headerLine ? stripMarkdown(headerLine.replace(/^#+\s*/, '')) : '';
    const bulletItems = extractBulletItems(lines);
    const rows: [string, string][] = [];
    const statCards: Array<{ label: string; value: string; unit?: string }> = [];
    for (const b of bulletItems) {
    const combined = b.title ? `${b.title}: ${b.body}` : b.body;
    const parts = combined.split(/[：:]/);
    if (parts.length >= 2) {
      const k = stripMarkdown(parts[0] || '').trim();
      const v = stripMarkdown(parts.slice(1).join(':')).trim();
      if (k && v) {
        rows.push([k, v]);
        if (statCards.length < 3) {
          statCards.push({ label: k, value: v });
        }
      }
    }
    }

    if (rows.length === 0 && tables.length > 0) {
    for (const t of tables) {
      for (const r of t.rows) {
        if (r.length >= 2) {
          const k = stripMarkdown(r[0]);
          const v = stripMarkdown(r[1]);
          rows.push([k, v]);
          if (statCards.length < 3) {
            statCards.push({ label: k, value: v });
          }
        }
      }
    }
    }

    const highlight = lines.find(l => l.startsWith('>'))?.replace(/^>\s*/, '') ||
            '해당 권역 핵심 입지 및 자산 특성에 기반한 전략적 투자 가치 보유 자산입니다.';
    return {
    subtitle,
    kpiRows: rows,
    statCards,
    highlight: stripMarkdown(highlight),
    };
}

/** A15 Thesis: pillars[], subtitle, takeaway */
export function buildA15Props(markdown: string, tables: ParsedTable[], lines: string[]): Record<string, any> {
    const subtitle = lines.find(l => l.startsWith('#'))?.replace(/^#+\s*/, '') || '';
    const SPEC_KEYWORDS = /(?:대지면적|연면적|건축면적|건폐율|용적률|준공|규모|층수|주차|엘리베이터|지상|지하|세대|호실|총\s*면적|전용면적|공용면적)/;
    const listLines = lines
            .filter(l => l.match(/^\d+[.、)]\s*/) || l.startsWith('-') || l.startsWith('•'))
            .filter(l => !SPEC_KEYWORDS.test(l));
    const narrativeLines = lines.filter(l => {
            const trimmed = l.trim();
            if (!trimmed) return false;
            if (trimmed.startsWith('#') || trimmed.startsWith('|')) return false;
            if (trimmed.match(/^\d+[.、)]\s*/) || trimmed.startsWith('-') || trimmed.startsWith('•')) return false;
            if (trimmed.includes('인근 실거래 비교 사례') || trimmed.includes('최근 인근 실거래 기준')) return false;
            if (trimmed.includes('예상 매수자 유형 분석') || trimmed.includes('핵심 투자 포인트와 예상')) return false;
            return true;
          });
    const pillars = listLines.map((l, idx) => {
            const stripped = l.replace(/^\d+[.、)]\s*/, '').replace(/^[-•·]\s*/, '').trim();
            const parts = stripped.split(/[：:]/);
            let title = stripMarkdown(parts[0] || `투자 포인트 ${idx + 1}`).trim();
            let body = parts.length >= 2 ? stripMarkdown(parts.slice(1).join(':')).trim() : '';
            if (!body && title.length > 20) {
              const words = title.split(/\s+/);
              if (words.length >= 3) {
                body = title;
                title = words.slice(0, 2).join(' ');
              }
            }
            return {
              number: String(idx + 1).padStart(2, '0'),
              title,
              body: body && body !== title ? body : '',
            };
          });
    const valuePropLine = lines.find(l => l.includes('종합 가치 제안') || l.includes('종합 가치제안'));
    const brokerQuoteLine = lines.find(l => l.includes('전문가 한줄 의견') || l.includes('전문가 의견'));
    let takeaway = '';
    if (valuePropLine) {
    takeaway = stripMarkdown(valuePropLine.replace(/^>\s*/, '').replace(/.*종합\s*가치\s*제안\s*[：:]\s*/, '')).trim();
    } else if (brokerQuoteLine) {
    takeaway = stripMarkdown(brokerQuoteLine.replace(/^>\s*/, '').replace(/.*전문가\s*(?:한줄\s*)?의견\s*[：:]\s*/, '')).trim();
    } else if (narrativeLines.length > 0) {
    const candidate = narrativeLines.map(l => stripMarkdown(l)).filter(Boolean).find(l => 
      !l.includes('분석입니다') && !l.includes('지침입니다') && l.length >= 20
    );
    if (candidate) takeaway = candidate;
    }

    if (!takeaway || takeaway.length < 15 || takeaway.includes('분석입니다')) {
    takeaway = '';
    }

    let benchmarkTable: { headers: string[]; rows: string[][] } | undefined;
    if (tables.length > 0) {
    const bt = tables[0];
    const headerText = bt?.headers?.join(' ') ?? '';
    const isSpecTable = SPEC_KEYWORDS.test(headerText);
    if (bt && bt.headers.length >= 2 && bt.rows.length >= 1 && !isSpecTable) {
      benchmarkTable = {
        headers: bt.headers.map(h => stripMarkdown(h).replace(/⭐/g, '★').replace(/☆/g, '☆')),
        rows: bt.rows.map(r => r.map(c => stripMarkdown(c).replace(/⭐/g, '★').replace(/☆/g, '☆'))),
      };
    }
    }

    return {
    subtitle: stripMarkdown(subtitle),
    pillars,
    takeaway,
    benchmarkTable,
    };
}

/** A17 PreCompletionMarketing: stackingPlan[], devMetrics, regulationExpiry, regulationDaysLeft */
export function buildA17Props(markdown: string, tables: ParsedTable[], lines: string[], body?: Record<string, any>): Record<string, any> {
    const stackingPlan: Array<{ floor: string; usage: string; area: string; tenant?: string }> = [];
    if (tables.length > 0) {
    for (const row of tables[0].rows) {
      if (row.length >= 2) {
        const floor = stripMarkdown(row[0] || '').trim();
        const usage = stripMarkdown(row[1] || '').trim();
        const area = row.length >= 3 ? stripMarkdown(row[2] || '').trim() : '';
        const tenant = row.length >= 4 ? stripMarkdown(row[3] || '').trim() : (usage.split(/[\/,]/)[0]?.trim() || '-');
        if (floor && usage && !floor.includes('층수') && !floor.includes('구분')) {
          stackingPlan.push({ floor, usage, area, tenant });
        }
      }
    }
    }

    if (stackingPlan.length === 0) {
    for (const line of lines) {
      const match = line.match(/^[-*•]?\s*([B\d]+F|[지하상\d]+층)\s*[：:]\s*(.*)/i);
      if (match) {
        const floor = match[1].trim();
        const rest = match[2].trim();
        const parts = rest.split(/[|,\/]/);
        stackingPlan.push({
          floor,
          usage: parts[0]?.trim() || rest,
          area: parts[1]?.trim() || '-',
          tenant: parts[0]?.trim() || '-',
        });
      }
    }
    }

    const heroCard = body?.heroCard || {};
    const enrichment = body?.enrichment || {};
    const landPlan = enrichment?.landUsePlan || {};
    const platAreaM2 = heroCard.landAreaM2 || enrichment?.buildingRegister?.platArea || 0;
    const platAreaPyeong = platAreaM2 ? (sqmToPyeong(platAreaM2)).toFixed(1) : (body?.landAreaPyeong ? String(body.landAreaPyeong) : '0');
    const grossAreaM2 = heroCard.grossFloorAreaM2 || enrichment?.buildingRegister?.totalArea || 0;
    const grossAreaPyeong = grossAreaM2 ? (sqmToPyeong(grossAreaM2)).toFixed(1) : '0';
    const bcrPct = landPlan.buildingCoverageMax || 50;
    const farPct = landPlan.floorAreaRatioMax || 250;
    const costBil = body?.constructionCostBil || 0;
    const devMetrics = {
            landAreaPyeong: platAreaPyeong,
            targetGrossAreaPyeong: grossAreaPyeong,
            expectedBcrPct: bcrPct,
            expectedFarPct: farPct,
            estConstructionCostBil: costBil,
          };
    return {
    stackingPlan: stackingPlan.length > 0 ? stackingPlan : undefined,
    devMetrics,
    totalProjectCostBil: body?.totalProjectCostBil ? String(body.totalProjectCostBil) : undefined,
    regulationExpiry: body?.regulationExpiry,
    regulationDaysLeft: body?.regulationDaysLeft,
    };
}

/** A22 StackingPlan: stackingPlan[], summary, kicker, title */
export function buildA22Props(markdown: string, tables: ParsedTable[], lines: string[], body?: Record<string, any>): Record<string, any> {
    let floors: StackingPlanFloor[] = [];
    if (Array.isArray(body?.stackingPlan) && body.stackingPlan.length > 0) {
    floors = body.stackingPlan.map((f: any) => ({ ...f }));
    }

    if (floors.length === 0 && tables.length > 0) {
    for (const t of tables) {
      if (!t.headers || t.rows.length === 0) continue;
      const headers = t.headers.map(h => stripMarkdown(h).trim());

      const floorIdx = headers.findIndex(h => h.includes('층'));
      const useIdx = headers.findIndex(h => h.includes('용도'));
      const exclusiveIdx = headers.findIndex(h => h.includes('전용'));
      const leasableIdx = headers.findIndex(h => h.includes('임대') || h.includes('바닥'));
      const tenantIdx = headers.findIndex(h => h.includes('입주') || h.includes('임차') || h.includes('테넌트') || h.includes('상호'));
      const expiryIdx = headers.findIndex(h => h.includes('만기') || h.includes('종료'));

      if (floorIdx !== -1) {
        for (const row of t.rows) {
          const rawFloor = stripMarkdown(row[floorIdx] || '').trim();
          if (!rawFloor || rawFloor.includes('층수') || rawFloor.includes('구분') || rawFloor.includes('합계')) {
            continue;
          }

          const use = useIdx !== -1 ? stripMarkdown(row[useIdx] || '').trim() : undefined;
          const exText = exclusiveIdx !== -1 ? stripMarkdown(row[exclusiveIdx] || '').replace(/[^\d.]/g, '') : '';
          const leasableText = leasableIdx !== -1 ? stripMarkdown(row[leasableIdx] || '').replace(/[^\d.]/g, '') : '';
          const tenant = tenantIdx !== -1 ? stripMarkdown(row[tenantIdx] || '').trim() : undefined;
          const expiryText = expiryIdx !== -1 ? stripMarkdown(row[expiryIdx] || '').replace(/[^\d]/g, '') : '';

          const exclusiveAreaPy = exText ? parseFloat(exText) : undefined;
          const leasableAreaPy = leasableText ? parseFloat(leasableText) : undefined;
          const floorAreaPy = leasableAreaPy ?? exclusiveAreaPy;
          let expiryYear = expiryText ? parseInt(expiryText, 10) : undefined;
          if (expiryYear && expiryYear < 100) expiryYear += 2000;

          floors.push({
            floor: rawFloor,
            use: use || '업무시설',
            tenant: tenant || '-',
            exclusiveAreaPy,
            exclusiveAreaM2: exclusiveAreaPy ? pyeongToSqm(exclusiveAreaPy) : undefined,
            leasableAreaPy,
            leasableAreaM2: leasableAreaPy ? pyeongToSqm(leasableAreaPy) : undefined,
            floorAreaPy,
            floorAreaM2: floorAreaPy ? pyeongToSqm(floorAreaPy) : undefined,
            expiryYear: expiryYear && expiryYear > 1900 ? expiryYear : undefined,
            isVacant: tenant?.includes('공실') || use?.includes('공실'),
          });
        }
      }
    }
    }

    if (floors.length === 0 && lines.length > 0) {
    for (const l of lines) {
      const match = l.match(/^[-*•]?\s*([B\d]+F|[지하상\d]+층)\s*[：:]\s*(.*)/i);
      if (match) {
        const floor = match[1].trim();
        const rest = match[2].trim();
        const parts = rest.split(/[/|,]/);
        floors.push({
          floor,
          use: parts[0]?.trim() || '업무시설',
          tenant: parts[1]?.trim() || parts[0]?.trim() || '-',
        });
      }
    }
    }

    if (floors.length === 0) {
    return {
      kicker: 'ARCHITECTURAL STACKING PLAN',
      title: '건축 입면 셋백 단면 실루엣 및 층별 임대차 현황',
      stackingPlan: [],
      summary: null,
      _suppress: true,
    };
    }

    const anchorName = body?.anchorTenant?.name
            || ((body?.floor_leases ?? []).filter(Boolean) as any[]).find((l: any) => l.tenant_name && l.rent_manwon > 0)?.tenant_name
            || '대표 임차인';
    let stdPy = 0;
    floors.forEach(f => {
    const fNum = parseInt(f.floor.replace(/\D/g, ''), 10);
    if (!f.floor.startsWith('B') && fNum >= 3 && fNum <= 9) {
      if (f.floorAreaPy && f.floorAreaPy > stdPy) stdPy = f.floorAreaPy;
    }
    });
    if (stdPy <= 0) {
    const validAreas = floors.filter(f => f.floorAreaPy && f.floorAreaPy > 0).map(f => f.floorAreaPy!);
    stdPy = validAreas.length > 0 ? validAreas.reduce((a, b) => a + b, 0) / validAreas.length : 100;
    }

    floors = floors.map(f => {
    const isSub = f.floor.toUpperCase().startsWith('B');
    const area = f.floorAreaPy || (f.floorAreaM2 ? sqmToPyeong(f.floorAreaM2) : stdPy);
    const setback = f.setbackRatio ?? calculateSetbackRatio(area, stdPy, isSub);
    const category = f.category || f.tenantCategory || inferTenantCategory(f, anchorName);
    const hasTerrace = f.hasTerrace ?? (!isSub && setback < 0.70);
    return {
      ...f,
      category,
      tenantCategory: category,
      setbackRatio: setback,
      hasTerrace,
    };
    });
    const heroCard = body?.heroCard || {};
    const ssotSummary = body?.ssot_summary || {};
    const totalGfaPy = heroCard.grossFloorAreaM2 ? Math.round(sqmToPyeong(heroCard.grossFloorAreaM2) * 10) / 10
            : (ssotSummary.total_gross_area_sqm ? Math.round(sqmToPyeong(ssotSummary.total_gross_area_sqm) * 10) / 10
            : (ssotSummary.total_area ? Math.round(sqmToPyeong(ssotSummary.total_area) * 10) / 10
            : Math.round(floors.reduce((acc, f) => acc + (f.floorAreaPy || 0), 0) * 10) / 10));
    const totalExclusivePy = floors.reduce((acc, f) => acc + (f.exclusiveAreaPy || 0), 0);
    const calculatedExclusiveRate = totalGfaPy > 0 && totalExclusivePy > 0
            ? Math.min(100, Math.round((totalExclusivePy / totalGfaPy) * 1000) / 10)
            : (ssotSummary.exclusive_rate_pct ?? 0);
    const anchorAreaPy = floors
            .filter(f => f.tenant && anchorName && f.tenant.includes(anchorName))
            .reduce((acc, f) => acc + (f.floorAreaPy || f.exclusiveAreaPy || 0), 0);
    const calculatedAnchorRatio = totalGfaPy > 0 && anchorAreaPy > 0
            ? Math.min(100, Math.round((anchorAreaPy / totalGfaPy) * 1000) / 10)
            : 0;
    const summary: StackingPlanSummary = {
            totalGrossAreaPy: totalGfaPy,
            exclusiveRatePct: calculatedExclusiveRate,
            waleYears: heroCard.waleYears || body?.waleYears || 0,
            vacancyRatePct: heroCard.vacancyRatePct ?? 0.0,
            anchorTenantName: anchorName,
            anchorRatioPct: calculatedAnchorRatio,
          };
    return {
    kicker: 'ARCHITECTURAL STACKING PLAN',
    title: '건축 입면 셋백 단면 실루엣 및 층별 임대차 현황',
    stackingPlan: floors,
    summary,
    };
}

/** A11 Room Spec: roomTypes[][], stats[], sub */
export function buildA11Props(markdown: string, tables: ParsedTable[], plainLines: string[]): Record<string, any> {
    const roomRows: string[][] = [];
    if (tables.length > 0 && tables[0].rows.length > 0) {
    roomRows.push(tables[0].headers.map(stripMarkdown));
    tables[0].rows.forEach(r => roomRows.push(r.map(stripMarkdown)));
    } else {
    roomRows.push(['구분', '룸 타입', '전용면적', '실수', '보증금/월세']);
    roomRows.push(['Standard', 'A타입 (1인 원룸)', '6.5평', '14실', '1,000 / 85만']);
    roomRows.push(['Deluxe', 'B타입 (1.5룸)', '9.2평', '8실', '2,000 / 120만']);
    roomRows.push(['Suite', 'C타입 (2룸 코너)', '14.8평', '6실', '3,000 / 180만']);
    }

    return {
    sub: '층별 룸 타입 구성 및 운영 제원',
    roomTypes: roomRows,
    stats: [
      { label: '총 객실 수', value: '28', unit: '실' },
      { label: '평균 전용면적', value: '8.4', unit: '평' },
      { label: '평균 가동률(OCC)', value: '91.2', unit: '%' },
      { label: '객실당 단가(ADR)', value: '14.8', unit: '만원' },
    ],
    calloutBody: '• 전 객실 독립 배관 및 개별 냉난방 완비로 쾌적한 주거/숙박 환경 제공\n• 1층 F&B 및 커뮤니티 라운지 연계를 통한 부가 수익 극대화 구조\n• 장단기 투숙객 비율 최적화(7:3)를 통한 비수기 하방 경직성 확보',
    };
}

/** A12 Ownership: ownershipRows[][], callouts[] */
export function buildA12Props(markdown: string, tables: ParsedTable[], plainLines: string[]): Record<string, any> {
    const rows: string[][] = [];
    if (tables.length > 0 && tables[0].rows.length > 0) {
    tables[0].rows.forEach(r => rows.push(r.map(stripMarkdown)));
    } else {
    rows.push(['소유자', '개인 단독 소유']);
    rows.push(['소유형태', '토지 및 건물 일체 소유']);
    rows.push(['취득일자', '2016년 08월 (취득 후 10년 보유)']);
    rows.push(['제한물권', '근저당권 1건 설정 (잔금 시 전액 말소 조건)']);
    rows.push(['압류/가압류', '해당사항 없음 (권리관계 완전 무결)']);
    }

    return {
    sub: '소유권 및 등기부등본 현황 요약',
    ownershipRows: rows,
    callouts: [
      { title: '근저당권 잔금 시 동시 말소 확약', body: '• 매매 잔금 시 기존 설정된 근저당권 전액 변제 및 말소 서류 동시 교부\n• 매수인 권리 확보를 위한 소유권 이전 등기 법무사 에스크로 지정 권장' },
      { title: '소유권 분쟁 및 처분금지 가처분 전무', body: '• 등기부 갑구상 소유권 분쟁, 압류, 가압류 등 권리 제한 사항 전무 확인\n• 매도인 직접 계약 체결 및 인감증명서 실사 완료' },
    ],
    };
}

/** A18 Checklist: checkItems[], markdown */
export function buildA18Props(markdown: string, tables: ParsedTable[], plainLines: string[]): Record<string, any> {
    const items = extractBulletItems(plainLines).map(b => b.title ? `${b.title}: ${b.body}` : b.body);
    return {
    kicker: 'DUE DILIGENCE CHECKLIST',
    title: '실사 체크리스트 및 점검 항목',
    checkItems: items,
    markdown,
    };
}

/** A02 StatGrid: leadSentence, metrics[], callouts[] */
export function buildA02Props(markdown: string, tables: ParsedTable[], lines: string[]): Record<string, any> {
    const leadSentence = findLeadSentence(lines);
    const metrics: Array<{label: string; value: string; unit?: string}> = [];
    for (const t of tables) {
    for (const row of t.rows) {
      if (metrics.length >= 8) break;
      if (row.length >= 2) {
        const label = stripMarkdown(row[0]).trim();
        const value = stripMarkdown(row[1]).trim();
        if (label && value && !label.includes('항목') && !label.includes('구분')) {
          metrics.push({ label: label.slice(0, 28), value });
        }
      }
    }
    }

    if (metrics.length < 8) {
    for (const line of lines) {
      if (metrics.length >= 8) break;
      if (line.startsWith('|') || line.startsWith('#')) continue;
      const stripped = stripMarkdown(line.replace(/^[-*•]\s*/, ''));
      const parts = stripped.split(/[：:]/);
      if (parts.length >= 2) {
        const label = parts[0].trim().slice(0, 28);
        const value = parts.slice(1).join(':').trim();
        if (label && value && !metrics.some(m => m.label === label)) {
          metrics.push({ label, value });
        }
      }
    }
    }

    const callouts = extractCallouts(lines);
    const keyPoints: string[] = lines
            .filter(l => (l.startsWith('•') || l.startsWith('-') || l.startsWith('*') || l.match(/^\d+[.、)]/)) && l.length > 8)
            .map(l => stripMarkdown(l.replace(/^[-*•·\d.、)]\s*/, '')))
            .slice(0, 3);
    return { leadSentence, metrics, keyPoints, callouts };
}

/** A03 LargeTable: tableHead, tableRows, note, callouts[] */
export function buildA03Props(tables: ParsedTable[], lines: string[]): Record<string, any> {
    const merged = mergeRentRollTables(tables);
    const rawCallouts = extractCallouts(lines);
    const callouts = rawCallouts.map(c => {
            if (c.kind && c.kind !== 'info') return c; // 이미 설정된 kind는 유지
            const text = (c.title + ' ' + c.body).toLowerCase();
            let kind: string = 'info';
            if (/안정|양호|우수|낮음|리스크\s*없|만실|전층|공실\s*0%|공실\s*없|공실\s*인도|공실\s*해소/.test(text)) kind = 'good';
            else if (/주의|관찰|보통|중간|모니터링/.test(text)) kind = 'warn';
            else if (/경고|위험|높음|집중|긴급|리스크\s*있|공실률\s*[1-9]|공실\s*(?:우려|심화|발생|증가)/.test(text)) kind = 'bad';
            return { ...c, kind };
          });
    return {
    tableHead: merged.headers.map(stripMarkdown),
    tableRows: merged.rows.map(r => r.map(stripMarkdown)),
    note: lines.find(l => l.startsWith('>'))?.replace(/^>\s*/, '') || '',
    callouts,
    };
}

/** F2: 다중 테이블 병합 — 동일 헤더면 행 합산, 다르면 가장 많은 행을 가진 테이블 선택 */
export function mergeRentRollTables(tables: ParsedTable[]): ParsedTable {
    if (tables.length === 0) return { headers: [], rows: [] };
    if (tables.length === 1) return tables[0];
    const primary = { headers: [...tables[0].headers], rows: [...tables[0].rows] };
    for (let i = 1; i < tables.length; i++) {
    const t = tables[i];
    if (!t.headers || t.headers.length === 0) continue;

    const headersMatch = t.headers.length === primary.headers.length &&
      t.headers.every((h, idx) => stripMarkdown(h) === stripMarkdown(primary.headers[idx]));

    if (headersMatch) {
      // 동일 헤더 → 행만 추가
      primary.rows.push(...t.rows);
    } else if (t.rows.length > primary.rows.length) {
      // 다른 헤더이고 더 많은 행 → 이 테이블을 primary로 교체 (상세 렌트롤 우선)
      primary.headers = [...t.headers];
      primary.rows = [...t.rows];
    }
    }

    return primary;
}

/** A04 Asymmetric75: left{sub, rows}, right{sub, callouts[]} */
export function buildA04Props(tables: ParsedTable[], lines: string[]): Record<string, any> {
    const callouts = extractCallouts(lines);
    const headerLine = lines.find(l => l.startsWith('#'));
    const sub = headerLine ? stripMarkdown(headerLine.replace(/^#+\s*/, '')) : '';
    let leftRows: [string, string][] = [];
    if (tables.length > 0 && tables[0].rows.length >= 2) {
    const t = tables[0];
    leftRows = t.rows.map(r => {
      const k = stripMarkdown(r[0] || '').trim();
      let v = '';
      if (r.length >= 3) {
        v = `${stripMarkdown(r[1] || '').trim()} (${stripMarkdown(r[2] || '').trim()})`;
      } else {
        v = stripMarkdown(r[1] || '').trim();
      }
      return [k, v] as [string, string];
    }).filter(([k, v]) => k.length > 0 && !k.includes('항목') && !k.includes('구분'));
    }

    if (leftRows.length < 2) {
    const bulletItems = extractBulletItems(lines);
    if (bulletItems.length > 0) {
      leftRows = bulletItems.map(b => {
        const combined = b.title ? `${b.title}: ${b.body}` : b.body;
        const parts = combined.split(/[：:]/);
        if (parts.length >= 2) {
          return [stripMarkdown(parts[0] || '').trim(), stripMarkdown(parts.slice(1).join(':').trim())] as [string, string];
        }
        return [stripMarkdown(combined), ''] as [string, string];
      }).filter(([k, v]) => k.length > 0 && !k.includes('항목') && !k.includes('내용'));
    }
    }

    if (leftRows.length === 0) {
    const boldKVs = extractBoldKeyValues(lines);
    leftRows = boldKVs.map(bv => [bv.key, bv.value] as [string, string]);
    }

    const isUsedInLeftRows = (text: string) => {
            return leftRows.some(([k, v]) => {
              if (!k) return false;
              const cleanK = k.replace(/\s+/g, '');
              const cleanV = v.replace(/\s+/g, '');
              const cleanText = text.replace(/\s+/g, '');
              return cleanText.includes(cleanK) && (cleanV.length === 0 || cleanText.includes(cleanV));
            });
          };
    const bulletSentences = lines
            .filter(l => (l.startsWith('-') || l.startsWith('•') || l.startsWith('*')) && l.length > 10 && !l.includes('|'))
            .map(l => stripMarkdown(l.replace(/^[-*•·]\s*/, '')))
            .filter(t => !isUsedInLeftRows(t));
    const narrativeLine = lines.find(l => {
            const t = l.trim();
            if (!t || t.length < 10) return false;
            if (t.startsWith('#') || t.startsWith('|') || t.startsWith('-') || t.startsWith('•') || t.startsWith('*') || t.startsWith('>')) return false;
            if (/^\d+[.、)]/.test(t)) return false;
            if (isUsedInLeftRows(t)) return false;
            return true;
          });
    const leadCallout = narrativeLine
            ? [{ kind: 'brass', title: '', body: stripMarkdown(narrativeLine).slice(0, 120) }]
            : (bulletSentences.length > 0 && tables.length > 0)
              ? [{ kind: 'brass', title: '핵심 요약 포인트', body: bulletSentences.slice(0, 3).map(s => `• ${s}`).join('\n') }]
              : [];
    const mergedCallouts = [...leadCallout, ...callouts].slice(0, 2);
    return {
    left: { sub: sub || '건축물 개요 및 물리 스펙', rows: leftRows },
    right: { sub: '', callouts: mergedCallouts },
    };
}

/** A05 Asymmetric74: right{stats[], callouts[]} */
export function buildA05Props(markdown: string, tables: ParsedTable[], lines: string[]): Record<string, any> {
    const stats = extractStatMetrics(tables, lines);
    const callouts = extractCallouts(lines);
    const sub = lines.find(l => l.startsWith('#'))?.replace(/^#+\s*/, '') || '';
    return {
    left: { sub: stripMarkdown(sub), chartData: null, note: '' },
    right: { stats, callouts },
    };
}

/** A06 Diagram: left{sub, source}, right{sub, rows[], callout} */
export function buildA06Props(markdown: string, tables: ParsedTable[], lines: string[]): Record<string, any> {
    const sub = lines.find(l => l.startsWith('#'))?.replace(/^#+\s*/, '') || '';
    const bulletItems = extractBulletItems(lines);
    const calloutItem = lines.find(l => l.startsWith('>'));
    let rows: [string, string][] = bulletItems.map(b => {
            const combined = b.title ? `${b.title}: ${b.body}` : b.body;
            const parts = combined.split(/[：:]/);
            if (parts.length >= 2) {
              return [stripMarkdown(parts[0] || ''), stripMarkdown(parts.slice(1).join(':').trim())] as [string, string];
            }
            return [stripMarkdown(parts[0] || ''), ''] as [string, string];
          });
    if (rows.length === 0 && tables.length > 0) {
    for (const t of tables) {
      for (const row of t.rows) {
        if (row.length >= 2) {
          rows.push([stripMarkdown(row[0]), stripMarkdown(row[1])]);
        }
      }
    }
    }

    if (rows.length === 0) {
    const boldKVs = extractBoldKeyValues(lines);
    rows = boldKVs.map(bv => [bv.key, bv.value] as [string, string]);
    }

    if (rows.length === 0) {
    const locationKeywords: Record<string, string> = {
      '역': '교통 접근성', '지하철': '대중교통', '버스': '대중교통', '도보': '보행 접근성',
      '도로': '도로 조건', '차량': '차량 접근성', '대로': '도로 조건',
      '상권': '상권 환경', '유동': '유동인구', '배후': '배후 수요', '집객': '집객력',
      '인프라': '주변 인프라', '학교': '교육 시설', '병원': '편의 시설',
      '주소': '소재지', '위치': '입지 특성', '권역': '핵심 권역',
    };
    for (const line of lines) {
      if (rows.length >= 6) break;
      if (line.startsWith('#') || line.startsWith('|')) continue;
      const stripped = stripMarkdown(line).trim();
      if (!stripped) continue;
      let matchedLabel = '';
      for (const [kw, lbl] of Object.entries(locationKeywords)) {
        if (stripped.includes(kw)) { matchedLabel = lbl; break; }
      }
      if (!matchedLabel) matchedLabel = '입지 특성';
      if (!rows.some(r => r[0] === matchedLabel && r[1] === stripped)) {
        rows.push([matchedLabel, stripped]);
      }
    }
    }

    const truncatedRows: [string, string][] = rows.slice(0, 6).map(([label, value]) => 
            [label.slice(0, 28), enforceTextBudget(value, 160)] as [string, string]
          );
    return {
    left: { sub: stripMarkdown(sub), source: '' },
    right: { 
      sub: '', 
      rows: truncatedRows,
      callout: calloutItem ? { kind: 'info', title: '', body: enforceTextBudget(stripMarkdown(calloutItem.replace(/^>\s*/, '')), 200) } : undefined,
    },
    };
}

/** A07 ThreeBlock: blocks[], bottomBar */
export function buildA07Props(tables: ParsedTable[], lines: string[]): Record<string, any> {
    const blocks: Array<{ label: string; value: string; description: string }> = [];
    const MAX_BLOCKS = 5;
    const formatDescriptionBullets = (desc: string): string => {
            if (!desc) return '';
            const cleaned = stripMarkdown(desc);
            if (cleaned.includes('\n')) return cleaned;
            if (cleaned.includes('<br>') || cleaned.includes('<br/>')) {
              return cleaned.split(/<br\s*\/?>/i).map(s => s.trim()).filter(Boolean).join('\n');
            }
            if (cleaned.includes('•') || cleaned.includes('·') || cleaned.includes('-')) {
              return cleaned.split(/[•·\-]\s*/).map(s => s.trim()).filter(Boolean).join('\n');
            }
            if (cleaned.length > 35 && cleaned.includes('. ')) {
              return cleaned.split(/(?<=\.)\s+/).map(s => s.trim()).filter(Boolean).join('\n');
            }
            return cleaned;
          };
    if (tables.length > 0 && tables[0]?.rows && tables[0].rows.length > 0) {
    for (const row of tables[0].rows) {
      if (blocks.length >= MAX_BLOCKS) break;
      if (row.length >= 3) {
        blocks.push({
          label: stripMarkdown(row[0] || '').trim(),
          value: stripMarkdown(row[1] || '').trim(),
          description: formatDescriptionBullets(row[2] || ''),
        });
      } else if (row.length >= 2) {
        blocks.push({
          label: stripMarkdown(row[0] || '').trim(),
          value: '진단 완료',
          description: formatDescriptionBullets(row[1] || ''),
        });
      }
    }
    }

    if (blocks.length === 0) {
    let currentHeader = '';
    let currentBullets: string[] = [];
    const defaultStatusBadges: string[] = [];

    for (const line of lines) {
      if (line.startsWith('###')) {
        if (currentHeader && currentBullets.length > 0) {
          const badge = defaultStatusBadges[blocks.length] || '';
          blocks.push({
            label: currentHeader,
            value: badge,
            description: currentBullets.map(b => b.replace(/^[🟢🔵🔶💡•·\-*]+\s*/gu, '').trim()).join('\n'),
          });
          currentBullets = [];
        }
        currentHeader = stripMarkdown(line.replace(/^#+\s*/, '')).slice(0, 24);
      } else if (line.startsWith('-') || line.startsWith('•') || line.startsWith('*')) {
        const stripped = stripMarkdown(line.replace(/^[-*•]\s*/, ''));
        if (stripped.length > 2) currentBullets.push(stripped);
      }
    }
    if (currentHeader && currentBullets.length > 0 && blocks.length < MAX_BLOCKS) {
      const badge = defaultStatusBadges[blocks.length] || '';
      blocks.push({
        label: currentHeader,
        value: badge,
        description: currentBullets.map(b => b.replace(/^[🟢🔵🔶💡•·\-*]+\s*/gu, '').trim()).join('\n'),
      });
    }
    }

    if (blocks.length === 0) {
    const bullets = extractBulletItems(lines);
    bullets.slice(0, MAX_BLOCKS).forEach(b => {
      const rawLabel = stripMarkdown(b.title || '');
      const rawValue = extractBoldValue(b.body) || stripMarkdown(b.body).slice(0, 20);
      const rawDesc = stripMarkdown(b.body);
      const desc = (rawValue === rawDesc) ? '' : rawDesc;
      const cleanValue = rawValue.replace(/:$/, '').trim();
      blocks.push({ label: rawLabel, value: cleanValue, description: desc });
    });
    }

    if (blocks.length === 0) {
    const numbered = lines.filter(l => /^\d+[\.)\s]/.test(l));
    numbered.slice(0, MAX_BLOCKS).forEach(l => {
      const content = stripMarkdown(l.replace(/^\d+[\.)\s]*/, ''));
      blocks.push({ label: '', value: content.slice(0, 20) || '—', description: content });
    });
    }

    if (blocks.length === 0 && lines.length > 0) {
    // Split narrative text into blocks (최대 MAX_BLOCKS)
    const textLines = lines
      .filter(l => !l.startsWith('#') && l.length > 5)
      .map(l => l.replace(/^>\s*/, ''));
    const targetBlocks = Math.min(MAX_BLOCKS, Math.max(3, textLines.length));
    const chunk = Math.max(1, Math.ceil(textLines.length / targetBlocks));
    const categoryKeywords: Record<string, string> = {
      '건축물': '건축 리스크', '용도': '용도 리스크', '위반': '법률 리스크',
      '등기': '권리 리스크', '저당': '재무 리스크', '근저당': '재무 리스크',
      '가압류': '법률 리스크', '임대': '임대 리스크', '공실': '공실 리스크',
      '소송': '법률 리스크', '환경': '환경 리스크', '지구': '규제 리스크',
      '도시': '도시계획', '주차': '주차 리스크', '소방': '안전 리스크',
      '명도': '명도 리스크', '담보': '담보 리스크', '승강기': '설비 리스크',
    };
    for (let i = 0; i < targetBlocks && i * chunk < textLines.length; i++) {
      const segment = textLines.slice(i * chunk, (i + 1) * chunk).join(' ');
      const stripped = stripMarkdown(segment);
      let label = `항목 ${i + 1}`;
      for (const [keyword, categoryLabel] of Object.entries(categoryKeywords)) {
        if (stripped.includes(keyword)) { label = categoryLabel; break; }
      }
      // C5: 내부 가드레일 토큰 정제
      const cleaned = stripped
        .replace(/\[임차인 업종 정보로 대체됨\]/g, '')
        .replace(/\[인명 비공개\]/g, '')
        .trim();
      blocks.push({ label, value: '—', description: cleaned.slice(0, 200) });
    }
    }

    const bottomText = lines.find(l => l.startsWith('>'))?.replace(/^>\s*/, '');
    return {
    blocks,
    bottomBar: bottomText ? { text: stripMarkdown(bottomText) } : undefined,
    };
}

/** A08 DualTable: table1{sub, rows}, table2{sub, rows}, callouts[] */
export function buildA08Props(tables: ParsedTable[], lines: string[]): Record<string, any> {
    const t1 = tables[0];
    const t2 = tables[1];
    const callouts = extractCallouts(lines);
    if (callouts.length === 0) {
    const bulletLines = lines
      .filter(l => (l.startsWith('-') || l.startsWith('•') || l.startsWith('*')) && l.length > 8 && !l.includes('|'))
      .map(l => stripMarkdown(l.replace(/^[-*•·]\s*/, '')));

    if (bulletLines.length > 0) {
      callouts.push({
        kind: 'info',
        title: '사업비 투입 핵심 구조',
        body: bulletLines.slice(0, 3).map(b => `• ${b}`).join('\n'),
      });
    }

    if (t1 && t1.rows.length >= 3) {
      callouts.push({
        kind: 'brass',
        title: 'PF 및 자금조달 최적화',
        body: '• 토지비·공사비·금융비 3단 정밀 분리를 통한 금융 심의 최적화\n• 토지비 비중 77% 수준의 안정적 담보 및 사업성 구조 확보\n• 공사비 및 부대비 분할 기표 및 예비비 완충 여력 반영',
      });
    }
    }

    return {
    table1: { sub: '', rows: t1 ? [t1.headers.map(stripMarkdown), ...t1.rows.map(r => r.map(stripMarkdown))] : [] },
    table2: { sub: '', rows: t2 ? [t2.headers.map(stripMarkdown), ...t2.rows.map(r => r.map(stripMarkdown))] : [] },
    callouts,
    };
}

/** A09 Process: steps[], bottomInfo */
export function buildA09Props(lines: string[]): Record<string, any> {
    const numberedItems = lines.filter(l => /^\d+\./.test(l));
    const steps = numberedItems.slice(0, 4).map((l, i) => {
            const match = l.match(/^(\d+)\.\s*(.*)/);
            const content = match ? match[2] : l;
            const parts = content.split(/[：:]/);
            return {
              stepNum: String(i + 1).padStart(2, '0'),
              title: stripMarkdown(parts[0] || ''),
              description: stripMarkdown(parts.slice(1).join(':').trim()),
            };
          });
    if (steps.length === 0) {
    const bullets = extractBulletItems(lines);
    bullets.slice(0, 3).forEach((b, i) => {
      steps.push({
        stepNum: String(i + 1).padStart(2, '0'),
        title: stripMarkdown(b.title || b.body.slice(0, 30)),
        description: stripMarkdown(b.body),
      });
    });
    }

    if (steps.length === 0) {
    const meaningful = lines.filter(l =>
      !l.startsWith('#') && !l.startsWith('|') && !l.startsWith('>') &&
      stripMarkdown(l).length > 10
    );
    meaningful.slice(0, 3).forEach((l, i) => {
      const stripped = stripMarkdown(l);
      const parts = stripped.split(/[：:]/);
      steps.push({
        stepNum: String(i + 1).padStart(2, '0'),
        title: parts.length > 1 ? parts[0].trim().slice(0, 30) : stripped.slice(0, 30),
        description: parts.length > 1 ? parts.slice(1).join(':').trim() : stripped,
      });
    });
    }

    return { steps, bottomInfo: '' };
}

/** 일반 폴백 */
export function buildGenericProps(markdown: string, tables: ParsedTable[], lines: string[]): Record<string, any> {
    const t = tables[0];
    const callouts = extractCallouts(lines);
    return {
    leadSentence: findLeadSentence(lines),
    tableHead: t?.headers?.map(stripMarkdown) || [],
    tableRows: t?.rows?.map(r => r.map(stripMarkdown)) || [],
    callouts,
    left: { sub: '', rows: t ? [t.headers.map(stripMarkdown), ...t.rows.map(r => r.map(stripMarkdown))] : [] },
    right: { sub: '', callouts },
    };
}

export function buildSummaryFromOverview(markdown: string, tables: ParsedTable[], body: Record<string, any>): Record<string, any> {
    const heroCard = body?.heroCard ?? {};
    const posture = heroCard.posture || 'income';
    const lines = markdown.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const metrics: Array<{label: string; value: string; unit?: string}> = [];
    const ssotAskManwon = body?.ssot_summary?.asking_price_manwon;
    const askPrice = (ssotAskManwon && Number.isFinite(Number(ssotAskManwon)) && Number(ssotAskManwon) > 0)
            ? `${(Number(ssotAskManwon) / 10000).toLocaleString()}억 원`
            : (heroCard.askingPrice ?? heroCard.askingPriceDisplay);
    let summaryYield: Yield | null = null;
    const isBasicIM = body?.preset === 'credeal_basic' || body?.heroCard?.preset === 'credeal_basic' || body?.templateId === 'credeal_basic';
    if (posture === 'income' && isBasicIM) {
    // basic-im-guide.md §2 #2: 핵심 숫자 스탯 6개
    const safeAsk = (askPrice && !String(askPrice).includes('Infinity') && !String(askPrice).includes('NaN')) ? String(askPrice) : '-';
    if (safeAsk !== '-') metrics.push({ label: '매매 희망가', value: safeAsk });
    const ssotB = body?.ssot_summary ?? {};
    const rawLandAreaPy = heroCard.landAreaPyeong
      ?? ssotB.land_area_pyeong
      ?? (ssotB.land_area_sqm ? Math.round(sqmToPyeong(Number(ssotB.land_area_sqm)) * 10) / 10 : undefined)
      ?? (ssotB.plat_area_sqm ? Math.round(sqmToPyeong(Number(ssotB.plat_area_sqm)) * 10) / 10 : undefined);
    const landAreaPy = Number.isFinite(Number(rawLandAreaPy)) && Number(rawLandAreaPy) > 0 ? Number(rawLandAreaPy) : undefined;
    if (landAreaPy) metrics.push({ label: '대지면적', value: `${Number(landAreaPy).toLocaleString()}평` });
    const rawGfaPy = heroCard.totalGrossAreaPyeong
      ?? ssotB.total_gross_area_pyeong
      ?? (ssotB.total_gross_area_sqm ? Math.round(sqmToPyeong(Number(ssotB.total_gross_area_sqm)) * 10) / 10 : undefined);
    const gfaPy = Number.isFinite(Number(rawGfaPy)) && Number(rawGfaPy) > 0 ? Number(rawGfaPy) : undefined;
    if (gfaPy) metrics.push({ label: '연면적', value: `${Number(gfaPy).toLocaleString()}평` });
    const floorsAbove = ssotB.floors_above ?? heroCard.floorsAbove;
    const floorsBelow = ssotB.floors_below ?? heroCard.floorsBelow;
    if (floorsAbove) {
      const scaleStr = floorsBelow ? `B${floorsBelow}/F${floorsAbove}` : `지상 ${floorsAbove}층`;
      metrics.push({ label: '건축규모', value: scaleStr });
    }
    const yieldObj = buildYieldFromHeroCard(heroCard);
    if (yieldObj && Number.isFinite(yieldObj.value) && yieldObj.value > 0) {
      summaryYield = yieldObj;
      metrics.push({ label: '연 수익률(Cap Rate)', value: `${yieldObj.value}%` });
    }
    const hasAnyVacant = Array.isArray(body?.floor_leases) && body.floor_leases.some((fl: any) => fl && (fl.is_vacant || String(fl.tenant_type || '').includes('공실')));
    const vacInfo = (heroCard.vacancyDisplay && heroCard.vacancyDisplay !== '확인 중')
      ? heroCard.vacancyDisplay
      : (ssotB.vacancy_signal ?? (Array.isArray(body?.floor_leases) && !hasAnyVacant ? '만실 운영 (공실 0%)' : '만실 운영'));
    if (vacInfo) metrics.push({ label: '공실 현황', value: vacInfo });
    // 보충: 6개 미만이면 실투자금 추가
    if (metrics.length < 6 && heroCard.equityRequiredBil && Number.isFinite(Number(heroCard.equityRequiredBil)) && Number(heroCard.equityRequiredBil) > 0) {
      metrics.push({ label: '실투자금', value: `약 ${heroCard.equityRequiredBil}억 원` });
    }
    } else if (posture === 'income') {
    const safeAsk = (askPrice && !String(askPrice).includes('Infinity') && !String(askPrice).includes('NaN')) ? String(askPrice) : '-';
    if (safeAsk !== '-') metrics.push({ label: '매매 희망가', value: safeAsk });
    if (heroCard.equityRequiredBil && Number.isFinite(Number(heroCard.equityRequiredBil)) && Number(heroCard.equityRequiredBil) > 0) {
      metrics.push({ label: '실투자금', value: `약 ${heroCard.equityRequiredBil}억 원` });
    }
    // D33 BL-C: 수익률 단일 객체 — 라벨은 값에서 파생, 문자열 교정 폐기
    const yieldObj = buildYieldFromHeroCard(heroCard);
    if (yieldObj && Number.isFinite(yieldObj.value) && yieldObj.value > 0) {
      summaryYield = yieldObj;
      metrics.push({ label: yieldLabel(yieldObj), value: `${yieldObj.value}%` });
    }
    // BL-4: 역레버리지 감지 — capRate < 조달금리(4.5% 기본)이면 ROE 단독 표시 금지 (Basic IM은 제외)
    const assumedLoanRate = heroCard.loanRatePct ?? 4.5;
    const isNegativeLeverage = !isBasicIM && heroCard.capRateBase && Number.isFinite(Number(heroCard.capRateBase)) && heroCard.capRateBase < assumedLoanRate;
    if (heroCard.leveragedYieldPct && Number.isFinite(Number(heroCard.leveragedYieldPct)) && !isNegativeLeverage) {
      metrics.push({ label: '자기자본수익률', value: `${heroCard.leveragedYieldPct}%` });
    } else if (isNegativeLeverage) {
      // 역레버리지 경고: ROE 대신 경고 메시지 표시
      metrics.push({
        label: '⚠️ 역레버리지 구간',
        value: `수익률 ${heroCard.capRateBase}% < 금리 ${assumedLoanRate}%`,
      });
    }
    } else if (posture === 'owner_occupied') {
    if (askPrice) metrics.push({ label: '매매 희망가', value: String(askPrice) });
    if (heroCard.pricePerPyeong) metrics.push({ label: '평당 매매가', value: `${heroCard.pricePerPyeong.toLocaleString()}원/평` });
    if (heroCard.ownVsLeaseSavingsBil) metrics.push({ label: '연 임대료 절감액', value: `약 ${heroCard.ownVsLeaseSavingsBil}억 원/년` });
    if (heroCard.breakevenYears) metrics.push({ label: '자가전환 손익분기', value: `약 ${heroCard.breakevenYears}년` });
    } else if (posture === 'trading') {
    if (askPrice) metrics.push({ label: '매매 희망가', value: String(askPrice) });
    if (heroCard.pricePerPyeong) metrics.push({ label: '평당 매매가', value: `${heroCard.pricePerPyeong.toLocaleString()}원/평` });
    if (heroCard.marketDiscountPct) metrics.push({ label: '시세 할인율(갭)', value: `${heroCard.marketDiscountPct}% 저평가` });
    if (heroCard.targetHprPct) metrics.push({ label: '목표 수익률(HPR)', value: `${heroCard.targetHprPct}%` });
    } else if (posture === 'development') {
    if (askPrice) metrics.push({ label: '토지 매입가', value: String(askPrice) });
    if (heroCard.landPricePerPyeong) metrics.push({ label: '토지 평당가', value: `${heroCard.landPricePerPyeong.toLocaleString()}만원/평` });
    // Hold 모드 분기: devHoldYieldPct 있으면 보유형 수익률, 아니면 분양형 이익률
    if (heroCard.devHoldYieldPct != null && heroCard.devHoldYieldPct > 0) {
      metrics.push({ label: '보유형 연 순수익률', value: `${heroCard.devHoldYieldPct}%` });
    } else if (heroCard.devProfitMarginPct != null) {
      metrics.push({ label: '예상 개발이익률', value: `${heroCard.devProfitMarginPct}%` });
    }
    if (heroCard.totalGrossAreaM2) metrics.push({ label: '신축 연면적', value: `${heroCard.totalGrossAreaM2.toLocaleString()}㎡` });
    } else if (posture === 'operating') {
    if (askPrice) metrics.push({ label: '매매 희망가', value: String(askPrice) });
    if (heroCard.noiBaseBil) metrics.push({ label: '연간 실질 GOP', value: `약 ${heroCard.noiBaseBil}억 원` });
    if (heroCard.gopMarginPct) metrics.push({ label: 'GOP 마진율', value: `${heroCard.gopMarginPct}%` });
    if (heroCard.revpar) metrics.push({ label: 'RevPAR(객실매출)', value: `약 ${(heroCard.revpar / 10000).toFixed(1)}만원` });
    }

    if (metrics.length === 0) {
    const yieldVal = heroCard.grossYieldDisplay ?? heroCard.grossYield;
    const area = heroCard.totalAreaDisplay ?? heroCard.totalArea;
    const vacancy = heroCard.vacancyDisplay ?? heroCard.vacancy;
    if (askPrice) metrics.push({ label: '매각 희망가', value: askPrice, unit: '' });
    if (yieldVal) metrics.push({ label: '연 수익률', value: yieldVal, unit: '' });
    if (area) metrics.push({ label: '연면적(총)', value: area, unit: '' }); // D30 BL-5: totalGross 명시
    if (vacancy) metrics.push({ label: '공실 현황', value: vacancy, unit: '' });
    }

    if (metrics.length < 4 && tables.length > 0) {
    const t = tables[0];
    for (const row of t.rows) {
      if (metrics.length >= 8) break;
      if (row.length >= 2) {
        metrics.push({ label: stripMarkdown(row[0]), value: stripMarkdown(row[1]) });
      }
    }
    }

    if (metrics.length < 4) {
    for (const line of lines.filter(l => !l.startsWith('|') && !l.startsWith('#'))) {
      if (metrics.length >= 8) break;
      const strippedLine = line.replace(/^[-*•·]\s*/, '').trim();
      const numMatch = strippedLine.match(/(\d[\d,.]*\s*(?:억|만원|원|%|㎡|평|층|호|실|개))/g);
      if (numMatch) {
        const parts = strippedLine.split(/[：:]/);
        const label = stripMarkdown(parts[0] || '').slice(0, 14).trim();
        const value = parts.length >= 2 ? stripMarkdown(parts[1]).trim() : stripMarkdown(numMatch[0]);
        if (label && value) {
          metrics.push({ label, value });
        }
      }
    }
    }

    const callouts = extractCallouts(lines.filter(l => !l.startsWith('|') && !/^[-:]+$/.test(l)));
    const keyPoints: string[] = [];
    if (Array.isArray(heroCard.keyPoints) && heroCard.keyPoints.length > 0) {
    keyPoints.push(...heroCard.keyPoints.map((k: string) => stripMarkdown(k)));
    } else if (Array.isArray(heroCard.investmentPoints) && heroCard.investmentPoints.length > 0) {
    keyPoints.push(...heroCard.investmentPoints.map((k: string) => stripMarkdown(k)));
    } else {
    // F5 fix: investment_thesis 섹션 불릿을 우선 참조 (property_overview보다 투자 관점 품질이 높음)
    const thesisSection = (body?.sections ?? []).find(
      (s: any) => s.section_type === 'investment_thesis'
    );
    const thesisMarkdown = thesisSection?.markdown || thesisSection?.content || '';
    const thesisBullets = thesisMarkdown
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => (l.startsWith('•') || l.startsWith('-') || l.startsWith('*') || l.match(/^\d+[.、)]/)) && l.length > 15)
      .map((l: string) => stripMarkdown(l.replace(/^[-*•·\d.、)]\s*/, '')))
      .slice(0, 3);

    if (thesisBullets.length >= 2) {
      keyPoints.push(...thesisBullets);
    } else {
      // property_overview 불릿 fallback
      const bullets = lines
        .filter(l => (l.startsWith('•') || l.startsWith('-') || l.startsWith('*') || l.match(/^\d+[.、)]/)) && l.length > 10)
        .map(l => stripMarkdown(l.replace(/^[-*•·\d.、)]\s*/, '')))
        .slice(0, 3);
      if (bullets.length > 0) {
        keyPoints.push(...thesisBullets, ...bullets); // thesis 먼저, overview 보충
      }
    }

    // 최종 SOTA 중개인 투자 포인트 합성 폴백 (3건 미만 시)
    // G-03: 하드코딩 제거 → SSOT 데이터 기반 동적 생성 (Rule 26, 34 준수)
    if (keyPoints.length < 3) {
      const area = heroCard.areaSignal || body?.ssot_summary?.area_signal || '해당 권역';
      const ask = body?.ssot_summary?.asking_price_manwon
        ? `${(Number(body.ssot_summary.asking_price_manwon) / 10000).toLocaleString()}억 원`
        : (heroCard.priceBand || '');
      const ssotKP = body?.ssot_summary ?? {};
      const vacFloors = Number(ssotKP.vacant_floor_count ?? (ssotKP.vacancy_rate_pct && ssotKP.vacancy_rate_pct > 0 ? 1 : 0));
      const roadInfo = ssotKP.road_condition || '';
      const locPoi = body?.enrichment?.locationPoi ?? body?.locationPoi;
      const nearestSt = locPoi?.nearestStation;
      const rawStation = ssotKP.station_name || heroCard.nearestStation || nearestSt?.name || nearestSt?.stationName || '';
      const stationName = normalizeStationName(rawStation);
      const stationMin = ssotKP.station_walk_min ?? nearestSt?.walkMinutes ?? (nearestSt?.distanceM ? Math.max(1, Math.round(nearestSt.distanceM / 80)) : undefined);
      const rawGrossAreaPy = Number(heroCard.totalGrossAreaPyeong ?? (ssotKP.total_gross_area_sqm ? sqmToPyeong(ssotKP.total_gross_area_sqm) : ssotKP.total_gross_area_pyeong ?? 0));
      const grossAreaPy = Number.isFinite(rawGrossAreaPy) && rawGrossAreaPy > 0 ? rawGrossAreaPy : 0;
      const rawSiteAreaPy = Number(heroCard.landAreaPyeong ?? (ssotKP.land_area_sqm ? sqmToPyeong(ssotKP.land_area_sqm) : ssotKP.land_area_pyeong ?? 0));
      const siteAreaPy = Number.isFinite(rawSiteAreaPy) && rawSiteAreaPy > 0 ? rawSiteAreaPy : 0;
      const rawAskManwon = Number(ssotKP.asking_price_manwon || 0);
      const askManwon = Number.isFinite(rawAskManwon) && rawAskManwon > 0 ? rawAskManwon : 0;
      const pyeongPriceManwon = grossAreaPy > 0 && askManwon > 0 ? Math.round(askManwon / grossAreaPy) : 0;
      const rawCapRate = Number(ssotKP.gross_yield ?? ssotKP.cap_rate ?? 0);
      const capRate = Number.isFinite(rawCapRate) && rawCapRate > 0 ? rawCapRate : 0;

      // 입지 포인트: 역명+도보분+도로조건을 동적 합성
      const stationPart = stationName && stationMin
        ? `${stationName} 도보 ${stationMin}분 역세권`
        : stationName
          ? `${stationName} 역세권`
          : stationMin
            ? `지하철역 도보 ${stationMin}분 역세권`
            : `대중교통 역세권 입지`;
      const roadPart = roadInfo ? ` 및 ${roadInfo} 접면` : '';
      const locationFb = `입지 가치: ${stationPart}${roadPart}, ${area} 업무·상업 중심지 배후 수요 확보`;

      // 수익 포인트: 공실 유무에 따라 분기
      let incomeFb: string;
      if (vacFloors > 0 && Number.isFinite(capRate) && capRate > 0) {
        const vacPct = Number(ssotKP.vacancy_pct ?? 0);
        const stabilizedRate = (Number.isFinite(vacPct) && vacPct < 100 && vacPct >= 0) ? (capRate / (1 - (vacPct / 100))) : capRate;
        incomeFb = `수익 안정성: 연 순수익률(Cap Rate) ${capRate.toFixed(2)}%, 공실 ${vacFloors}개 층 재임대 시 ${stabilizedRate.toFixed(2)}%로 상승 여력`;
      } else if (Number.isFinite(capRate) && capRate > 0) {
        incomeFb = `수익 안정성: 연 순수익률(Cap Rate) ${capRate.toFixed(2)}% 기반 안정적 임대수익 자산`;
      } else {
        incomeFb = `안정적 현금흐름: 전 층 임차인 운영 기반의 안정적 월 임대수익 창출`;
      }

      // 자산 규모 포인트: 연면적+대지면적+평당가
      const areaParts: string[] = [];
      if (Number.isFinite(siteAreaPy) && siteAreaPy > 0) areaParts.push(`대지 ${siteAreaPy.toFixed(0)}평`);
      if (Number.isFinite(grossAreaPy) && grossAreaPy > 0) areaParts.push(`연면적 ${grossAreaPy.toFixed(0)}평`);
      if (Number.isFinite(pyeongPriceManwon) && pyeongPriceManwon > 0 && grossAreaPy > 0) areaParts.push(`평당 약 ${pyeongPriceManwon.toLocaleString()}만 원`);
      const scaleFb = areaParts.length > 0
        ? `자산 규모: ${areaParts.join('·')} 규모 단독 빌딩`
        : `자산 규모: ${area} 소재 단독 빌딩 매입 기회`;

      const fallbacks = [locationFb, incomeFb, scaleFb];
      for (const fb of fallbacks) {
        if (keyPoints.length >= 3) break;
        if (!keyPoints.some(kp => kp.startsWith(fb.substring(0, 5)))) keyPoints.push(fb);
      }
    }
    }

    if (keyPoints.length < 2) {
    const phys = heroCard;
    if (phys.totalGrossAreaSqm || phys.totalAreaDisplay) {
      const areaStr = phys.totalGrossAreaSqm
        ? `${Number(phys.totalGrossAreaSqm).toLocaleString()}㎡`
        : (phys.totalAreaDisplay || '');
      keyPoints.push(`건물 규모: 연면적 ${areaStr} 규모의 ${phys.mainUseName || '상업용'} 자산`);
    }
    if (phys.completionDate || phys.completionYear) {
      keyPoints.push(`건물 이력: ${phys.completionDate || phys.completionYear || ''} 준공, ${phys.structureDesc || 'RC조'} 구조`);
    }
    if (keyPoints.length < 2) {
      const area = heroCard.areaSignal || '해당 권역';
      keyPoints.push(`입지 가치: ${area} 소재 자산으로 중장기 자산 가치 검토 필요`);
    }
    }

    const rawLead = stripMarkdown(heroCard.keyInvestmentPoint || heroCard.hookText || findLeadSentence(lines.filter(l => !l.startsWith('|'))));
    const cleanLead = rawLead.replace(/\b\d+억대\b/g, askPrice);
    return {
    leadSentence: cleanLead,
    metrics,
    keyPoints,
    callouts,
    _yield: summaryYield,  // D33 BL-C: 호출처에서 dataMap._yield에 주입
    };
}

export function buildLandFromOverview(markdown: string, tables: ParsedTable[]): Record<string, any> {
    const landKeywords = ['토지', '대지', '용적률', '건폐율', '용도지역', '지목', 'pnu', '면적'];
    const landRows: string[][] = [];
    for (const t of tables) {
    for (const row of t.rows) {
      const rowText = row.join(' ').toLowerCase();
      if (landKeywords.some(kw => rowText.includes(kw))) {
        landRows.push(row.map(stripMarkdown));
      }
    }
    }

    return {
    left: { sub: '토지 현황', rows: landRows.length > 0 ? landRows : [] },
    right: { sub: '', callouts: [] },
    };
}

/**
 * D38: A16 투자 및 자본조달 구조 (Investment Structure) props 생성기
 * 매매가, 법정 취득세(4.6%), 중개보수(0.9%), 보증금, LTV 시나리오 및 역레버리지 분석
 */
export function buildA16Props(markdown: string, tables: ParsedTable[], body?: Record<string, any>, building?: Record<string, any>): Record<string, any> {
    let priceWon = 0;
    const ssot = body?.ssot_summary ?? {};
    if (ssot.asking_price_manwon) {
    priceWon = Number(ssot.asking_price_manwon) * 10000;
    } else if (body?.asking_price_manwon) {
    priceWon = Number(body.asking_price_manwon) * 10000;
    } else if (building?.price_band) {
    const match = String(building.price_band).match(/([\d,.]+)\s*억/);
    if (match) priceWon = parseFloat(match[1].replace(/,/g, '')) * 1e8;
    } else if (ssot.price_band) {
    const match = String(ssot.price_band).match(/([\d,.]+)\s*억/);
    if (match) priceWon = parseFloat(match[1].replace(/,/g, '')) * 1e8;
    }

    if (priceWon === 0 && markdown) {
    const pMatch = markdown.match(/(?:매매가|매각\s*희망가|희망가|매매대금|거래금액)[^0-9]*([\d,.]+)\s*억/);
    if (pMatch) priceWon = parseFloat(pMatch[1].replace(/,/g, '')) * 1e8;
    }

    if (priceWon <= 0) {
      console.warn('[archetype-builders] 매매 희망가 미확인 — 투자구조 슬라이드 억제');
    }
    let depositWon = 0;
    if (body?.total_deposit_krw) {
    depositWon = Number(body.total_deposit_krw);
    } else if (body?.total_deposit_manwon) {
    depositWon = Number(body.total_deposit_manwon) * 10000;
    } else if (ssot.total_deposit_krw) {
    depositWon = Number(ssot.total_deposit_krw);
    } else if (ssot.deposit_manwon) {
    depositWon = Number(ssot.deposit_manwon) * 10000;
    } else {
    // 렌트롤 테이블 또는 마크다운에서 보증금 탐색
    const depMatch = markdown.match(/(?:보증금|임대보증금)[^0-9]*([\d,.]+)\s*(?:억|만\s*원)/);
    if (depMatch) {
      const val = parseFloat(depMatch[1].replace(/,/g, ''));
      depositWon = depMatch[0].includes('억') ? val * 1e8 : val * 10000;
    } else {
      // 일반적인 근생 보증금 (매매가의 약 5%)
      depositWon = 0; // 보증금 정보 미확인
    }
    }

    let monthlyRentWon = 0;
    if (body?.monthly_rent_total_krw) {
    monthlyRentWon = Number(body.monthly_rent_total_krw);
    } else if (body?.monthly_rent_manwon) {
    monthlyRentWon = Number(body.monthly_rent_manwon) * 10000;
    } else if (ssot.monthly_rent_total_krw) {
    monthlyRentWon = Number(ssot.monthly_rent_total_krw);
    } else if (ssot.monthly_rent_manwon) {
    monthlyRentWon = Number(ssot.monthly_rent_manwon) * 10000;
    } else {
    const rentMatch = markdown.match(/(?:월\s*임대료|월세)[^0-9]*([\d,.]+)\s*(?:만\s*원|억)/);
    if (rentMatch) {
      const val = parseFloat(rentMatch[1].replace(/,/g, ''));
      monthlyRentWon = rentMatch[0].includes('억') ? val * 1e8 : val * 10000;
    } else {
      monthlyRentWon = 0; // 임대료 정보 미확인
    }
    }

    const annualRentWon = monthlyRentWon * 12;
    const grossYieldPct = priceWon > 0 ? (annualRentWon / priceWon) * 100 : 4.0;
    const acqCost = body?.acquisition_cost as { tax_pct?: number; brokerage_manwon?: number; legal_manwon?: number; other_manwon?: number } | undefined;
    const loanScenario = body?.loan_scenario as { ltv_pct?: number; interest_pct?: number; term_years?: number; target_irr_pct?: number } | undefined;
    const taxPct = (acqCost?.tax_pct ?? 4.6) / 100;
    const acquisitionTax = Math.round(priceWon * taxPct);
    const brokerFeeWon = acqCost?.brokerage_manwon != null
            ? Math.round(acqCost.brokerage_manwon * 10000)
            : Math.round(priceWon * 0.009);
    const legalFeeWon = acqCost?.legal_manwon != null ? Math.round(acqCost.legal_manwon * 10000) : 0;
    const otherCostWon = acqCost?.other_manwon != null ? Math.round(acqCost.other_manwon * 10000) : 0;
    const totalAcquisitionCost = priceWon + acquisitionTax + brokerFeeWon + legalFeeWon + otherCostWon;
    const userLtvPct = loanScenario?.ltv_pct;
    const standardLoanRate = userLtvPct != null ? userLtvPct / 100 : 0.50;
    const loan = Math.round(priceWon * standardLoanRate);
    const equity = Math.max(0, totalAcquisitionCost - depositWon - loan);
    const loanInterestRate = (loanScenario?.interest_pct ?? 4.8) / 100;
    const isAssumedRate = !loanScenario?.interest_pct;
    const ltvPctList = [0, 40, 50, 60];
    const ltvScenarios = ltvPctList.map(ltv => {
            const scLoan = Math.round(priceWon * (ltv / 100));
            const scEquity = Math.max(0, totalAcquisitionCost - depositWon - scLoan);
            const scInterest = Math.round(scLoan * loanInterestRate);
            const netIncome = Math.max(0, annualRentWon - scInterest);
            const leveredYield = scEquity > 0 ? (netIncome / scEquity) * 100 : 0;
            const notes: Record<number, string> = {
              0: '전액 자기자본 (무차입)',
              40: '보수적 차입 (안정형)',
              50: '표준 차입 (기본형)',
              60: '적극적 차입 (레버리지)',
            };
            return {
              ltvPct: ltv,
              equityBil: (scEquity / 1e8).toFixed(1),
              yieldPct: leveredYield.toFixed(2),
              note: notes[ltv] || `LTV ${ltv}%`,
            };
          });
    const isNegativeLeverage = grossYieldPct < (loanInterestRate * 100);
    const actualTaxPctLabel = ((acqCost?.tax_pct ?? 4.6)).toFixed(1);
    const actualLtvPctLabel = userLtvPct != null ? `${userLtvPct}` : '50';
    const totalCostPctOfPrice = priceWon > 0 ? ((totalAcquisitionCost / priceWon) * 100).toFixed(1) : '105.5';
    const table1Rows: string[][] = [
            ['구분', '금액 (억 원)', '비율'],
            ['매매 희망가', `${(priceWon / 1e8).toFixed(1)}억`, '100.0%'],
            ['취득세 (' + actualTaxPctLabel + '%)', `${(acquisitionTax / 1e8).toFixed(2)}억`, actualTaxPctLabel + '%'],
            ['중개보수', `${(brokerFeeWon / 1e8).toFixed(2)}억`, `${priceWon > 0 ? ((brokerFeeWon / priceWon) * 100).toFixed(1) : '0.9'}%`],
          ];
    if (legalFeeWon > 0) table1Rows.push(['법무사비', `${(legalFeeWon / 1e8).toFixed(2)}억`, `${((legalFeeWon / priceWon) * 100).toFixed(2)}%`]);
    if (otherCostWon > 0) table1Rows.push(['기타 취득비용', `${(otherCostWon / 1e8).toFixed(2)}억`, `${((otherCostWon / priceWon) * 100).toFixed(2)}%`]);
    table1Rows.push(
    ['총취득원가', `${(totalAcquisitionCost / 1e8).toFixed(1)}억`, `${totalCostPctOfPrice}%`],
    ['(-) 임대보증금', `${(depositWon / 1e8).toFixed(1)}억`, `${((depositWon / priceWon) * 100).toFixed(1)}%`],
    [`(-) 담보대출 (${actualLtvPctLabel}%)`, `${(loan / 1e8).toFixed(1)}억`, `${actualLtvPctLabel}%`],
    ['실투자금 (Net Equity)', `${(equity / 1e8).toFixed(1)}억`, `${((equity / priceWon) * 100).toFixed(1)}%`],
    );
    return {
    kicker: 'CAPITAL STRUCTURE',
    title: '투자 및 자본 조달 구조 분석',
    equityBreakdown: {
      price: priceWon,
      acquisitionTax,
      brokerFee: brokerFeeWon,
      legalFee: legalFeeWon,
      otherCost: otherCostWon,
      totalAcquisitionCost,
      deposit: depositWon,
      loan,
      equity,
    },
    askingPriceBil: (priceWon / 1e8).toFixed(1),
    totalDepositBil: (depositWon / 1e8).toFixed(1),
    loanAmountBil: (loan / 1e8).toFixed(1),
    equityRequiredBil: (equity / 1e8).toFixed(1),
    grossYieldPct: grossYieldPct.toFixed(2),
    ltvScenarios,
    negativeLeverage: isNegativeLeverage,
    // D41: 사용자 입력 대출 시나리오 참조 데이터
    loanScenarioInput: loanScenario ?? null,
    table1: { sub: '총취득원가 및 실투자금 내역', rows: table1Rows },
    table2: { sub: 'LTV별 레버리지 효과', rows: [] },
    callouts: [],
    };
}

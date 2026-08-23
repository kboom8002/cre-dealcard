// src/domain/building/mobile-im/pptx/archetypes/a17-pre-completion-marketing.ts
// A17: 준공 전 마케팅 & 스태킹 플랜 (Pre-completion Marketing) 아키타입
// Spec: API_TYPE_CONTRACT.md (D3 §5.2), ARCHETYPE_DESIGN_SYSTEM.md

import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR, CD } from '../imlib';
import type { ProvenanceKind } from '../imlib';

export interface ArchetypeInput {
  pres: PptxGenJS;
  slideNum: number;
  docno: string;
  watermarkText?: string;
  data: Record<string, any>;
  grade: 'A' | 'B' | 'C';
  provenance: Record<string, ProvenanceKind>;
}

export interface ArchetypeOutput {
  slide: ReturnType<PptxGenJS['addSlide']>;
  warnings: string[];
}

export function buildA17PreCompletionMarketing(input: ArchetypeInput): ArchetypeOutput {
  const onDark = input.data.onDark === true;
  const slide = onDark ? L.dark(input.pres) : L.light(input.pres);
  const warnings: string[] = [];

  const kicker = input.data.kicker || 'DEVELOPMENT & STACKING';
  const title = input.data.title || '신축 개발 규모 및 준공 전 마케팅 계획';

  if (onDark) {
    L.headD(slide, input.slideNum, kicker, title);
  } else {
    L.head(slide, input.slideNum, kicker, title);
  }

  const gap = 0.30;
  const colW = L.col(2, gap);
  const y = 1.55;
  const cardH = 4.80;

  // ── 좌측 카드: 층별 스태킹 플랜 (Stacking Plan) ──
  const leftX = L.colX(0, colW, gap);
  L.card(slide, leftX, y, colW, cardH, { onDark });

  slide.addText('1. 층별 용도 및 면적 배분 계획', {
    x: leftX + 0.25,
    y: y + 0.22,
    w: colW - 0.5,
    h: 0.35,
    fontFace: KR,
    fontSize: 13.5,
    bold: true,
    color: onDark ? C.brass : C.brassD,
    margin: 0,
  });

  const stackingRows = input.data.stackingPlan || [
    { floor: '5F~6F', usage: '업무시설 (Office)', area: '약 120평', tenant: '사옥 / 전문직 법인' },
    { floor: '2F~4F', usage: '근린생활시설 (Clinic)', area: '약 180평', tenant: '병원·의원 / 학원' },
    { floor: '1F', usage: '근린생활시설 (Retail)', area: '약 50평', tenant: 'F&B / 플래그십 스토어' },
    { floor: 'B1F', usage: '주차 및 부속시설', area: '약 80평', tenant: '자주식/기계식 주차' },
  ];

  const stackingHeaders = ['층수', '권장 용도', '전용 면적', '타깃 임차'];
  const stackingData = stackingRows.map((r: any) => [
    r.floor,
    r.usage,
    r.area || `${r.areaPyeong ?? '-'}평`,
    r.tenant || r.targetTenant || '-',
  ]);

  const stackColW = [1.1, 1.6, 1.2, 1.5];
  L.table(
    slide,
    leftX + 0.25,
    y + 0.65,
    colW - 0.5,
    stackingHeaders,
    stackingData.map((row: string[]) => row.map(c => ({ t: c }))),
    stackColW,
    { rh: 0.52, bfs: 11, hfs: 11, onDark }
  );

  // ── 우측 카드: 신축 지표 & 규제 완화 기한 ──
  const rightX = L.colX(1, colW, gap);
  L.card(slide, rightX, y, colW, cardH, { onDark });

  slide.addText('2. 신축 개요 및 규제 기한', {
    x: rightX + 0.25,
    y: y + 0.22,
    w: colW - 0.5,
    h: 0.35,
    fontFace: KR,
    fontSize: 13.5,
    bold: true,
    color: onDark ? C.brass : C.brassD,
    margin: 0,
  });

  const dev = input.data.devMetrics || {};
  const devSummaryRows: [string, string][] = [
    ['토지 대지면적', dev.landAreaPyeong ? `${dev.landAreaPyeong}평` : (input.data.platAreaPyeong ? `${input.data.platAreaPyeong}평` : '-')],
    ['예상 신축 연면적', dev.targetGrossAreaPyeong ? `${dev.targetGrossAreaPyeong}평` : (input.data.targetGrossAreaPyeong ? `${input.data.targetGrossAreaPyeong}평` : '-')],
    ['적용 건폐율 / 용적률', `${dev.expectedBcrPct ?? input.data.bcrPct ?? '-'}% / ${dev.expectedFarPct ?? input.data.farPct ?? '-'}%`],
    ['예상 총공사비 (1,200만/평)', dev.estConstructionCostBil ? `${dev.estConstructionCostBil}억 원` : (input.data.constructionCostBil ? `${input.data.constructionCostBil}억 원` : '-')],
    ['예상 총사업비 (토지+공사+예비비)', input.data.totalProjectCostBil ? `${input.data.totalProjectCostBil}억 원` : '-'],
  ];

  L.rows(slide, rightX + 0.25, y + 0.65, colW - 0.5, devSummaryRows, {
    rh: 0.48,
    fs: 11,
    onDark,
  });

  // ── 한시 규제 완화 기한 경고 배너 ──
  const expiry = input.data.regulationExpiry || '2028-05-18';
  const daysLeft = input.data.regulationDaysLeft ?? 630;

  L.callout(
    slide,
    rightX + 0.25,
    y + 3.10,
    colW - 0.5,
    1.40,
    'warn',
    `⏳ 한시적 용적률 완화 기한: ${expiry} (잔여 ${daysLeft}일)`,
    '• 건축허가 접수일 기준 한시적 인센티브가 적용되므로 인허가 타임라인 준수 필수\n• 인허가 지연 시 기준 용적률로 회귀할 위험에 대한 사전 인허가 사전심의 필요'
  );

  if (input.watermarkText) L.watermark(slide, input.watermarkText, onDark);
  L.foot(slide, input.slideNum, input.docno, onDark);

  return { slide, warnings };
}

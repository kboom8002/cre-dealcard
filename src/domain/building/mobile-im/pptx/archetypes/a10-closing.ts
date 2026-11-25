import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR, NUM, CD, THEME_META } from '../imlib';
import type { ProvenanceKind } from '../imlib';
import { optimizeImageForPptx } from '../utils/image-optimizer';

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

/**
 * A10 — 마감 · 표기 기준 · 다음 단계 (통합 dark 슬라이드)
 * A09 Process + A10 Closing 통합 — 깔끔한 단일 마감 슬라이드
 */
export async function buildA10Closing(input: ArchetypeInput): Promise<ArchetypeOutput> {
  const slide = L.dark(input.pres);
  const warnings: string[] = [];
  L.headD(slide, input.slideNum, input.data.kicker || 'DISCLAIMER', input.data.title || '표기 기준 및 면책');
  const isBasicClosing =
    THEME_META.presetId === 'credeal_basic' ||
    input.data?.isBasicIm === true ||
    input.data?.preset === 'credeal_basic' ||
    input.data?.title === '문의 및 유의사항';
  
  // ── 상단: 다음 단계 (프로세스 3단계 가로 바) ──
  const processSteps = [
    { num: '01', title: '관심 표명', desc: '담당 중개사에게 초기 관심 표명 및 상담 요청' },
    { num: '02', title: 'NDA 체결', desc: '비밀유지계약 후 상세 임대차·재무 자료 제공' },
    { num: '03', title: '현장 실사', desc: '건물 컨디션 및 설비 직접 확인 후 의향서(LOI) 제출' },
  ];

  const stepGap = 0.16;
  const stepW = L.col(3, stepGap);
  const stepY = 1.60;
  const stepH = 0.72;

  processSteps.forEach((s, i) => {
    const x = L.colX(i, stepW, stepGap);
    
    // 배경
    slide.addShape('roundRect', {
      x, y: stepY, w: stepW, h: stepH,
      rectRadius: 0.04,
      fill: { color: CD.block },
    });
    
    // 번호 원
    slide.addShape('ellipse', {
      x: x + 0.12, y: stepY + 0.12, w: 0.48, h: 0.48,
      fill: { color: C.brass },
    });
    slide.addText(s.num, {
      x: x + 0.12, y: stepY + 0.12, w: 0.48, h: 0.48,
      align: 'center', valign: 'middle',
      fontFace: NUM, fontSize: 14, bold: true, color: 'FFFFFF', margin: 0,
    });
    
    // 타이틀 + 설명 (번호 옆에 인라인)
    slide.addText(s.title, {
      x: x + 0.72, y: stepY + 0.10, w: stepW - 0.84, h: 0.26,
      fontFace: KR, fontSize: 11, bold: true, color: 'FFFFFF', margin: 0,
    });
    slide.addText(s.desc, {
      x: x + 0.72, y: stepY + 0.36, w: stepW - 0.84, h: 0.28,
      fontFace: KR, fontSize: 9, color: CD.mute, margin: 0, valign: 'top',
    });
    
    // 화살표 (마지막 제외)
    if (i < 2) {
      slide.addText('→', {
        x: x + stepW, y: stepY + 0.15, w: stepGap, h: 0.42,
        align: 'center', valign: 'middle',
        fontFace: KR, fontSize: 16, color: C.brass, margin: 0,
      });
    }
  });

  // ── 중앙: 한 줄 매수 제안(closingLine) + 담당 중개사 와이드 카드 ──
  const sectionY = stepY + stepH + (isBasicClosing ? 0.42 : 0.22);

  const closingLine = String(
    (input.data as any)?.closingLine ?? (input.data?.brokerContact as any)?.closingLine ?? ''
  ).trim();

  let brokerSectionY = sectionY;
  if (closingLine) {
    const quoteH = isBasicClosing ? 0.58 : 0.46;
    slide.addShape('roundRect', {
      x: M, y: sectionY, w: CW, h: quoteH,
      rectRadius: 0.05,
      fill: { color: CD.block },
    });
    slide.addShape('rect', {
      x: M, y: sectionY, w: 0.06, h: quoteH,
      fill: { color: C.brass },
    });
    slide.addText(closingLine, {
      x: M + 0.22, y: sectionY + 0.06, w: CW - 0.40, h: quoteH - 0.12,
      fontFace: KR, fontSize: 10.5, bold: true, color: 'FFFFFF',
      margin: 0, valign: 'middle', shrinkText: true,
    });
    brokerSectionY = sectionY + quoteH + 0.18;
  }

  // 중개사 문의처 와이드 카드
  const rawBroker = input.data.brokerContact || {};
  const DUMMY_BROKER_VALUES = new Set([
    '담당 공인중개사',
    '전담 부동산중개법인',
    '크리딜 파트너 중개법인',
    '11560-2023-00412',
    '02-558-7700',
    '-',
  ]);
  const cleanBrokerVal = (v: unknown) => {
    const s = String(v || '').trim();
    return !s || DUMMY_BROKER_VALUES.has(s) ? '' : s;
  };
  const cleanRepName = cleanBrokerVal(
    (rawBroker as Record<string, unknown>).representativeName ||
      (rawBroker as Record<string, unknown>).representative_name ||
      (input.data as Record<string, unknown>).representativeName ||
      (input.data as Record<string, unknown>).representative_name
  )
    .replace(/^대표\s*(?:자)?\s*[:：]?\s*/, '')
    .trim();
  const cleanStaffName = cleanBrokerVal(rawBroker.name)
    .replace(/^담당\s+담당/, '담당')
    .replace(/^담당\s*(?:자)?\s*[:：]?\s*/, '')
    .trim();
  const broker = {
    name: cleanStaffName,
    representativeName: cleanRepName,
    title: cleanBrokerVal(rawBroker.title),
    phone: cleanBrokerVal(rawBroker.phone),
    email: cleanBrokerVal(rawBroker.email),
    company: cleanBrokerVal(rawBroker.company),
    registrationNo: cleanBrokerVal(rawBroker.registrationNo),
    officeAddress: cleanBrokerVal(
      (rawBroker as Record<string, unknown>).officeAddress ||
        (rawBroker as Record<string, unknown>).office_address ||
        (rawBroker as Record<string, unknown>).address
    ),
  };
  const hasBrokerInfo = Boolean(
    broker.name ||
      broker.representativeName ||
      broker.phone ||
      broker.company ||
      broker.officeAddress ||
      broker.registrationNo
  );

  let logoImg: Awaited<ReturnType<typeof optimizeImageForPptx>> | null = null;
  if (input.data?.logoUrl) {
    try {
      logoImg = await optimizeImageForPptx(input.data.logoUrl as string, 200, 90);
    } catch {
      warnings.push('로고 이미지 로딩 실패 (closing)');
    }
  }

  let afterBrokerY = brokerSectionY;
  if (hasBrokerInfo) {
    L.sub(slide, M, brokerSectionY, CW, '담당 중개사', true);
    const contactY = brokerSectionY + 0.34;
    const contactH = isBasicClosing ? (closingLine ? 1.95 : 2.25) : 1.55;

    slide.addShape('roundRect', {
      x: M, y: contactY, w: CW, h: contactH,
      rectRadius: 0.06,
      fill: { color: CD.block },
      line: { color: C.brass, width: 0.9 },
    });

    const repPart = broker.representativeName ? `대표자 ${broker.representativeName}` : '';
    const staffPart =
      broker.name && broker.name !== broker.representativeName
        ? `담당 ${broker.name}${broker.title ? ` ${broker.title}` : ''}`
        : !broker.representativeName && broker.name
        ? [broker.name, broker.title].filter(Boolean).join(' ')
        : '';
    const nameLine = [repPart, staffPart].filter(Boolean).join('    ');
    const contactLine = [
      broker.phone ? `☎ ${broker.phone}` : '',
      broker.email ? `✉ ${broker.email}` : '',
    ].filter(Boolean).join('    ');
    const companyLine = [
      broker.company ? `${broker.company}` : '',
      broker.registrationNo ? `등록번호: ${broker.registrationNo}` : '',
    ].filter(Boolean).join('    ');
    const addressLine = broker.officeAddress ? `소재지: ${broker.officeAddress}` : '';

    const cardLines: Array<{ text: string; fontSize: number; bold: boolean; color: string }> = [
      ...(nameLine ? [{ text: nameLine, fontSize: 13.5, bold: true, color: 'FFFFFF' }] : []),
      ...(contactLine ? [{ text: contactLine, fontSize: 11, bold: false, color: CD.body }] : []),
      ...(companyLine ? [{ text: companyLine, fontSize: 10.5, bold: false, color: CD.mute }] : []),
      ...(addressLine ? [{ text: addressLine, fontSize: 10, bold: false, color: CD.mute }] : []),
    ];

    const textW = logoImg ? CW - 2.10 : CW - 0.56;
    const rowStep = cardLines.length <= 3 ? Math.min(0.44, (contactH - 0.24) / Math.max(1, cardLines.length)) : Math.min(0.38, (contactH - 0.20) / cardLines.length);
    const contentH = cardLines.length * rowStep;
    const startLineY = contactY + Math.max(0.12, (contactH - contentH) / 2);

    cardLines.forEach((line, idx) => {
      slide.addText(line.text, {
        x: M + 0.28,
        y: startLineY + idx * rowStep,
        w: textW,
        h: Math.max(0.24, rowStep - 0.04),
        fontFace: KR,
        fontSize: line.fontSize,
        bold: line.bold,
        color: line.color,
        valign: 'middle',
        shrinkText: true,
        margin: 0,
      });
    });

    if (logoImg) {
      slide.addImage({
        data: logoImg.base64,
        x: M + CW - 1.75,
        y: contactY + (contactH - 0.85) / 2,
        w: 1.45,
        h: 0.85,
        sizing: { type: 'contain', w: 1.45, h: 0.85 },
      });
    }
    afterBrokerY = contactY + contactH + 0.18;
  } else if (logoImg) {
    slide.addImage({
      data: logoImg.base64,
      x: M + CW - 1.45,
      y: brokerSectionY + 0.20,
      w: 1.45,
      h: 0.85,
      sizing: { type: 'contain', w: 1.45, h: 0.85 },
    });
    afterBrokerY = brokerSectionY + 1.15;
  }

  if (isBasicClosing) {
    // ── Basic IM: 하단 1줄 미세 면책 안내 (카드·제목 박스 제거, 법적 보호용 최소 표기) ──
    const singleLineDisclaimer =
      '※ 면책 안내: 본 자료는 매수 검토 참고용이며 공부 및 현장 실사를 통해 최종 확인하시기 바랍니다.';
    slide.addText(singleLineDisclaimer, {
      x: M,
      y: 6.44,
      w: CW,
      h: 0.28,
      fontFace: KR,
      fontSize: 8,
      color: CD.mute,
      align: 'left',
      valign: 'middle',
      shrinkText: true,
      margin: 0,
    });
  } else {
    // ── Pro IM / 기본 마감: 5대 데이터 출처 표기 기준 + 법적 면책 조항 ──
    const defaultBadges = [
      { label: '✓ 공부확인', description: '등기부·대장 등 공적 장부 직접 확인' },
      { label: '★ 전문가검증', description: '세무사·감정평가사 등 전문가 확인' },
      { label: '▲ 매도인고지', description: '매도인이 구두 또는 서면으로 고지' },
      { label: '● 중개인입력', description: '중개인 현장 조사 및 경험 기반 입력' },
      { label: '◇ AI추정·가정', description: '시나리오 분석 및 AI 모델 추정' },
    ];
    const badges: Array<{ label: string; description?: string }> =
      Array.isArray(input.data?.badges) && input.data.badges.length > 0
        ? input.data.badges
        : defaultBadges;
    const disclaimerText = String(
      input.data?.disclaimer ||
        '본 자료는 투자 권유가 아니며, 기재된 정보의 정확성을 보증하지 않습니다.'
    ).trim();

    const legalStartY = Math.max(afterBrokerY, hasBrokerInfo ? 4.55 : 2.65);
    L.sub(slide, M, legalStartY, CW, '데이터 출처 표기 및 법적 면책 고지', true);

    const badgeGap = 0.12;
    const badgeCount = Math.min(badges.length, 5);
    const badgeW = (CW - badgeGap * (badgeCount - 1)) / badgeCount;
    const badgeY = legalStartY + 0.34;
    const badgeH = 0.86;

    badges.slice(0, 5).forEach((b, idx) => {
      const bx = M + idx * (badgeW + badgeGap);
      slide.addShape('roundRect', {
        x: bx,
        y: badgeY,
        w: badgeW,
        h: badgeH,
        rectRadius: 0.04,
        fill: { color: CD.block },
        line: { color: CD.border, width: 0.6 },
      });
      slide.addText(String(b.label || ''), {
        x: bx + 0.10,
        y: badgeY + 0.08,
        w: badgeW - 0.20,
        h: 0.26,
        fontFace: KR,
        fontSize: 9.5,
        bold: true,
        color: C.brass,
        margin: 0,
        shrinkText: true,
      });
      if (b.description) {
        slide.addText(String(b.description), {
          x: bx + 0.10,
          y: badgeY + 0.36,
          w: badgeW - 0.20,
          h: 0.44,
          fontFace: KR,
          fontSize: 8,
          color: CD.mute,
          valign: 'top',
          margin: 0,
          shrinkText: true,
        });
      }
    });

    const discY = Math.min(badgeY + badgeH + 0.16, 6.00);
    const discH = Math.min(0.68, 6.70 - discY);
    slide.addShape('roundRect', {
      x: M,
      y: discY,
      w: CW,
      h: discH,
      rectRadius: 0.04,
      fill: { color: CD.block },
      line: { color: CD.border, width: 0.6 },
    });
    slide.addText(disclaimerText, {
      x: M + 0.20,
      y: discY + 0.06,
      w: CW - 0.40,
      h: discH - 0.12,
      fontFace: KR,
      fontSize: 8.8,
      color: CD.body,
      valign: 'middle',
      shrinkText: true,
      margin: 0,
    });
  }

  if (input.watermarkText) L.watermark(slide, input.watermarkText, true);
  L.foot(slide, input.slideNum, input.docno, true);
  return { slide, warnings };
}

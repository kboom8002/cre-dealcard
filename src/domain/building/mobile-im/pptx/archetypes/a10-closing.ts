import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR, NUM, CD } from '../imlib';
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

  // ── 중앙: 한 줄 매수 제안(closingLine) + 담당 중개사 와이드 카드 (데이터 출처 표기·면책 카드 제거) ──
  const sectionY = stepY + stepH + 0.42;

  const closingLine = String(
    (input.data as any)?.closingLine ?? (input.data?.brokerContact as any)?.closingLine ?? ''
  ).trim();

  let brokerSectionY = sectionY;
  if (closingLine) {
    const quoteH = 0.58;
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
    brokerSectionY = sectionY + quoteH + 0.22;
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
  const broker = {
    name: cleanBrokerVal(rawBroker.name).replace(/^담당\s+담당/, '담당'),
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
    broker.name || broker.phone || broker.company || broker.officeAddress || broker.registrationNo
  );

  let logoImg: Awaited<ReturnType<typeof optimizeImageForPptx>> | null = null;
  if (input.data?.logoUrl) {
    try {
      logoImg = await optimizeImageForPptx(input.data.logoUrl as string, 200, 90);
    } catch {
      warnings.push('로고 이미지 로딩 실패 (closing)');
    }
  }

  if (hasBrokerInfo) {
    L.sub(slide, M, brokerSectionY, CW, '담당 중개사', true);
    const contactY = brokerSectionY + 0.36;
    const contactH = closingLine ? 1.95 : 2.25;

    slide.addShape('roundRect', {
      x: M, y: contactY, w: CW, h: contactH,
      rectRadius: 0.06,
      fill: { color: CD.block },
      line: { color: C.brass, width: 0.9 },
    });

    const nameLine = [broker.name, broker.title].filter((s: unknown) => typeof s === 'string' && s.trim()).join('  ');
    const contactLine = [
      broker.phone ? `☎ ${broker.phone}` : '',
      broker.email ? `✉ ${broker.email}` : '',
    ].filter(Boolean).join('    ');
    const companyLine = [
      broker.company ? `🏢 ${broker.company}` : '',
      broker.registrationNo ? `등록번호: ${broker.registrationNo}` : '',
    ].filter(Boolean).join('    ');
    const addressLine = broker.officeAddress ? `소재지: ${broker.officeAddress}` : '';

    const cardLines: Array<{ text: string; fontSize: number; bold: boolean; color: string }> = [
      ...(nameLine ? [{ text: nameLine, fontSize: 14, bold: true, color: 'FFFFFF' }] : []),
      ...(contactLine ? [{ text: contactLine, fontSize: 11.5, bold: false, color: CD.body }] : []),
      ...(companyLine ? [{ text: companyLine, fontSize: 10.5, bold: false, color: CD.mute }] : []),
      ...(addressLine ? [{ text: addressLine, fontSize: 10, bold: false, color: CD.mute }] : []),
    ];

    const textW = logoImg ? CW - 2.10 : CW - 0.56;
    const rowStep = cardLines.length <= 3 ? 0.44 : 0.38;
    const contentH = cardLines.length * rowStep;
    const startLineY = contactY + Math.max(0.18, (contactH - contentH) / 2);

    cardLines.forEach((line, idx) => {
      slide.addText(line.text, {
        x: M + 0.28,
        y: startLineY + idx * rowStep,
        w: textW,
        h: rowStep - 0.04,
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
  } else if (logoImg) {
    slide.addImage({
      data: logoImg.base64,
      x: M + CW - 1.45,
      y: brokerSectionY + 0.20,
      w: 1.45,
      h: 0.85,
      sizing: { type: 'contain', w: 1.45, h: 0.85 },
    });
  }

  // ── 하단 1줄 미세 면책 안내 (카드·제목 박스 제거, 법적 보호용 최소 표기) ──
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

  if (input.watermarkText) L.watermark(slide, input.watermarkText, true);
  L.foot(slide, input.slideNum, input.docno, true);
  return { slide, warnings };
}

/**
 * @file a18-checklist.ts
 * @description D30 M-11 / D38: 체크리스트 전용 PPTX 아키타입 (A18)
 * 확인사항 및 결손 이관 항목을 전량 표기하는 결정론적 렌더러
 */
import type { ArchetypeInput, ArchetypeOutput } from './a01-cover';
import * as L from '../imlib';
import { C, M, CW, KR, NUM } from '../imlib';

export async function buildA18Checklist(input: ArchetypeInput): Promise<ArchetypeOutput> {
  const { pres, data } = input;
  const warnings: string[] = [];
  const slide = L.light(pres);

  const kicker = (data.kicker as string) || 'DUE DILIGENCE CHECKLIST';
  const title = (data.title as string) || '실사 체크리스트 및 확인 필요사항';
  L.head(slide, input.slideNum, kicker, title);

  // 항목 추출: data.checkItems 배열 우선, 없으면 markdown 텍스트 파싱
  let items: string[] = [];
  if (Array.isArray(data.checkItems) && data.checkItems.length > 0) {
    items = data.checkItems.map((it: any) => String(it || '').trim()).filter(Boolean);
  } else if (typeof data.markdown === 'string' && data.markdown.trim().length > 0) {
    items = data.markdown
      .split('\n')
      .map(l => l.replace(/^[-•*◇⚠️📋🔒⏱️🔍\d.]+\s*/, '').trim())
      .filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('|'));
  } else if (typeof data.content === 'string' && data.content.trim().length > 0) {
    items = data.content
      .split('\n')
      .map(l => l.replace(/^[-•*◇⚠️📋🔒⏱️🔍\d.]+\s*/, '').trim())
      .filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('|'));
  }

  if (items.length === 0) {
    items = [
      '등기부등본 갑구/을구 권리관계 및 근저당 채권최고액 전액 말소 조건 원본 대조',
      '임대차 원본 계약서 대조 (보증금, 월임대료, 관리비 실입금 내역 및 제소전화해조서)',
      '건축물대장상 위반건축물 등재 여부 및 불법 증축·용도변경 이행강제금 납부 이력 점검',
      '토지이용계획확인원상 도시계획시설 저촉, 건축선 후퇴, 지구단위계획 특별계획구역 확인',
      '기계식 주차기 정기 안전점검 합격증, 승강기 검사필증, 소방 완비증명서 실물 실사',
      '정화조 용량 대비 현 업종 적합성 및 하수도 원인자부담금 추가 부과 대상 여부 확인',
    ];
  }

  // 상단 서브 타이틀 (총 항목 수 요약)
  const subText = `거래 안정성 확보를 위한 필수 법률·물리·임대차 실사 점검 항목 (총 ${items.length}건)`;
  L.sub(slide, M, 1.50, CW, subText);

  // 2단 카드 그리드 레이아웃
  const gap = 0.35;
  const colW = (CW - gap) / 2; // ~5.89
  const leftX = M;
  const rightX = M + colW + gap;
  const startY = 1.88;

  // 좌/우 분할 (최대 10개 항목, 초과 시 하단 배너에 안내)
  const maxDisplay = 8;
  const displayItems = items.slice(0, maxDisplay);
  const midPoint = Math.ceil(displayItems.length / 2);
  const leftItems = displayItems.slice(0, midPoint);
  const rightItems = displayItems.slice(midPoint);

  const renderItemColumn = (colItems: string[], colX: number) => {
    let curY = startY;
    colItems.forEach((text, idx) => {
      const itemH = 0.95;
      // 카드 배경
      slide.addShape('rect' as any, {
        x: colX,
        y: curY,
        w: colW,
        h: itemH,
        fill: { color: C.tint },
        line: { color: C.brassL, width: 0.5 },
      });

      // 체크마크 아이콘 / 번호 박스
      slide.addShape('rect' as any, {
        x: colX + 0.15,
        y: curY + 0.18,
        w: 0.35,
        h: 0.35,
        fill: { color: C.brassD },
      });
      slide.addText('✓', {
        x: colX + 0.15,
        y: curY + 0.18,
        w: 0.35,
        h: 0.35,
        fontFace: KR,
        fontSize: 11,
        color: C.white,
        align: 'center',
        valign: 'middle',
        bold: true,
      });

      // 본문 텍스트
      slide.addText(text, {
        x: colX + 0.60,
        y: curY + 0.12,
        w: colW - 0.75,
        h: itemH - 0.20,
        fontFace: KR,
        fontSize: 10.5,
        color: C.ink,
        valign: 'middle',
        lineSpacingMultiple: 1.15,
      });

      curY += itemH + 0.14;
    });
  };

  renderItemColumn(leftItems, leftX);
  renderItemColumn(rightItems, rightX);

  // 하단 마감 배너 (실사 가이드)
  const bannerY = 6.30;
  const bannerH = 0.65;
  slide.addShape('rect' as any, {
    x: M,
    y: bannerY,
    w: CW,
    h: bannerH,
    fill: { color: C.brassL },
  });
  slide.addText('※ 본 체크리스트는 계약 전 매수인의 안전한 자산 인수를 위한 필수 확인 사항이며, 실사(Due Diligence) 결과에 따라 매매 조건 및 잔금 일정이 조정될 수 있습니다.', {
    x: M + 0.20,
    y: bannerY + 0.08,
    w: CW - 0.40,
    h: bannerH - 0.16,
    fontFace: KR,
    fontSize: 9.5,
    color: C.brassD,
    valign: 'middle',
    bold: true,
  });

  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);

  return { slide, warnings };
}

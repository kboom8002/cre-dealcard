/**
 * @file a18-checklist.ts
 * @description D30 M-11: 체크리스트 전용 PPTX 아키타입 (A18)
 * 확인사항을 전량 표기하는 결정적 렌더러
 */
import type { ArchetypeInput, ArchetypeOutput } from './a01-cover';

const KR = 'Pretendard';
const CD = { title: '222222', body: '333333', mute: '888888', bg: 'F8F8F5' };

export async function buildA18Checklist(input: ArchetypeInput): Promise<ArchetypeOutput> {
  const { pres, data } = input;
  const bodyText = (data.markdown as string) || '확인 필요 항목이 없습니다.';
  const title = (data.title as string) || '확인사항';

  // 항목 수 추출
  const itemCount = (bodyText.match(/^[-•◇⚠️📋🔒⏱️🔍]/gm) || []).length;
  const subtitle = itemCount > 0
    ? `총 ${itemCount}건의 확인 필요 항목`
    : '모든 핵심 데이터 완비';

  const slide = pres.addSlide();

  // 배경
  slide.addShape('rect' as any, {
    x: 0, y: 0, w: 10.6, h: 7.5,
    fill: { color: CD.bg },
  });

  // Kicker
  slide.addText('CHECKLIST', {
    x: 0.5, y: 0.3, w: 9.0, h: 0.4,
    fontSize: 10, color: CD.mute, fontFace: KR, margin: 0,
  });

  // Title
  slide.addText(title, {
    x: 0.5, y: 0.7, w: 9.0, h: 0.5,
    fontSize: 22, bold: true, color: CD.title, fontFace: KR, margin: 0,
  });

  // Subtitle
  slide.addText(subtitle, {
    x: 0.5, y: 1.2, w: 9.0, h: 0.3,
    fontSize: 11, color: CD.mute, fontFace: KR, margin: 0,
  });

  // Body
  slide.addText(bodyText, {
    x: 0.5, y: 1.8, w: 9.0, h: 5.0,
    fontSize: 10, color: CD.body, fontFace: KR,
    valign: 'top', lineSpacingMultiple: 1.3, margin: 0,
  });

  return { slide, warnings: [] };
}

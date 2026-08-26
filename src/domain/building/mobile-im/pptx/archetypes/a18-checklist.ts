/**
 * @file a18-checklist.ts
 * @description D30 M-11: 체크리스트 전용 PPTX 아키타입 (A18)
 * A11(RoomSpec) + A12(Ownership)의 체크리스트 관련 기능을 통합
 * 결손 항목, 게이트 경고, AI 가정값, 잠긴 지표를 전량 표기
 */
import type { ArchetypeInput, ArchetypeOutput } from './a01-cover';

/**
 * D30 M-11: 체크리스트 전용 슬라이드 빌더
 * 확인사항을 전량 표기하는 결정적 렌더러
 */
export async function buildA18Checklist(input: ArchetypeInput): Promise<ArchetypeOutput> {
  const { content } = input;
  const bodyText = content || '확인 필요 항목이 없습니다.';

  // 체크리스트 항목 수 추출
  const itemCount = (bodyText.match(/^[-•◇⚠️📋🔒⏱️🔍]/gm) || []).length;
  const subtitle = itemCount > 0
    ? `총 ${itemCount}건의 확인 필요 항목`
    : '모든 핵심 데이터 완비';

  return {
    slides: [{
      layout: 'BLANK',
      elements: [
        {
          type: 'text',
          text: 'CHECKLIST',
          options: {
            x: 0.5, y: 0.3, w: 9.0, h: 0.4,
            fontSize: 10, color: '888888',
            fontFace: 'Pretendard',
          },
        },
        {
          type: 'text',
          text: '확인사항 및 실사 점검 체크리스트',
          options: {
            x: 0.5, y: 0.7, w: 9.0, h: 0.5,
            fontSize: 22, bold: true, color: '222222',
            fontFace: 'Pretendard',
          },
        },
        {
          type: 'text',
          text: subtitle,
          options: {
            x: 0.5, y: 1.2, w: 9.0, h: 0.3,
            fontSize: 11, color: '666666',
            fontFace: 'Pretendard',
          },
        },
        {
          type: 'text',
          text: bodyText,
          options: {
            x: 0.5, y: 1.8, w: 9.0, h: 5.0,
            fontSize: 10, color: '333333',
            fontFace: 'Pretendard',
            valign: 'top',
            lineSpacingMultiple: 1.3,
          },
        },
      ],
    }],
  };
}

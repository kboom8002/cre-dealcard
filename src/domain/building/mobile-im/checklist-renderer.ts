/**
 * @file checklist-renderer.ts
 * @description 확인사항(Checklist) 섹션 렌더러 (IM_SYSTEM_SSOT.md 불변조건 9, 13, 18, S3-7)
 * 데이터 결손(Deficiency), 게이트 경고, AI 가정값, 잠긴 지표를 누락 없이 전량 표기
 * 불변조건 9: 확인사항 칸은 공개 단계에서도 마스킹하지 않는다
 * 불변조건 13: 결손은 사라지지 않고 확인사항으로 이동한다
 */

import type { Deficiency } from '@/types/im-core';

export interface ChecklistItem {
  category: 'missing_data' | 'gate_warning' | 'assumption' | 'locked_metric';
  text: string;
  severity?: 'block' | 'degrade' | 'note' | 'warn';
  slot?: string;
  gateCode?: string;
}

export interface ChecklistSection {
  section_type: 'checklist';
  title: string;
  items: ChecklistItem[];
  masking: false;       // 불변조건 9 강제
  truncation: 'never';  // 전량 표기 강제
  markdown: string;
}

export interface ChecklistRenderInput {
  deficiencies?: Deficiency[];
  gateWarnings?: Array<{ id: string; label: string }>;
  assumptions?: Array<{ slot: string; label: string; value?: unknown }>;
  lockedMetrics?: Array<{ metric: string; missingSlots: string[] }>;
}

export function renderChecklist(input: ChecklistRenderInput): ChecklistSection {
  const items: ChecklistItem[] = [];

  // 1. 결손 항목 (Deficiency[])
  if (input.deficiencies) {
    for (const def of input.deficiencies) {
      items.push({
        category: 'missing_data',
        text: `${def.label || def.field}: 공부·원장 확인 필요 (${def.affects ? `${def.affects} 산출 보류` : '데이터 미비'})`,
        severity: def.severity,
        slot: def.field,
      });
    }
  }

  // 2. 게이트 경고 (warn 상태)
  if (input.gateWarnings) {
    for (const gate of input.gateWarnings) {
      items.push({
        category: 'gate_warning',
        text: `[${gate.id}] ${gate.label}`,
        severity: 'warn',
        gateCode: gate.id,
      });
    }
  }

  // 3. AI 추정 및 가정값
  if (input.assumptions) {
    for (const asm of input.assumptions) {
      items.push({
        category: 'assumption',
        text: `${asm.label}: ◇ AI추정·가정 적용`,
        slot: asm.slot,
      });
    }
  }

  // 4. 잠긴 지표
  if (input.lockedMetrics) {
    for (const locked of input.lockedMetrics) {
      items.push({
        category: 'locked_metric',
        text: `🔒 ${locked.metric}: 필수 슬롯 [${locked.missingSlots.join(', ')}] 미입력으로 산출 잠금`,
      });
    }
  }

  // 마크다운 생성
  const mdLines: string[] = [
    `## 확인사항 및 실사 점검 체크리스트`,
    `> ⚠️ **공개 및 검토 고지**: 본 항목은 매수 검토 및 본계약 체결 전 현장 실사 및 원본 공부 대조를 통해 최종 확인해야 할 항목입니다.`,
    ``,
  ];

  if (items.length === 0) {
    mdLines.push(`- 현재 식별된 결손 또는 확인 필요 항목이 없습니다. (주요 핵심 데이터 완비)`);
  } else {
    // 카테고리별 그룹화 렌더링
    const missingGroup = items.filter(i => i.category === 'missing_data');
    const warningGroup = items.filter(i => i.category === 'gate_warning');
    const assumptionGroup = items.filter(i => i.category === 'assumption');
    const lockedGroup = items.filter(i => i.category === 'locked_metric');

    if (missingGroup.length > 0) {
      mdLines.push(`### 1. 공부 및 원장 확인 필요 항목 (${missingGroup.length}건)`);
      missingGroup.forEach(i => mdLines.push(`- 📋 **${i.text}**`));
      mdLines.push(``);
    }

    if (warningGroup.length > 0) {
      mdLines.push(`### 2. 품질 및 규제 유의사항 (${warningGroup.length}건)`);
      warningGroup.forEach(i => mdLines.push(`- ⚠️ **${i.text}**`));
      mdLines.push(``);
    }

    if (assumptionGroup.length > 0) {
      mdLines.push(`### 3. 시장 기본값 및 AI 가정 항목 (${assumptionGroup.length}건)`);
      assumptionGroup.forEach(i => mdLines.push(`- ◇ **${i.text}**`));
      mdLines.push(``);
    }

    if (lockedGroup.length > 0) {
      mdLines.push(`### 4. 미입력 잠금 지표 (${lockedGroup.length}건)`);
      lockedGroup.forEach(i => mdLines.push(`- ${i.text}`));
      mdLines.push(``);
    }
  }

  return {
    section_type: 'checklist',
    title: '확인사항',
    items,
    masking: false,
    truncation: 'never',
    markdown: mdLines.join('\n'),
  };
}

/**
 * @file title-rights-renderer.ts
 * @description F-1: 등기부 권리관계 요약 섹션 렌더러 (결정론, LLM 미사용)
 */

export interface TitleRightsInput {
  owners: Array<{ name: string; shareRatio: number }>;
  encumbrances: Array<{
    type: '근저당권' | '전세권' | '가압류' | '가처분' | '지상권' | '임차권' | string;
    creditor: string;
    amountKrw?: number;
    registeredDate?: string;
  }>;
  restrictions: string[];  // 제한물권·특약사항
}

export interface SectionOutput {
  section_type: string;
  title: string;
  markdown: string;
  confidence: 'deterministic';
  provenance: string[];
}

export function renderTitleRights(input: TitleRightsInput): SectionOutput {
  const lines: string[] = ['## 권리관계 요약'];
  
  // 소유자
  lines.push('');
  lines.push('### 소유 현황');
  if (input.owners.length === 0) {
    lines.push('> 소유자 정보가 등록되지 않았습니다.');
  } else if (input.owners.length === 1) {
    lines.push(`- 단독 소유: ${input.owners[0].name}`);
  } else {
    lines.push(`- 공동 소유 (${input.owners.length}인)`);
    for (const o of input.owners) {
      lines.push(`  - ${o.name}: 지분 ${(o.shareRatio * 100).toFixed(1)}%`);
    }
  }
  
  // 담보·제한물권
  lines.push('');
  lines.push('### 설정 권리');
  if (input.encumbrances.length === 0) {
    lines.push('- 설정 권리 없음 ✅');
  } else {
    const totalDebt = input.encumbrances
      .filter(e => e.amountKrw)
      .reduce((s, e) => s + (e.amountKrw ?? 0), 0);
    lines.push(`| 유형 | 채권자 | 채권최고액 | 설정일 |`);
    lines.push(`|------|--------|-----------|--------|`);
    for (const e of input.encumbrances) {
      const amount = e.amountKrw ? `${(e.amountKrw / 100_000_000).toFixed(1)}억` : '-';
      lines.push(`| ${e.type} | ${e.creditor} | ${amount} | ${e.registeredDate ?? '-'} |`);
    }
    if (totalDebt > 0) {
      lines.push(``);
      lines.push(`> **채권최고액 합계: ${(totalDebt / 100_000_000).toFixed(1)}억 원**`);
    }
  }
  
  // 제한사항
  if (input.restrictions.length > 0) {
    lines.push('');
    lines.push('### 특기사항');
    for (const r of input.restrictions) {
      lines.push(`- ⚠️ ${r}`);
    }
  }
  
  return {
    section_type: 'title_rights',
    title: '권리관계 요약',
    markdown: lines.join('\n'),
    confidence: 'deterministic',
    provenance: ['registry'],
  };
}

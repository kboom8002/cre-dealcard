/**
 * @file gate-message-resolver.ts
 * @description F-6: 재생성 시 해소된 게이트 경고 문구를 섹션 마크다운에서 자동 제거
 */

export interface GateResult {
  id: string;
  passed: boolean;
  severity: 'block' | 'warn';
  message: string;
}

/** 해소된 게이트 메시지 토큰을 마크다운에서 제거 */
function removeGateTokens(markdown: string, resolvedIds: string[]): string {
  let result = markdown;
  for (const id of resolvedIds) {
    // 패턴: <!-- gate:{id} --> ... <!-- /gate:{id} -->
    const pattern = new RegExp(
      `<!-- gate:${id} -->.*?<!-- /gate:${id} -->\\s*`,
      'gs'
    );
    result = result.replace(pattern, '');
    
    // 패턴: > ⚠️ [{id}] ...
    const warnPattern = new RegExp(`^>\\s*⚠️\\s*\\[${id}\\].*$\\n?`, 'gm');
    result = result.replace(warnPattern, '');
  }
  return result.replace(/\n{3,}/g, '\n\n'); // 연속 빈줄 정리
}

/**
 * 이전 게이트 결과와 현재 결과를 비교하여,
 * 해소된 경고의 문구를 섹션 마크다운에서 자동 제거합니다.
 */
export function removeResolvedMessages(
  previousResults: GateResult[],
  currentResults: GateResult[],
  sections: Array<{ section_type: string; markdown: string }>,
): Array<{ section_type: string; markdown: string }> {
  // 이전에 실패했으나 현재 통과한 게이트 ID 수집
  const resolved = previousResults
    .filter(prev => !prev.passed && prev.severity === 'warn')
    .filter(prev => {
      const current = currentResults.find(c => c.id === prev.id);
      return current?.passed;
    })
    .map(g => g.id);
  
  if (resolved.length === 0) return sections;
  
  return sections.map(sec => ({
    ...sec,
    markdown: removeGateTokens(sec.markdown, resolved),
  }));
}

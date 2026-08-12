export function getPrompt(sectionType: string, version: string = 'v1'): string {
  // 간단한 버저닝 구현
  if (version === 'v2') {
    return `[v2] System prompt for ${sectionType}`;
  }
  return `[v1] System prompt for ${sectionType}`;
}

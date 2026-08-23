/**
 * persona-sanitizer.ts — 골든 IM 및 대외 노출 문서 페르소나 격리 정제기
 * Spec: .agents/AGENTS.md (CRE IM Quality Rules §1. 페르소나 격리 원칙)
 * 
 * 외부 노출 문서(Mobile IM, PPTX, Golden IM)에서 특정 연령/계층 직접 표기 문구를 원천 제거합니다.
 */

export function sanitizePersonaInGoldenIM(text: string): string {
  if (!text) return '';
  return text
    .replace(/(?:60대|50대|40대|30대|20대|초보|고액|개인|VIP)?\s*(?:자산가|투자자|법인\s*대표|법인|대표|고객|매수자|디벨로퍼)\s*(?:를\s*위한|의\s*관점|에게\s*추천하는|용|맞춤형?|전용|맞춤)?\s*/gu, '')
    .replace(/★+/g, '')
    .trim();
}

/**
 * @module LegalCopy
 * @description CREDEAL v3 Legal Copy Pack.
 * Provides standardized legal disclaimers, NDA text, and compliance notices.
 * @see SDD §5 S0-T11, §8 S3-T17
 * @see docs/credal_v3/legal/copy-pack.md
 */

/** Available legal copy types */
export type LegalCopyType =
  | 'ai_disclaimer'      // AI 생성 정보 면책
  | 'investment_warning'  // 투자 경고
  | 'nda_full'           // NDA 전문
  | 'nda_summary'        // NDA 요약
  | 'basic_im_notice'    // Basic IM 열람 고지
  | 'pro_im_notice'      // Pro IM 열람 고지
  | 'broker_compliance'  // 공인중개사법 준수
  | 'data_source_notice' // 데이터 출처 고지
  | 'boundary_note';     // 예비 검토용 자료 고지

const LEGAL_COPIES: Record<LegalCopyType, { ko: string; en?: string }> = {
  ai_disclaimer: {
    ko: '⚠️ 본 문서의 일부 내용은 AI가 자동 생성한 정보를 포함하고 있으며, 투자 조언이 아닙니다. 실제 투자 의사결정 시 독립적인 전문가 검토를 반드시 받으시기 바랍니다.',
    en: '⚠️ This document contains AI-generated information and does not constitute investment advice. Please seek independent professional review before making investment decisions.',
  },
  investment_warning: {
    ko: '본 자료는 정보 제공 목적으로만 작성되었으며, 특정 부동산의 매수 또는 매도를 권유하지 않습니다. 부동산 투자는 원금 손실의 위험이 있으며, 과거 수익률이 미래 수익을 보장하지 않습니다.',
  },
  nda_full: {
    ko: '기밀유지동의서(NDA)\n\n본 투자설명서(IM)에 포함된 모든 정보는 기밀 정보로서, 열람자는 다음 사항에 동의합니다:\n1. 본 문서의 내용을 제3자에게 공유, 복제, 전달할 수 없습니다.\n2. 열람 후 24시간 동안 접근 가능하며, 이후 자동 만료됩니다.\n3. 모든 열람 행위는 동적 워터마크로 추적됩니다.\n4. 본 정보는 투자 판단 참고 목적으로만 사용해야 합니다.\n5. 본 동의를 위반할 경우 법적 책임이 따를 수 있습니다.',
  },
  nda_summary: {
    ko: '🔒 본 문서는 기밀유지동의(NDA)에 따라 보호됩니다. 제3자 공유 금지 · 24시간 열람 제한 · 워터마크 추적 중.',
  },
  basic_im_notice: {
    ko: '본 모바일 투자설명서(IM)는 보안을 위해 자산의 핵심 개요를 블라인드 형태로 제공합니다. 상세 지번 및 임대차 계약 원본은 담당 중개사를 통해 확인하실 수 있습니다.',
  },
  pro_im_notice: {
    ko: '본 상세 투자설명서(IM)는 보안 서약 또는 상담을 완료한 열람자에게 제공됩니다. 정확한 주소 및 임대차 상세 명세가 포함되어 있습니다.',
  },
  broker_compliance: {
    ko: '본 서비스는 공인중개사법에 따라 운영되며, 중개대상물의 표시·광고에 관한 규정을 준수합니다. AI가 생성한 정보는 중개보조원의 역할을 대체하지 않으며, 최종 중개 행위는 공인중개사가 직접 수행합니다.',
  },
  data_source_notice: {
    ko: '본 문서의 데이터는 다음 출처에서 수집되었습니다: 건축물대장(국토교통부), 토지이용계획(토지이음), 개별공시지가(국토교통부), 실거래가(국토교통부). 일부 데이터는 중개인이 직접 입력한 정보이며, 정확성을 보장하지 않습니다.',
  },
  boundary_note: {
    ko: '예비 검토용 자료이며 현장 확인이 필요합니다. 본 자료의 수치와 분석은 참고용이며, 실제 거래 시 별도의 실사가 반드시 필요합니다.',
  },
};

/**
 * Returns the legal copy text for a given type.
 * @param type - The type of legal copy to retrieve
 * @param lang - Language ('ko' or 'en'), defaults to 'ko'
 * @returns The legal copy text
 */
export function getLegalCopy(type: LegalCopyType, lang: 'ko' | 'en' = 'ko'): string {
  const copy = LEGAL_COPIES[type];
  if (!copy) return '';
  return (lang === 'en' && copy.en) ? copy.en : copy.ko;
}

/**
 * Returns multiple legal copies concatenated with separator.
 */
export function getLegalCopies(types: LegalCopyType[], separator: string = '\n\n'): string {
  return types.map(t => getLegalCopy(t)).filter(Boolean).join(separator);
}

/**
 * Returns the appropriate disclaimer set for an IM tier.
 */
export function getIMDisclaimers(tier: 'teaser' | 'basic' | 'pro'): string {
  switch (tier) {
    case 'teaser':
      return getLegalCopies(['ai_disclaimer', 'investment_warning', 'boundary_note']);
    case 'basic':
      return getLegalCopies(['ai_disclaimer', 'investment_warning', 'basic_im_notice', 'data_source_notice', 'boundary_note']);
    case 'pro':
      return getLegalCopies(['ai_disclaimer', 'investment_warning', 'pro_im_notice', 'nda_summary', 'data_source_notice', 'broker_compliance']);
  }
}

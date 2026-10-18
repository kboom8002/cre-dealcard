/**
 * @file header-footer.ts
 * @description PPTX Basic IM Studio — 슬라이드 헤더 & 푸터 / 브랜딩 설정 계약
 */

export interface HeaderFooterConfig {
  /** 중개법인 / 소속 명칭 (표지·헤더·마감면 반영) */
  companyName: string;
  /** 서브 태그라인 (표지 우측 패널 및 하단 표시) */
  companyTagline: string;
  /** 로고 이미지 URL (Supabase Storage 또는 Data URL) */
  logoUrl?: string;
  /** 각 슬라이드 하단 면책 문구 */
  footerDisclaimer: string;
  /** 페이지 번호 표시 여부 */
  showPageNumbers: boolean;
  /** 페이지 번호 표기 형식 */
  pageNumberFormat: '01' | '1/N' | 'P.1';
  /** 우상단 대외비/기밀 표시 배지 */
  confidentialityBadge: string;
}

export const DEFAULT_HEADER_FOOTER: HeaderFooterConfig = {
  companyName: 'CRE DEAL 파트너스 중개법인',
  companyTagline: 'Commercial Real Estate Advisory',
  footerDisclaimer: '본 자료는 매수 검토 참고용이며 법적 효력이 없습니다.',
  showPageNumbers: true,
  pageNumberFormat: '01',
  confidentialityBadge: 'CONFIDENTIAL',
};

export function formatSlidePageNumber(
  slideNum: number,
  totalSlides: number,
  format: HeaderFooterConfig['pageNumberFormat'] = '01'
): string {
  switch (format) {
    case '1/N':
      return `${slideNum} / ${Math.max(slideNum, totalSlides)}`;
    case 'P.1':
      return `P.${slideNum}`;
    case '01':
    default:
      return String(slideNum).padStart(2, '0');
  }
}

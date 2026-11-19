/**
 * src/config/company-legal.ts
 *
 * 크리딜 (CREDEAL) 운영 주체·개인정보보호책임자·처리위탁 및 국외이전(PIPA 제26조·제28조의8) 법정 고지 메타데이터 SSOT.
 *
 * [USER ACTION REQUIRED / 정식 상용 오픈 전 사용자 조치 안내]
 * 아래 환경변수를 `.env.local` 및 Vercel Production 환경변수에 실제 등기/사업자 정보로 설정하면
 * 이용약관(/terms), 개인정보처리방침(/privacy), 공통 푸터에 코드 수정 없이 자동 반영됩니다:
 *  - NEXT_PUBLIC_COMPANY_NAME        : 상호/법인명 (예: 주식회사 크리딜)
 *  - NEXT_PUBLIC_COMPANY_CEO         : 대표자 성명
 *  - NEXT_PUBLIC_COMPANY_BIZ_NO      : 사업자등록번호 (예: 123-45-67890)
 *  - NEXT_PUBLIC_COMPANY_ADDRESS     : 사업장 소재지 주소
 *  - NEXT_PUBLIC_PRIVACY_OFFICER_NAME: 개인정보보호책임자(CPO) 성명/직책
 *  - NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL: 개인정보 보호 문의 이메일
 *  - NEXT_PUBLIC_SUPPORT_EMAIL       : 고객지원 이메일
 */

export interface LegalSubProcessor {
  id: 'supabase' | 'vercel' | 'openai' | 'resend' | 'solapi';
  name: string;
  purpose: string;
  region: string;
  isCrossBorder: boolean;
  transferMethod: string;
  retentionPeriod: string;
  active?: boolean;
  statusNote?: string;
}

export const SUB_PROCESSORS: readonly LegalSubProcessor[] = [
  {
    id: 'supabase',
    name: 'Supabase Inc.',
    purpose: '클라우드 DB·인증·파일 스토리지 운영',
    region: 'AWS ap-northeast-2 서울 리전 중심 (인증·관리 인프라 미국 포함)',
    isCrossBorder: true,
    transferMethod: '서비스 이용 시 TLS 암호화 네트워크 전송',
    retentionPeriod: '회원 탈퇴 또는 위탁 계약 종료 시까지',
    active: true,
  },
  {
    id: 'vercel',
    name: 'Vercel Inc.',
    purpose: '웹 애플리케이션 호스팅 및 엣지 전송',
    region: '미국·글로벌',
    isCrossBorder: true,
    transferMethod: '웹 접속 및 요청 처리 시 TLS 암호화 전송',
    retentionPeriod: '서비스 제공 및 보안 접속 로그 보관 기간 종료 시까지',
    active: true,
  },
  {
    id: 'openai',
    name: 'OpenAI, L.L.C.',
    purpose: '부동산 메모·브리핑 초안 AI 생성 처리 (API 전송 데이터 모델 학습 미사용)',
    region: '미국',
    isCrossBorder: true,
    transferMethod: '초안 생성 요청 시 HTTPS API 암호화 전송',
    retentionPeriod: 'API 응답 처리 및 오남용 방지 모니터링 기간 경과 후 자동 파기',
    active: true,
  },
  {
    id: 'resend',
    name: 'Resend, Inc.',
    purpose: '매물 안내·뉴스레터·비밀번호 재설정 이메일 발송',
    region: '미국',
    isCrossBorder: true,
    transferMethod: '이메일 발송 시점 HTTPS API 및 TLS 전송',
    retentionPeriod: '발송 이력 보관 기간 또는 위탁 계약 종료 시까지',
    active: true,
  },
  {
    id: 'solapi',
    name: '(주)솔라피 (Solapi)',
    purpose: '카카오 알림톡 및 문자메시지 발송 연동 (현재 D4 채널 정책에 따라 실발송 보류 · 연동 예정)',
    region: '대한민국',
    isCrossBorder: false,
    transferMethod: '암호화 API 전송 (현재 실발송 미사용 · 연동 활성화 시 적용)',
    retentionPeriod: '발송 이력 보관 기간 또는 위탁 계약 종료 시까지',
    active: false,
    statusNote: '예정(비활성 · D4 정책에 따라 이메일 발송만 운영 중)',
  },
] as const;

export const PRODUCTION_LEGAL_ENV_KEYS = [
  'NEXT_PUBLIC_COMPANY_NAME',
  'NEXT_PUBLIC_COMPANY_CEO',
  'NEXT_PUBLIC_COMPANY_BIZ_NO',
  'NEXT_PUBLIC_COMPANY_ADDRESS',
  'NEXT_PUBLIC_PRIVACY_OFFICER_NAME',
  'NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL',
  'NEXT_PUBLIC_SUPPORT_EMAIL',
] as const;

function stripOuterQuotes(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
}

export function getMissingProductionLegalEnvKeys(): string[] {
  return PRODUCTION_LEGAL_ENV_KEYS.filter(
    (key) => stripOuterQuotes(process.env[key]).length === 0,
  );
}

function readEnvOrDefault(raw: string | undefined, fallback: string): string {
  const trimmed = stripOuterQuotes(raw);
  return trimmed.length > 0 ? trimmed : fallback;
}

export const COMPANY_LEGAL_CONFIG = {
  serviceName: '크리딜 (CREDEAL)',
  domain: 'credeal.net',
  get companyName(): string {
    return readEnvOrDefault(process.env.NEXT_PUBLIC_COMPANY_NAME, '크리딜(CREDEAL) 운영팀');
  },
  get representativeName(): string {
    return readEnvOrDefault(process.env.NEXT_PUBLIC_COMPANY_CEO, '대표자 별도 고지');
  },
  get businessRegNumber(): string {
    return stripOuterQuotes(process.env.NEXT_PUBLIC_COMPANY_BIZ_NO);
  },
  get address(): string {
    return readEnvOrDefault(
      process.env.NEXT_PUBLIC_COMPANY_ADDRESS,
      '서울특별시 (상세 주소 고객센터 문의)',
    );
  },
  get privacyOfficerName(): string {
    return readEnvOrDefault(process.env.NEXT_PUBLIC_PRIVACY_OFFICER_NAME, '개인정보보호책임자');
  },
  get privacyContactEmail(): string {
    return readEnvOrDefault(process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL, 'privacy@credeal.kr');
  },
  get supportEmail(): string {
    return readEnvOrDefault(process.env.NEXT_PUBLIC_SUPPORT_EMAIL, 'support@credeal.kr');
  },
  effectiveDate: '2026년 11월 15일',
  consentVersion: 'v2.0',
  processors: SUB_PROCESSORS,
} as const;

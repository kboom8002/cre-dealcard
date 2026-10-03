/**
 * Broker Contact SSoT Resolver
 *
 * Basic IM(PPTX)·모바일 IM 뷰어가 공통으로 사용하는 담당 중개인 연락처 조회기.
 *
 * 원칙 (Rule 34 Mock 누출 금지 / Rule 37 회피 문구 금지):
 *  - 실제 DB 값만 반환한다. 값이 없으면 null — 더미/플레이스홀더/가공 상호를 만들지 않는다.
 *  - 렌더러는 null 필드를 생략(행 자체 미표시)한다.
 *
 * 소스 (브로커 프로필 설정 화면 /broker/profile 에서 편집):
 *  - profiles.display_name / phone / company
 *  - broker_profiles.name (display_name 부재 시) / office_reg_number / license_number / contact_email
 *  - contact_email 부재 시 auth.users.email (migration 00062 설계: "NULL이면 auth.users.email 사용")
 */

export interface BrokerContact {
  userId: string;
  displayName: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  /** 중개사무소 등록번호 (broker_profiles.office_reg_number) */
  officeRegNumber: string | null;
  /** 공인중개사 자격번호 (broker_profiles.license_number) */
  licenseNumber: string | null;
  specialty: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

const clean = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};

export interface FetchBrokerContactOptions {
  /** contact_email 부재 시 auth.users.email 로 폴백 (기본 true, migration 00062 설계) */
  authEmailFallback?: boolean;
}

export async function fetchBrokerContact(
  supabase: SupabaseLike,
  userId: string | null | undefined,
  options: FetchBrokerContactOptions = {},
): Promise<BrokerContact | null> {
  if (!userId) return null;
  const { authEmailFallback = true } = options;

  const [profileRes, brokerRes] = await Promise.all([
    supabase.from('profiles').select('display_name, company, phone').eq('id', userId).maybeSingle(),
    supabase
      .from('broker_profiles')
      .select('name, office_reg_number, license_number, contact_email, deal_specialty')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  const profile = profileRes?.data ?? null;
  const bp = brokerRes?.data ?? null;
  if (!profile && !bp) return null;

  let email = clean(bp?.contact_email);
  if (!email && authEmailFallback) {
    try {
      const { data } = await supabase.auth.admin.getUserById(userId);
      email = clean(data?.user?.email);
    } catch {
      email = null;
    }
  }

  const specialtyRaw = bp?.deal_specialty;
  const specialty = Array.isArray(specialtyRaw)
    ? clean(specialtyRaw.filter((s: unknown) => typeof s === 'string').join(', '))
    : clean(specialtyRaw);

  return {
    userId,
    displayName: clean(profile?.display_name) ?? clean(bp?.name),
    company: clean(profile?.company),
    phone: clean(profile?.phone),
    email,
    officeRegNumber: clean(bp?.office_reg_number),
    licenseNumber: clean(bp?.license_number),
    specialty,
  };
}

/** MobileImPptxRenderer `input.broker` 형태로 변환 (null → undefined, 플레이스홀더 없음) */
export function toPptxBrokerInput(c: BrokerContact | null) {
  if (!c) return undefined;
  return {
    display_name: c.displayName ?? undefined,
    company_name: c.company ?? undefined,
    phone: c.phone ?? undefined,
    email: c.email ?? undefined,
    registration_no: c.officeRegNumber ?? undefined,
    specialty: c.specialty ?? undefined,
  };
}

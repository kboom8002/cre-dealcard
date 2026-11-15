/**
 * @module legal/broker-statutory-disclosure
 * @description 공인중개사법 제18조의2 및 시행령 제17조의2에 따른 인터넷 중개대상물 5대 법정 표시의무 검증·정제·렌더링 SSOT.
 *
 * 5대 법정 표시 항목:
 *   1. 중개사무소 명칭 (company / officeName)
 *   2. 중개사무소 소재지 (office_address / officeAddress)
 *   3. 연락처(전화번호) (phone)
 *   4. 중개사무소 등록번호 (office_reg_number / registrationNo)
 *   5. 개업공인중개사(대표자) 성명 (representative_name || display_name)
 */

export const SAMPLE_REGISTRATION_NUMBERS = [
  '11680-2024-00123',
  '11680-2024-00001',
  '11680-2023-00000',
  '00000-0000-00000',
] as const;

export const SAMPLE_BROKER_NAMES = [
  '홍길동',
  '김대표',
  '담당 중개인',
  '담당 공인중개사',
] as const;

export const BROKER_VIEWER_PLACEHOLDERS: ReadonlySet<string> = new Set<string>([
  '',
  '-',
  '—',
  '미등록',
  '확인 필요',
  '문의 시 안내',
  '담당 중개사',
  '담당 공인중개사',
  '담당 중개인',
  '담당 중개법인 (확인 중)',
  '담당 중개법인',
  '전담 중개법인',
  '전담 중개사무소',
  '검증 공인중개사',
  '김대표',
  '홍길동',
  '홍길동 대표공인중개사',
  '홍길동 대표중개사',
  '11680-2024-00123',
  '11680-2024-00001',
  '11680-2023-00000',
  '00000-0000-00000',
  '02-1234-5678',
  '010-0000-0000',
]);

export type StatutoryFieldKey =
  | 'company'
  | 'office_address'
  | 'phone'
  | 'office_reg_number'
  | 'representative_name';

export interface BrokerStatutoryInput {
  company?: string | null;
  officeName?: string | null;
  office_name?: string | null;
  office_address?: string | null;
  officeAddress?: string | null;
  phone?: string | null;
  office_reg_number?: string | null;
  officeRegNumber?: string | null;
  registration_no?: string | null;
  registrationNo?: string | null;
  license_number?: string | null;
  licenseNumber?: string | null;
  representative_name?: string | null;
  representativeName?: string | null;
  display_name?: string | null;
  displayName?: string | null;
}

export interface StatutoryCompletenessItem {
  key: StatutoryFieldKey;
  label: string;
  filled: boolean;
  value: string | null;
}

export interface BrokerStatutoryCompleteness {
  isComplete: boolean;
  missingFields: StatutoryFieldKey[];
  missingLabels: string[];
  filledCount: number;
  totalCount: 5;
  items: StatutoryCompletenessItem[];
}

export type BrokerStatutoryValidationResult =
  | {
      ok: true;
      completeness: BrokerStatutoryCompleteness;
    }
  | {
      ok: false;
      field: string;
      message: string;
      completeness: BrokerStatutoryCompleteness;
    };

export interface SanitizedStatutoryDisclosure {
  officeName: string | null;
  representativeName: string | null;
  officeRegNumber: string | null;
  officeAddress: string | null;
  phone: string | null;
  items: Array<{
    key: StatutoryFieldKey;
    label: string;
    value: string;
  }>;
  hasAny: boolean;
}

const SAMPLE_REG_SERIAL_RE =
  /(?:^|-)00123$|(?:^|-)00001$|(?:^|-)00000$|^0{4,5}-0{4}-0{4,5}$/;

export function normalizeRegistrationNumber(raw: string): string {
  return raw
    .replace(/^제\s*/u, '')
    .replace(/\s*호$/u, '')
    .replace(/\s+/g, '')
    .trim();
}

export function isSampleRegistrationNumber(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const norm = normalizeRegistrationNumber(trimmed);
  if (!norm) return false;
  if ((SAMPLE_REGISTRATION_NUMBERS as readonly string[]).includes(norm)) return true;
  if (norm === '00123' || norm === '00001' || norm === '00000') return true;
  return SAMPLE_REG_SERIAL_RE.test(norm);
}

export function isSampleBrokerName(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const cleaned = raw.replace(/\s*\(확인\s*중\)/g, '').trim();
  if (!cleaned) return false;
  if ((SAMPLE_BROKER_NAMES as readonly string[]).includes(cleaned)) return true;
  const strippedRole = cleaned
    .replace(/\s*(?:대표공인중개사|개업공인중개사|대표중개사|공인중개사|중개사|대표)$/u, '')
    .trim();
  return Boolean(strippedRole && (SAMPLE_BROKER_NAMES as readonly string[]).includes(strippedRole));
}

export function sanitizeStatutoryField(
  raw: unknown,
  kind?: 'name' | 'regNo' | 'officeName' | 'address' | 'phone',
): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/\s*\(확인\s*중\)/g, '').trim();
  if (!cleaned || BROKER_VIEWER_PLACEHOLDERS.has(cleaned)) return null;

  if (kind === 'regNo') {
    if (isSampleRegistrationNumber(cleaned)) return null;
  } else if (kind === 'name') {
    if (isSampleBrokerName(cleaned)) return null;
  } else if (kind === 'phone') {
    if (cleaned.includes('@') || cleaned.replace(/\D/g, '').length < 7) return null;
  } else if (kind === 'address') {
    if (/^(?:미등록|확인\s*필요|추후\s*안내|비공개)$/u.test(cleaned)) return null;
    if (/예시\s*주소|샘플\s*주소|000-00/.test(cleaned)) return null;
  }

  return cleaned;
}

function firstDefinedString(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  for (const c of candidates) {
    if (typeof c === 'string') return c;
  }
  return undefined;
}

function pickSanitized(
  kind: 'name' | 'regNo' | 'officeName' | 'address' | 'phone',
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const c of candidates) {
    const clean = sanitizeStatutoryField(c, kind);
    if (clean) return clean;
  }
  return null;
}

export function computeBrokerStatutoryCompleteness(
  input: BrokerStatutoryInput,
): BrokerStatutoryCompleteness {
  const companyVal = pickSanitized(
    'officeName',
    input.company,
    input.officeName,
    input.office_name,
  );
  const addressVal = pickSanitized(
    'address',
    input.office_address,
    input.officeAddress,
  );
  const phoneVal = pickSanitized('phone', input.phone);
  const regVal = pickSanitized(
    'regNo',
    input.office_reg_number,
    input.officeRegNumber,
    input.registration_no,
    input.registrationNo,
  );
  const repVal = pickSanitized(
    'name',
    input.representative_name,
    input.representativeName,
    input.display_name,
    input.displayName,
  );

  const items: StatutoryCompletenessItem[] = [
    {
      key: 'company',
      label: '중개사무소 명칭',
      filled: Boolean(companyVal),
      value: companyVal,
    },
    {
      key: 'office_address',
      label: '중개사무소 소재지',
      filled: Boolean(addressVal),
      value: addressVal,
    },
    {
      key: 'phone',
      label: '연락처(전화번호)',
      filled: Boolean(phoneVal),
      value: phoneVal,
    },
    {
      key: 'office_reg_number',
      label: '중개사무소 등록번호',
      filled: Boolean(regVal),
      value: regVal,
    },
    {
      key: 'representative_name',
      label: '개업공인중개사(대표자) 성명',
      filled: Boolean(repVal),
      value: repVal,
    },
  ];

  const missingItems = items.filter((item) => !item.filled);
  const filledCount = items.length - missingItems.length;

  return {
    isComplete: missingItems.length === 0,
    missingFields: missingItems.map((item) => item.key),
    missingLabels: missingItems.map((item) => item.label),
    filledCount,
    totalCount: 5,
    items,
  };
}

export function validateBrokerStatutoryFields(
  input: BrokerStatutoryInput,
): BrokerStatutoryValidationResult {
  const completeness = computeBrokerStatutoryCompleteness(input);

  const rawReg = firstDefinedString(
    input.office_reg_number,
    input.officeRegNumber,
    input.registration_no,
    input.registrationNo,
  );
  if (rawReg && rawReg.trim().length > 0 && isSampleRegistrationNumber(rawReg)) {
    return {
      ok: false,
      field: 'office_reg_number',
      message:
        '샘플 개설등록번호(예: 11680-2024-00123 등)는 저장할 수 없습니다. 중개사무소 개설등록증에 기재된 실제 등록번호를 입력해 주세요.',
      completeness,
    };
  }

  const rawLicense = firstDefinedString(input.license_number, input.licenseNumber);
  if (rawLicense && rawLicense.trim().length > 0 && isSampleRegistrationNumber(rawLicense)) {
    return {
      ok: false,
      field: 'license_number',
      message:
        '샘플 자격증 번호는 저장할 수 없습니다. 공인중개사 자격증에 기재된 실제 번호를 입력해 주세요.',
      completeness,
    };
  }

  const rawRep = firstDefinedString(input.representative_name, input.representativeName);
  if (rawRep && rawRep.trim().length > 0 && isSampleBrokerName(rawRep)) {
    return {
      ok: false,
      field: 'representative_name',
      message:
        '샘플 성명(예: 홍길동 등)은 대표자 성명으로 저장할 수 없습니다. 실제 개업공인중개사 성명을 입력해 주세요.',
      completeness,
    };
  }

  const rawDisplay = firstDefinedString(input.display_name, input.displayName);
  if (rawDisplay && rawDisplay.trim().length > 0 && isSampleBrokerName(rawDisplay)) {
    return {
      ok: false,
      field: 'display_name',
      message:
        '샘플 성명(예: 홍길동 등)은 저장할 수 없습니다. 실제 성명을 입력해 주세요.',
      completeness,
    };
  }

  return {
    ok: true,
    completeness,
  };
}

export function extractSanitizedStatutoryItems(
  input: BrokerStatutoryInput,
): SanitizedStatutoryDisclosure {
  const officeName = pickSanitized(
    'officeName',
    input.company,
    input.officeName,
    input.office_name,
  );
  const representativeName = pickSanitized(
    'name',
    input.representative_name,
    input.representativeName,
    input.display_name,
    input.displayName,
  );
  const officeRegNumber = pickSanitized(
    'regNo',
    input.office_reg_number,
    input.officeRegNumber,
    input.registration_no,
    input.registrationNo,
  );
  const officeAddress = pickSanitized(
    'address',
    input.office_address,
    input.officeAddress,
  );
  const phone = pickSanitized('phone', input.phone);

  const items: Array<{ key: StatutoryFieldKey; label: string; value: string }> = [];
  if (officeName) items.push({ key: 'company', label: '상호', value: officeName });
  if (representativeName) {
    items.push({ key: 'representative_name', label: '대표자', value: representativeName });
  }
  if (officeRegNumber) {
    items.push({ key: 'office_reg_number', label: '등록번호', value: officeRegNumber });
  }
  if (officeAddress) {
    items.push({ key: 'office_address', label: '소재지', value: officeAddress });
  }
  if (phone) {
    items.push({ key: 'phone', label: '연락처', value: phone });
  }

  return {
    officeName,
    representativeName,
    officeRegNumber,
    officeAddress,
    phone,
    items,
    hasAny: items.length > 0,
  };
}

export function formatBrokerStatutoryDisclosureLines(
  input: BrokerStatutoryInput,
): string[] {
  const { items } = extractSanitizedStatutoryItems(input);
  return items.map((item) => `${item.label}: ${item.value}`);
}

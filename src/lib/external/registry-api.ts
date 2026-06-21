// src/lib/external/registry-api.ts
// 대법원 등기정보광장 API 클라이언트.
// REGISTRY_API_KEY 환경변수가 없으면 결정적 fallback을 반환합니다.

export interface RegistryMortgage {
  creditor: string;
  amount: number;
  registrationDate: string;
  status: 'active' | 'discharged';
}

export interface RegistryAttachment {
  creditor: string;
  amount: number;
  registrationDate: string;
}

export interface RegistryData {
  /** 등기 데이터가 실제로 조회되었는지 여부 */
  checked: boolean;
  mortgages: RegistryMortgage[];
  attachments: RegistryAttachment[];
  encumbranceRisk: 'clean' | 'check_required' | 'high_risk' | 'unavailable';
  displayMessage: string;
}

const UNAVAILABLE_FALLBACK: RegistryData = {
  checked: false,
  mortgages: [],
  attachments: [],
  encumbranceRisk: 'unavailable',
  displayMessage: '⚠️ 등기부등본 자동 조회가 설정되지 않았습니다. 근저당·가압류 확인을 위해 직접 등기부등본을 발급받아 확인해 주세요. (인터넷등기소 iros.go.kr)',
};

export async function fetchRegistryData(
  address: string,
  _pnu?: string
): Promise<RegistryData> {
  const apiKey = process.env.REGISTRY_API_KEY;
  if (!apiKey) {
    console.info('[registry-api] REGISTRY_API_KEY 없음. 등기 조회를 건너뜁니다.', { address });
    return UNAVAILABLE_FALLBACK;
  }
  try {
    const endpoint = 'https://www.iros.go.kr/openapi/v1/registry';
    const params = new URLSearchParams({
      serviceKey: apiKey,
      address,
      ...(typeof _pnu === 'string' && _pnu ? { pnu: _pnu } : {}),
    });
    const res = await fetch(`${endpoint}?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return UNAVAILABLE_FALLBACK;
    const raw = (await res.json()) as {
      mortgages?: Array<{ creditor?: string; amount?: number; regDate?: string; discharged?: boolean }>;
      attachments?: Array<{ creditor?: string; amount?: number; regDate?: string }>;
    };
    const mortgages: RegistryMortgage[] = (raw.mortgages ?? []).map((m) => ({
      creditor: maskCreditorName(m.creditor ?? '미상'),
      amount: m.amount ?? 0,
      registrationDate: m.regDate ?? '',
      status: m.discharged ? 'discharged' : 'active',
    }));
    const attachments: RegistryAttachment[] = (raw.attachments ?? []).map((a) => ({
      creditor: maskCreditorName(a.creditor ?? '미상'),
      amount: a.amount ?? 0,
      registrationDate: a.regDate ?? '',
    }));
    const active = mortgages.filter((m) => m.status === 'active');
    const risk = deriveRisk(active, attachments);
    return { checked: true, mortgages, attachments, encumbranceRisk: risk, displayMessage: buildMsg(risk, active, attachments) };
  } catch (err) {
    console.error('[registry-api] API 호출 실패:', err);
    return UNAVAILABLE_FALLBACK;
  }
}

function maskCreditorName(n: string): string {
  if (n.endsWith('은행')) return 'OO은행';
  if (n.endsWith('캐피탈')) return 'OO캐피탈';
  if (n.endsWith('저축은행')) return 'OO저축은행';
  if (n.endsWith('보험')) return 'OO보험';
  return 'OO기관';
}

function deriveRisk(
  active: RegistryMortgage[],
  att: RegistryAttachment[]
): RegistryData['encumbranceRisk'] {
  if (att.length > 0) return 'high_risk';
  if (active.length === 0) return 'clean';
  const total = active.reduce((s, m) => s + m.amount, 0);
  return total >= 1_000_000_000 ? 'check_required' : 'clean';
}

function buildMsg(
  risk: RegistryData['encumbranceRisk'],
  m: RegistryMortgage[],
  a: RegistryAttachment[]
): string {
  if (risk === 'clean') return '등기부상 특이사항 없음. 근저당 잔존액이 적거나 없는 양호한 상태입니다.';
  if (risk === 'check_required') return `근저당 ${m.length}건 확인됨. 계약 전 잔존 채무 규모를 반드시 확인하세요.`;
  if (risk === 'high_risk') return `가압류·가처분 ${a.length}건 포함. 법적 리스크 주의 — 전문가 검토를 권장합니다.`;
  return UNAVAILABLE_FALLBACK.displayMessage;
}

/**
 * 에디터(클라이언트) 공용 순수 헬퍼 — 서버 전용 모듈 의존 없음.
 */

/** API 에러 본문에서 사용자 메시지를 추출한다. ({error:{message}} | {error:"..."} | {message}) */
export function extractApiErrorMessage(json: unknown, fallback: string): string {
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const err = o.error;
    if (typeof err === 'string' && err.trim()) return err;
    if (err && typeof err === 'object') {
      const m = (err as Record<string, unknown>).message;
      if (typeof m === 'string' && m.trim()) return m;
    }
    if (typeof o.message === 'string' && o.message.trim()) return o.message;
  }
  return fallback;
}

/** 응답을 안전하게 JSON 파싱 (실패 시 null) */
export async function readJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** /api/broker/profile GET 응답 → 에디터가 쓰는 정체성 정보 */
export interface EditorIdentity {
  slug: string | null;
  displayName: string | null;
  /** broker_profiles.name — 공개 페이지가 우선 쓰는 표시명 */
  brokerName?: string | null;
  company: string | null;
  phone: string | null;
  photoUrl: string | null;
  tagline: string | null;
  magazineTitle: string;
  magazineThemeColor: string | null;
  isPaid: boolean;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

export function parseEditorIdentity(json: unknown): EditorIdentity | null {
  if (!json || typeof json !== 'object') return null;
  const data = (json as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const broker =
    d.broker && typeof d.broker === 'object' ? (d.broker as Record<string, unknown>) : null;
  const sub =
    d.subscription && typeof d.subscription === 'object'
      ? (d.subscription as Record<string, unknown>)
      : null;
  return {
    slug: str(d.slug) ?? str(broker?.slug),
    displayName: str(d.display_name),
    brokerName: str(broker?.name),
    company: str(d.company),
    phone: str(d.phone),
    photoUrl: str(d.photo_url) ?? str(broker?.photo_url),
    tagline: str(d.tagline),
    magazineTitle: typeof d.magazine_title === 'string' ? d.magazine_title : '',
    magazineThemeColor: str(d.magazine_theme_color),
    isPaid: !!sub?.isPaid,
  };
}

/**
 * 공개 표시명(QR 인쇄 문구 등) — 공개 페이지의 `publicBrokerDisplayName(broker_profiles.name, profiles.display_name)`
 * (src/lib/magazine/public-page-data.ts)와 같은 규칙: broker_profiles.name 우선, 비면 display_name.
 * public-page-data 는 서버 전용(pii→node:crypto)이라 클라이언트에서 import 할 수 없어 규칙만 동일하게 둔다.
 */
export function resolveEditorPublicName(
  identity: Pick<EditorIdentity, 'brokerName' | 'displayName'> | null | undefined,
  fallback: string,
): string {
  return str(identity?.brokerName)?.trim() || str(identity?.displayName)?.trim() || fallback;
}

/** 미리보기 전용 broker 객체 — 이메일은 절대 phone 슬롯에 넣지 않는다(T3-PII-1). */
export function buildPreviewBroker(identity: EditorIdentity | null): Record<string, unknown> | null {
  if (!identity) return null;
  return {
    name: identity.displayName ?? undefined,
    company: identity.company ?? undefined,
    phone: identity.phone ?? undefined,
    photoUrl: identity.photoUrl ?? undefined,
  };
}

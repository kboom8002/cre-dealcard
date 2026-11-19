import crypto from 'node:crypto';
import {
  normalizeClientEmail,
  normalizeTransactionalBasis,
  type InboxTransactionalBasis,
} from '@/domain/inbox/inbox-outbound';

/**
 * WP-7.3E P2-6: share-link tokens are bearer secrets. Outbound audit events store only a
 * SHA-256 digest (`share_token_hash`) so dispatch matching still works without persisting the raw token.
 */
export function hashShareTokenForAudit(token?: string | null): string {
  const clean = typeof token === 'string' ? token.trim() : '';
  if (!clean) return '';
  return crypto.createHash('sha256').update(clean).digest('hex');
}

/** Removes `token` / `t` query params (bearer share tokens) from a URL before it is logged. */
export function stripShareTokenFromUrl(rawUrl?: string | null): string {
  const value = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!value) return '';
  const [pathPart, ...rest] = value.split('?');
  if (rest.length === 0) return value;
  const query = rest.join('?');
  const hashIdx = query.indexOf('#');
  const qs = hashIdx >= 0 ? query.slice(0, hashIdx) : query;
  const params = new URLSearchParams(qs);
  params.delete('token');
  params.delete('t');
  const kept = params.toString();
  return kept ? `${pathPart}?${kept}` : pathPart;
}

export type InboxCrmClientRole = 'buyer' | 'seller' | 'tenant' | 'partner';
export type InboxEmailDeliveryStatus = 'ok' | 'bounced' | 'complained';

export interface InboxDispatchHistoryItem {
  id: string;
  eventType: string;
  channel: string;
  title: string;
  status: string;
  createdAt: string;
  bounceReason?: string;
}

export interface ParsedGateReason {
  requesterName: string | null;
  requesterPhone: string | null;
  requesterEmail?: string | null;
  requesterCompany: string | null;
  cleanMessage: string;
  buildingTitle: string;
}

export function formatImSectionLabel(sectionId?: string | null): string | undefined {
  const s = typeof sectionId === 'string' ? sectionId.trim() : '';
  if (!s) return undefined;
  const map: Record<string, string> = {
    '01_cover': '표지',
    '02_summary': '핵심 요약',
    '03_overview': '건물 개요',
    '04_location': '입지·교통',
    '05_tenancy': '임대 현황',
    '06_financials': '수익률 분석',
    '07_valuation': '가치 평가',
    '08_risk': '리스크 점검',
  };
  return map[s] || s;
}

export function resolveBuildingTitle(
  building: Record<string, unknown> | null | undefined,
  fallbackLabel?: string
): string {
  if (!building && fallbackLabel) return fallbackLabel;
  if (!building) return '매물';
  const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
  const area = str(building.area_signal) || str(building.region);
  const asset = str(building.asset_type) || str(building.main_usage);
  const name = str(building.building_name) || str(building.name) || str(building.title);
  if (area && name) return `${area} ${name}`.trim();
  if (area && asset) return `${area} ${asset}`.trim();
  if (name) return name;
  if (area) return area;
  if (str(building.raw_address)) return str(building.raw_address);
  if (str(building.address)) return str(building.address);
  return fallbackLabel || '매물';
}

export function parseGateRequestReason(
  rawReason: unknown,
  building?: Record<string, unknown> | null,
  fallbackLabel?: string
): ParsedGateReason {
  const buildingTitle = resolveBuildingTitle(building, fallbackLabel);
  if (!rawReason || typeof rawReason !== 'string') {
    return {
      requesterName: null,
      requesterPhone: null,
      requesterEmail: null,
      requesterCompany: null,
      cleanMessage: 'IM 열람을 요청했습니다.',
      buildingTitle,
    };
  }

  const trimmed = rawReason.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const requesterName =
        typeof parsed.name === 'string' && parsed.name.trim()
          ? parsed.name.trim()
          : typeof parsed.requesterName === 'string' && parsed.requesterName.trim()
          ? parsed.requesterName.trim()
          : null;
      const requesterPhone =
        typeof parsed.phone === 'string' && parsed.phone.trim()
          ? parsed.phone.trim()
          : typeof parsed.contact === 'string' && parsed.contact.trim()
          ? parsed.contact.trim()
          : typeof parsed.requesterPhone === 'string' && parsed.requesterPhone.trim()
          ? parsed.requesterPhone.trim()
          : null;
      const requesterEmail =
        typeof parsed.email === 'string' && parsed.email.trim()
          ? parsed.email.trim()
          : typeof parsed.requester_email === 'string' && parsed.requester_email.trim()
          ? parsed.requester_email.trim()
          : typeof parsed.requesterEmail === 'string' && parsed.requesterEmail.trim()
          ? parsed.requesterEmail.trim()
          : null;
      const requesterCompany =
        typeof parsed.company === 'string' && parsed.company.trim()
          ? parsed.company.trim()
          : typeof parsed.organization === 'string' && parsed.organization.trim()
          ? parsed.organization.trim()
          : null;
      const cleanMessage =
        typeof parsed.message === 'string' && parsed.message.trim()
          ? parsed.message.trim()
          : typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason.trim()
          : 'IM 열람을 요청했습니다.';

      return {
        requesterName,
        requesterPhone,
        requesterEmail,
        requesterCompany,
        cleanMessage,
        buildingTitle,
      };
    } catch {
      // Fall through if invalid JSON
    }
  }

  const bracketMatch = trimmed.match(
    /^\[신청자:\s*([^/\]\n]+?)(?:\s*\/\s*연락처:\s*([^\]\n]+?))?\]\s*(.*)$/
  );
  if (bracketMatch) {
    return {
      requesterName: bracketMatch[1]?.trim() || null,
      requesterPhone: bracketMatch[2]?.trim() || null,
      requesterCompany: null,
      cleanMessage: bracketMatch[3]?.trim() || 'IM 열람을 요청했습니다.',
      buildingTitle,
    };
  }

  const marketMatch = trimmed.match(
    /성함\/기업명:\s*([^,\n]+?)(?:,\s*연락처:\s*([^\n]+))?$/
  );
  if (marketMatch) {
    return {
      requesterName: marketMatch[1]?.trim() || null,
      requesterPhone: marketMatch[2]?.trim() || null,
      requesterCompany: null,
      cleanMessage: 'IM 열람을 요청했습니다.',
      buildingTitle,
    };
  }

  return {
    requesterName: null,
    requesterPhone: null,
    requesterCompany: null,
    cleanMessage: trimmed || 'IM 열람을 요청했습니다.',
    buildingTitle,
  };
}

export function toSafeEpochMs(isoLike: unknown): number {
  if (!isoLike || typeof isoLike !== 'string') return 0;
  const parsed = Date.parse(isoLike);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildThreadShareUrl(buildingId: string, shareToken: string): string {
  if (!buildingId) return '';
  if (shareToken) {
    return `/im-lite/${encodeURIComponent(buildingId)}?token=${encodeURIComponent(shareToken)}`;
  }
  return `/im-lite/${encodeURIComponent(buildingId)}`;
}

export function normalizeKrPhoneDigits(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || s.includes('@')) return '';
  let digits = s.replace(/\D/g, '');
  if (digits.startsWith('82') && digits.length >= 10) {
    digits = '0' + digits.slice(digits.startsWith('820') ? 3 : 2);
  }
  return digits;
}

export function formatKrPhoneDisplay(
  rawPhone: unknown,
  fallbackE164: unknown,
  fallbackEmail: unknown
): string {
  const direct = typeof rawPhone === 'string' ? rawPhone.trim() : '';
  if (direct && !direct.startsWith('+82')) return direct;
  const digits = normalizeKrPhoneDigits(direct || fallbackE164);
  if (digits.length === 11 && digits.startsWith('01')) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10 && digits.startsWith('01')) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (direct) return direct;
  const e164 = typeof fallbackE164 === 'string' ? fallbackE164.trim() : '';
  if (e164) return e164;
  return typeof fallbackEmail === 'string' ? fallbackEmail.trim() : '';
}

export function normalizeClientRole(raw: unknown): InboxCrmClientRole | null {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === 'buyer' || s === '매수' || s === '매수자') return 'buyer';
  if (s === 'seller' || s === 'owner' || s === '매도' || s === '매도자' || s === '소유주') {
    return 'seller';
  }
  if (s === 'tenant' || s === 'lessee' || s === '임차' || s === '임차인') return 'tenant';
  if (s === 'partner' || s === '공동중개' || s === '파트너') return 'partner';
  return null;
}

export function parsePreferredRegionsInput(rawArr: unknown, rawStr?: unknown): string[] {
  const out = new Set<string>();
  if (Array.isArray(rawArr)) {
    for (const item of rawArr) {
      const s = String(item ?? '').trim();
      if (s) out.add(s);
    }
    if (out.size > 0) return Array.from(out);
  }
  if (typeof rawStr === 'string' && rawStr.trim()) {
    for (const part of rawStr.split(/[,/]+/)) {
      const s = part.trim();
      if (s) out.add(s);
    }
  }
  return Array.from(out);
}

export function parseBudgetManwonInput(rawManwon: unknown, rawText?: unknown): number | null {
  if (rawManwon === null) return null;
  if (typeof rawManwon === 'number' && Number.isFinite(rawManwon) && rawManwon >= 0) {
    return Math.round(rawManwon);
  }
  if (typeof rawManwon === 'string' && rawManwon.trim()) {
    const cleanNum = rawManwon.trim().replace(/,/g, '');
    if (/^\d+$/.test(cleanNum)) {
      return Math.round(Number(cleanNum));
    }
  }
  if (typeof rawText === 'string' && rawText.trim()) {
    const txt = rawText.trim().replace(/,/g, '');
    const eokMatch = txt.match(/(\d+(?:\.\d+)?)\s*억/);
    const manMatch = txt.match(/(\d+(?:\.\d+)?)\s*만/);
    if (eokMatch || manMatch) {
      const eokVal = eokMatch ? Number(eokMatch[1]) * 10000 : 0;
      const manVal = manMatch ? Number(manMatch[1]) : 0;
      const sum = Math.round(eokVal + manVal);
      return Number.isFinite(sum) && sum > 0 ? sum : null;
    }
    if (/^\d+$/.test(txt)) {
      return Math.round(Number(txt));
    }
  }
  return null;
}

export function formatBudgetManwonDisplay(manwon: number | null): string {
  if (manwon === null || !Number.isFinite(manwon) || manwon <= 0) return '';
  if (manwon >= 10000) {
    const eok = manwon / 10000;
    return Number.isInteger(eok) ? `${eok}억` : `${eok.toFixed(1).replace(/\.0$/, '')}억`;
  }
  return `${manwon.toLocaleString('ko-KR')}만`;
}

export function extractFreeMemoFromLegacyNotes(notesRaw: unknown): string {
  const text = typeof notesRaw === 'string' ? notesRaw.trim() : '';
  if (!text) return '';
  const isPureLegacyConcatenation =
    /^(?:(?:예산|선호권역|관심매물|근거)\s*:[^/]+(?:\s*\/\s*)?)+$/i.test(text);
  if (isPureLegacyConcatenation) return '';
  return text;
}

export function normalizeEmailDeliveryStatus(raw: unknown): InboxEmailDeliveryStatus {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === 'complained') return 'complained';
  if (s === 'bounced') return 'bounced';
  return 'ok';
}

export function parseClientNotesMeta(notesRaw: unknown): {
  budget: string;
  preferredRegion: string;
  buildingTitle: string;
  transactionalBasis: InboxTransactionalBasis | null;
  isStructuredMeta: boolean;
} {
  const text = typeof notesRaw === 'string' ? notesRaw.trim() : '';
  if (!text) {
    return {
      budget: '',
      preferredRegion: '',
      buildingTitle: '',
      transactionalBasis: null,
      isStructuredMeta: false,
    };
  }
  const budgetMatch = text.match(/예산:\s*([^/]+)/);
  const regionMatch = text.match(/선호권역:\s*([^/]+)/);
  const bldgMatch = text.match(/관심매물:\s*([^/]+)/);
  const basisMatch = text.match(/근거:\s*([a-z_]+)/i);
  const isStructuredMeta = Boolean(
    budgetMatch || regionMatch || bldgMatch || basisMatch
  );
  return {
    budget: budgetMatch?.[1]?.trim() || '',
    preferredRegion: regionMatch?.[1]?.trim() || '',
    buildingTitle: bldgMatch?.[1]?.trim() || '',
    transactionalBasis: normalizeTransactionalBasis(basisMatch?.[1]),
    isStructuredMeta,
  };
}

export function toDispatchHistoryEntry(ev: Record<string, unknown>): InboxDispatchHistoryItem {
  const meta = (
    ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}
  ) as Record<string, unknown>;
  const eventType = String(ev?.event_type || '');
  const createdAt = String(ev?.created_at || '');
  const assetKind = String(meta.asset_kind || '').toLowerCase();

  if (eventType === 'inbox_email_sent') {
    const fallbackTitle =
      assetKind === 'magazine'
        ? '뉴스레터 이메일 발송'
        : assetKind === 'dealcard'
        ? '딜카드 이메일 발송'
        : 'IM 자료 이메일 발송';
    return {
      id: String(ev.id),
      eventType,
      channel: 'email',
      title:
        typeof meta.subject === 'string' && meta.subject.trim()
          ? meta.subject.trim()
          : fallbackTitle,
      status: 'sent',
      createdAt,
    };
  }
  if (eventType === 'inbox_outbound_copied') {
    const title =
      assetKind === 'magazine'
        ? '카톡 인사말+뉴스레터 링크 복사'
        : assetKind === 'dealcard'
        ? '카톡 인사말+딜카드 링크 복사'
        : '카톡 인사말+IM 링크 복사';
    return {
      id: String(ev.id),
      eventType,
      channel: 'copy',
      title,
      status: 'copied',
      createdAt,
    };
  }
  if (eventType === 'inbox_alimtalk_sent') {
    return {
      id: String(ev.id),
      eventType,
      channel: 'alimtalk',
      title: '카카오 정보성 알림톡 발송',
      status: 'sent',
      createdAt,
    };
  }
  if (eventType === 'magazine_sent') {
    // WP-7.3E P2-4: the inbox `send_magazine` action only prepares a share link (dispatched: false);
    // never label it as a delivered newsletter.
    const linkOnly = meta.dispatched === false;
    const headline = typeof meta.headline === 'string' && meta.headline.trim() ? meta.headline.trim() : '';
    return {
      id: String(ev.id),
      eventType,
      channel: String(meta.channel || 'newsletter'),
      title: linkOnly
        ? headline
          ? `뉴스레터 링크 준비: ${headline}`
          : '뉴스레터 링크 준비'
        : headline
          ? `뉴스레터 발송: ${headline}`
          : '뉴스레터 발송',
      status: linkOnly ? 'prepared' : 'sent',
      createdAt,
    };
  }
  if (eventType === 'dealcard_sent' || eventType === 'im_link_sent') {
    return {
      id: String(ev.id),
      eventType,
      channel: String(meta.channel || 'link'),
      title: eventType === 'dealcard_sent' ? '딜카드 링크 발송' : 'IM 전용 링크 발송',
      status: 'sent',
      createdAt,
    };
  }
  if (eventType === 'email_delivered') {
    return {
      id: String(ev.id),
      eventType,
      channel: 'email',
      title: '이메일 수신 서버 전달 완료',
      status: 'delivered',
      createdAt,
    };
  }
  if (eventType === 'email_bounced') {
    const reason =
      typeof meta.reason === 'string' && meta.reason.trim() ? meta.reason.trim() : undefined;
    return {
      id: String(ev.id),
      eventType,
      channel: 'email',
      title: '이메일 반송 (수신 불가)',
      status: 'bounced',
      createdAt,
      ...(reason ? { bounceReason: reason } : {}),
    };
  }
  if (eventType === 'email_complained') {
    const reason =
      typeof meta.reason === 'string' && meta.reason.trim() ? meta.reason.trim() : undefined;
    return {
      id: String(ev.id),
      eventType,
      channel: 'email',
      title: '스팸 신고 접수 (발송 자동 차단)',
      status: 'complained',
      createdAt,
      ...(reason ? { bounceReason: reason } : {}),
    };
  }
  if (eventType === 'contacts_bulk_imported') {
    return {
      id: String(ev.id),
      eventType,
      channel: 'import',
      title: '연락처 일괄 등록',
      status: 'imported',
      createdAt,
    };
  }
  return {
    id: String(ev.id),
    eventType,
    channel: String(meta.channel || 'system'),
    title: eventType,
    status: 'logged',
    createdAt,
  };
}

export { normalizeClientEmail };

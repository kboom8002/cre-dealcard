/**
 * 미리보기 브리지 (U-02) — 에디터(부모) ↔ 뷰어(iframe) postMessage 프로토콜.
 *
 * 흐름:
 *  1) 뷰어(iframe)가 마운트되면 `cre-preview:ready` 를 부모에게 보낸다.
 *  2) 부모는 `cre-preview:draft` 로 초안 content 를 보낸다 (변경될 때마다 재전송).
 *  3) 뷰어는 수신한 content 로 렌더하고 `cre-preview:ack` 로 응답한다(선택).
 *
 * 보안: 같은 origin 의 메시지만 수락한다. (`event.origin === window.location.origin`)
 * 이 파일은 순수 로직만 가진다 — DOM 에 접근하지 않으므로 서버/테스트에서도 import 가능.
 *
 * E3(뷰어) 구현 요청: `/magazine/{slug}/{date}?preview=1&edition={id}` 진입 시
 *  - `isPreviewQuery` 로 미리보기 모드 판별
 *  - mount 후 `buildReadyMessage(editionId)` 를 `window.parent` 로 전송
 *  - `parsePreviewMessage` + `isAllowedOrigin` 으로 draft 수신 → 렌더
 */

/** 뷰어 수신기(components/magazine/PreviewReceiver.tsx, E3)가 구현되어 iframe 미리보기를 켠다. 인라인 폴백은 mode="inline"로 유지. */
export const PREVIEW_IFRAME_ENABLED = true;

export const PREVIEW_MSG_DRAFT = "cre-preview:draft" as const;
export const PREVIEW_MSG_READY = "cre-preview:ready" as const;
export const PREVIEW_MSG_ACK = "cre-preview:ack" as const;

export interface PreviewDraftMessage {
  type: typeof PREVIEW_MSG_DRAFT;
  editionId: string;
  /** 초안 content (EditionContent 형태, 직렬화 가능한 JSON) */
  content: Record<string, unknown>;
  /** 단조 증가 시퀀스 — 늦게 도착한 오래된 메시지를 무시하기 위함 */
  seq: number;
}

export interface PreviewReadyMessage {
  type: typeof PREVIEW_MSG_READY;
  editionId: string;
}

export interface PreviewAckMessage {
  type: typeof PREVIEW_MSG_ACK;
  editionId: string;
  seq: number;
}

export type PreviewMessage = PreviewDraftMessage | PreviewReadyMessage | PreviewAckMessage;

/** `/magazine/{slug}/{date}?preview=1&edition={id}` 경로 생성 */
export function buildPreviewSrc(slug: string, date: string, editionId?: string | null): string {
  const qs = new URLSearchParams({ preview: "1" });
  if (editionId) qs.set("edition", editionId);
  return `/magazine/${encodeURIComponent(slug)}/${encodeURIComponent(date)}?${qs.toString()}`;
}

/** location.search 에서 미리보기 모드인지 + edition id 추출 */
export function isPreviewQuery(search: string): { preview: boolean; editionId: string | null } {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return { preview: sp.get("preview") === "1", editionId: sp.get("edition") || null };
}

/** 같은 origin 의 메시지만 허용 — 빈 origin("null") 도 거부 */
export function isAllowedOrigin(eventOrigin: string, selfOrigin: string): boolean {
  if (!eventOrigin || !selfOrigin) return false;
  if (eventOrigin === "null" || selfOrigin === "null") return false;
  return eventOrigin === selfOrigin;
}

export function buildDraftMessage(
  editionId: string,
  content: Record<string, unknown>,
  seq: number,
): PreviewDraftMessage {
  return { type: PREVIEW_MSG_DRAFT, editionId, content, seq };
}

export function buildReadyMessage(editionId: string): PreviewReadyMessage {
  return { type: PREVIEW_MSG_READY, editionId };
}

export function buildAckMessage(editionId: string, seq: number): PreviewAckMessage {
  return { type: PREVIEW_MSG_ACK, editionId, seq };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 알 수 없는/형식 오류 메시지는 null — 수신 측은 null 이면 무시한다 */
export function parsePreviewMessage(data: unknown): PreviewMessage | null {
  if (!isPlainObject(data)) return null;
  const editionId = typeof data.editionId === "string" ? data.editionId : null;
  if (!editionId) return null;
  switch (data.type) {
    case PREVIEW_MSG_DRAFT: {
      if (!isPlainObject(data.content)) return null;
      const seq = typeof data.seq === "number" && Number.isFinite(data.seq) ? data.seq : 0;
      return { type: PREVIEW_MSG_DRAFT, editionId, content: data.content, seq };
    }
    case PREVIEW_MSG_READY:
      return { type: PREVIEW_MSG_READY, editionId };
    case PREVIEW_MSG_ACK: {
      const seq = typeof data.seq === "number" && Number.isFinite(data.seq) ? data.seq : 0;
      return { type: PREVIEW_MSG_ACK, editionId, seq };
    }
    default:
      return null;
  }
}

/** 뷰어 측: 마지막으로 적용한 seq 보다 큰 draft 만 적용 */
export function shouldApplyDraft(lastSeq: number, msg: PreviewDraftMessage): boolean {
  return msg.seq > lastSeq;
}

/** 안전한 직렬화 — structuredClone 불가 값(함수 등)을 제거하고 JSON 으로 정리 */
export function toTransferableContent(content: unknown): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(JSON.stringify(content ?? {}));
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export interface ContentMutatedPayload {
  buildingId: string;
  documentId?: string;
  projectId?: string;
  targetHash: string;
  changeKind?: string;
  invalidatedChannels?: string[];
  timestamp: string;
  updatedBy?: string;
}

export interface ApprovalChangedPayload {
  buildingId: string;
  projectId?: string;
  stage: 'S60_EDITORIAL_APPROVAL' | 'S70_FILE_APPROVAL' | string;
  targetHash?: string;
  approvalEvent?: any;
  releaseRecord?: any;
  timestamp: string;
  fileUrl?: string;
}

export interface SlideOverrideChangedPayload {
  buildingId: string;
  projectId: string;
  slideId: string;
  overrides: Record<string, unknown>;
  targetHash?: string;
  timestamp: string;
}

export type DealcardSyncEvent =
  | { event: 'CONTENT_MUTATED'; payload: ContentMutatedPayload }
  | { event: 'APPROVAL_CHANGED'; payload: ApprovalChangedPayload }
  | { event: 'SLIDE_OVERRIDE_CHANGED'; payload: SlideOverrideChangedPayload };

type LocalSyncCallback = (event: DealcardSyncEvent) => void;

// In-process event bus for local testing and deterministic E2E assertions
const localSubscribers = new Map<string, Set<LocalSyncCallback>>();

export function subscribeLocalSync(
  buildingId: string,
  callback: LocalSyncCallback
): () => void {
  if (!localSubscribers.has(buildingId)) {
    localSubscribers.set(buildingId, new Set());
  }
  const set = localSubscribers.get(buildingId)!;
  set.add(callback);
  return () => {
    set.delete(callback);
    if (set.size === 0) {
      localSubscribers.delete(buildingId);
    }
  };
}

export function dispatchLocalSync(buildingId: string, event: DealcardSyncEvent): void {
  const set = localSubscribers.get(buildingId);
  if (set) {
    set.forEach((cb) => {
      try {
        cb(event);
      } catch (err) {
        console.warn('[RealtimeSync] Local listener error:', err);
      }
    });
  }
}

/**
 * Server-side broadcaster for content mutations
 */
export async function broadcastDealcardMutation(
  supabase: any,
  payload: ContentMutatedPayload
): Promise<void> {
  const event: DealcardSyncEvent = {
    event: 'CONTENT_MUTATED',
    payload,
  };

  dispatchLocalSync(payload.buildingId, event);

  if (!supabase) return;
  try {
    const channel = supabase.channel(`dealcard-sync:${payload.buildingId}`);
    await channel.send({
      type: 'broadcast',
      event: 'CONTENT_MUTATED',
      payload,
    });
  } catch (err) {
    console.warn('[RealtimeSync] Broadcast failed (non-blocking):', err);
  }
}

/**
 * Server-side broadcaster for approval events (S60 / S70)
 */
export async function broadcastApprovalEvent(
  supabase: any,
  payload: ApprovalChangedPayload
): Promise<void> {
  const event: DealcardSyncEvent = {
    event: 'APPROVAL_CHANGED',
    payload,
  };

  dispatchLocalSync(payload.buildingId, event);

  if (!supabase) return;
  try {
    const channel = supabase.channel(`dealcard-sync:${payload.buildingId}`);
    await channel.send({
      type: 'broadcast',
      event: 'APPROVAL_CHANGED',
      payload,
    });
  } catch (err) {
    console.warn('[RealtimeSync] Broadcast approval failed (non-blocking):', err);
  }
}

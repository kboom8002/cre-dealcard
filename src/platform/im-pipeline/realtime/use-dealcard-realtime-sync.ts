'use client';

import { createBrowserClient } from '@supabase/ssr';
import { toast } from 'sonner';
import { useEffect } from 'react';
import {
  subscribeLocalSync,
  type ContentMutatedPayload,
  type ApprovalChangedPayload,
  type SlideOverrideChangedPayload,
  type DealcardSyncEvent,
} from './dealcard-sync-channel';

export type {
  ContentMutatedPayload,
  ApprovalChangedPayload,
  SlideOverrideChangedPayload,
  DealcardSyncEvent,
};

/**
 * Client-side React hook for real-time synchronization
 */
export function useDealcardRealtimeSync(
  buildingId: string | undefined,
  callbacks?: {
    onContentMutated?: (payload: ContentMutatedPayload) => void;
    onApprovalChanged?: (payload: ApprovalChangedPayload) => void;
    onSlideOverrideChanged?: (payload: SlideOverrideChangedPayload) => void;
  }
) {
  useEffect(() => {
    if (!buildingId) return;

    // 1. Subscribe to local event bus (instant in-process)
    const unsubLocal = subscribeLocalSync(buildingId, (e) => {
      if (e.event === 'CONTENT_MUTATED') {
        callbacks?.onContentMutated?.(e.payload);
      } else if (e.event === 'APPROVAL_CHANGED') {
        callbacks?.onApprovalChanged?.(e.payload);
      } else if (e.event === 'SLIDE_OVERRIDE_CHANGED') {
        callbacks?.onSlideOverrideChanged?.(e.payload);
      }
    });

    // 2. Subscribe to Supabase Realtime broadcast channel if in browser
    let channel: any = null;
    try {
      if (
        typeof window !== 'undefined' &&
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ) {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );

        channel = supabase
          .channel(`dealcard-sync:${buildingId}`)
          .on('broadcast', { event: 'CONTENT_MUTATED' }, ({ payload }) => {
            toast.info('⚡ 최신 개정본이 실시간 반영되었습니다.');
            callbacks?.onContentMutated?.(payload);
          })
          .on('broadcast', { event: 'APPROVAL_CHANGED' }, ({ payload }) => {
            if (payload.stage === 'S70_FILE_APPROVAL') {
              toast.success('✓ 공식 IM 승인이 완료되었습니다. 최신 PPTX 다운로드가 활성화되었습니다.');
            } else if (payload.stage === 'S60_EDITORIAL_APPROVAL') {
              toast.info('📋 슬라이드 구성 및 문안 편집 승인(S60)이 완료되었습니다.');
            }
            callbacks?.onApprovalChanged?.(payload);
          })
          .on('broadcast', { event: 'SLIDE_OVERRIDE_CHANGED' }, ({ payload }) => {
            callbacks?.onSlideOverrideChanged?.(payload);
          })
          .subscribe();
      }
    } catch (err) {
      console.warn('[RealtimeSync] Client channel subscription error:', err);
    }

    return () => {
      unsubLocal();
      if (channel) {
        channel.unsubscribe();
      }
    };
  }, [buildingId, callbacks]);
}

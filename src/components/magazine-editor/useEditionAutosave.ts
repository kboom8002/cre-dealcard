'use client';

/**
 * useEditionAutosave — 에디터 단일 저장 경로 (E-01)
 *
 * - 값이 바뀌면 3초 debounce 후 저장, 변경분이 남아 있으면 30초 주기로도 저장.
 * - 모든 최신 값은 ref 로 읽어 stale closure 가 없다(타이머가 오래된 상태를 저장하지 않음).
 * - 서명(signature)이 마지막 저장 서명과 다를 때만 저장(변경분만).
 * - PATCH /api/magazine/editions 에 expected_updated_at 을 실어 보내 다른 탭 덮어쓰기를 막는다(409 → conflict).
 * - 임시저장은 magazine_editions 만 쓴다. status 는 보내지 않는다(발행은 전용 엔드포인트).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_INTERVAL_MS,
  SAVE_FAILURE_MESSAGES,
  classifySaveFailure,
  type EditionPatchPayload,
  type SaveFailureKind,
} from '@/lib/magazine/edition-save';

export type AutosaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict' | 'locked';

export interface UseEditionAutosaveOptions {
  editionId: string | null;
  /** 초기 로드/복원이 끝나 저장을 시작해도 되는지 */
  ready: boolean;
  /** false 면 저장하지 않는다 (발행본 등) */
  enabled: boolean;
  /** 현재 폼의 변경 감지 서명 */
  signature: string;
  /** 현재 폼의 저장 payload (호출 시점의 최신 값) */
  getPayload: () => EditionPatchPayload;
  /** 서버가 마지막으로 알려준 updated_at */
  initialUpdatedAt: string | null;
}

export interface UseEditionAutosaveResult {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  errorKind: SaveFailureKind | null;
  errorMessage: string | null;
  /** 즉시 저장. 성공 true */
  saveNow: () => Promise<boolean>;
  /** 충돌 시: 서버 값을 무시하고 내 변경으로 덮어쓰기 */
  overwrite: () => Promise<boolean>;
  /** 외부(발행 등)에서 서버 updated_at 이 바뀐 경우 반영 */
  syncUpdatedAt: (updatedAt: string | null) => void;
  /** 현재 서명을 '저장됨' 기준선으로 (초기 복원 직후) */
  markClean: (signature?: string) => void;
  dirty: boolean;
}

interface SaveResponse {
  edition?: { updated_at?: string | null };
  error?: { code?: string; message?: string };
  currentUpdatedAt?: string | null;
}

export function useEditionAutosave(opts: UseEditionAutosaveOptions): UseEditionAutosaveResult {
  const { editionId, ready, enabled, signature, getPayload, initialUpdatedAt } = opts;

  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [errorKind, setErrorKind] = useState<SaveFailureKind | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── 최신 값 ref (stale closure 방지) ──
  const signatureRef = useRef(signature);
  const getPayloadRef = useRef(getPayload);
  const editionIdRef = useRef(editionId);
  const enabledRef = useRef(enabled);
  const readyRef = useRef(ready);
  const updatedAtRef = useRef<string | null>(initialUpdatedAt);
  const savedSignatureRef = useRef<string | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const statusRef = useRef<AutosaveStatus>('idle');
  const mountedRef = useRef(true);

  useEffect(() => {
    signatureRef.current = signature;
    getPayloadRef.current = getPayload;
    editionIdRef.current = editionId;
    enabledRef.current = enabled;
    readyRef.current = ready;
  });

  const setStatusBoth = useCallback((s: AutosaveStatus) => {
    statusRef.current = s;
    if (mountedRef.current) setStatus(s);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 초기 updated_at 반영
  useEffect(() => {
    updatedAtRef.current = initialUpdatedAt;
  }, [initialUpdatedAt]);

  const runSave = useCallback(
    async (force: boolean): Promise<boolean> => {
      const id = editionIdRef.current;
      if (!id || !readyRef.current || !enabledRef.current) return false;
      // 이미 저장 중이면 그 결과를 기다린 뒤 변경분이 남았으면 한 번 더
      if (inFlightRef.current) {
        const prev = await inFlightRef.current;
        if (!prev) return false;
        if (savedSignatureRef.current === signatureRef.current) return true;
      }
      const sigAtStart = signatureRef.current;
      if (savedSignatureRef.current === sigAtStart) {
        if (statusRef.current === 'dirty') setStatusBoth('saved');
        return true;
      }

      const exec = (async (): Promise<boolean> => {
        setStatusBoth('saving');
        setErrorKind(null);
        setErrorMessage(null);
        let httpStatus = 0;
        let json: SaveResponse = {};
        try {
          const payload = getPayloadRef.current();
          const body: Record<string, unknown> = { id, ...payload };
          if (!force) body.expected_updated_at = updatedAtRef.current;
          const res = await fetch('/api/magazine/editions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          httpStatus = res.status;
          try {
            json = (await res.json()) as SaveResponse;
          } catch {
            json = {};
          }
          if (res.ok) {
            const next = json.edition?.updated_at ?? null;
            updatedAtRef.current = next;
            savedSignatureRef.current = sigAtStart;
            if (mountedRef.current) setLastSavedAt(new Date());
            // 저장 중 추가 입력이 있었다면 다시 dirty
            setStatusBoth(signatureRef.current === sigAtStart ? 'saved' : 'dirty');
            return true;
          }
        } catch {
          httpStatus = 0;
        }
        const kind = classifySaveFailure(httpStatus, json.error?.code ?? null);
        if (mountedRef.current) {
          setErrorKind(kind);
          setErrorMessage(SAVE_FAILURE_MESSAGES[kind]);
        }
        if (kind === 'conflict') {
          // 사용자가 '덮어쓰기'/'새로고침'을 고를 때까지 자동 저장 중지
          setStatusBoth('conflict');
        } else if (kind === 'locked') {
          setStatusBoth('locked');
        } else {
          setStatusBoth('error');
        }
        return false;
      })();

      inFlightRef.current = exec;
      try {
        return await exec;
      } finally {
        if (inFlightRef.current === exec) inFlightRef.current = null;
      }
    },
    [setStatusBoth],
  );

  const saveNow = useCallback(() => runSave(false), [runSave]);
  const overwrite = useCallback(() => runSave(true), [runSave]);

  const syncUpdatedAt = useCallback((updatedAt: string | null) => {
    updatedAtRef.current = updatedAt;
  }, []);

  const markClean = useCallback(
    (sig?: string) => {
      savedSignatureRef.current = sig ?? signatureRef.current;
      setStatusBoth('idle');
    },
    [setStatusBoth],
  );

  // ── 변경 감지: 기준선이 없으면 첫 서명을 기준선으로 (초기 복원 값은 저장하지 않음) ──
  useEffect(() => {
    if (!ready || !enabled || !editionId) return;
    if (savedSignatureRef.current === null) {
      savedSignatureRef.current = signature;
      return;
    }
    if (signature === savedSignatureRef.current) {
      if (statusRef.current === 'dirty') setStatusBoth('saved');
      return;
    }
    // 충돌/잠금 상태에서는 자동 저장을 멈추고 사용자가 선택하게 한다
    if (statusRef.current === 'conflict' || statusRef.current === 'locked') return;
    setStatusBoth('dirty');
    const t = setTimeout(() => {
      void runSave(false);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [signature, ready, enabled, editionId, runSave, setStatusBoth]);

  // ── 30초 주기: 변경분이 있을 때만 (실패 후 재시도 포함) ──
  useEffect(() => {
    if (!ready || !enabled || !editionId) return;
    const timer = setInterval(() => {
      if (statusRef.current === 'conflict' || statusRef.current === 'locked' || statusRef.current === 'saving') return;
      if (savedSignatureRef.current !== null && savedSignatureRef.current !== signatureRef.current) {
        void runSave(false);
      }
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [ready, enabled, editionId, runSave]);

  // ── 탭 숨김/이탈 시 flush + 이탈 경고 ──
  useEffect(() => {
    if (!ready || !enabled || !editionId) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (
          savedSignatureRef.current !== null &&
          savedSignatureRef.current !== signatureRef.current &&
          statusRef.current !== 'conflict' &&
          statusRef.current !== 'locked'
        ) {
          void runSave(false);
        }
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (savedSignatureRef.current !== null && savedSignatureRef.current !== signatureRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [ready, enabled, editionId, runSave]);

  const dirty = status === 'dirty' || status === 'saving' || status === 'error' || status === 'conflict';

  return useMemo(
    () => ({ status, lastSavedAt, errorKind, errorMessage, saveNow, overwrite, syncUpdatedAt, markClean, dirty }),
    [status, lastSavedAt, errorKind, errorMessage, saveNow, overwrite, syncUpdatedAt, markClean, dirty],
  );
}

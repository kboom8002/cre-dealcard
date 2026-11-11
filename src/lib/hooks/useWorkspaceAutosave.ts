'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type WorkspaceAutosaveStatus =
  | 'idle'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'error'
  | 'conflict'
  | 'offline';

export interface UseWorkspaceAutosaveOptions<T> {
  /** Identifier of the entity/draft being saved */
  id: string | null;
  /** Whether the workspace is ready (initial data loaded) */
  ready?: boolean;
  /** Whether autosave is currently enabled */
  enabled?: boolean;
  /** Current payload data to be saved */
  data: T;
  /** Concurrency control: expected version number or updatedAt string */
  expectedVersion?: number | string | null;
  /** Debounce delay in ms (defaults to 3000ms / 3 seconds) */
  debounceMs?: number;
  /** Periodic save interval if dirty in ms (defaults to 30000ms / 30 seconds) */
  intervalMs?: number;
  /** Async function to perform server save */
  onSave: (payload: {
    id: string;
    data: T;
    expectedVersion?: number | string | null;
  }) => Promise<{ version?: number | string | null; savedData?: T } | void>;
  /** Callback triggered when a 409 conflict is detected */
  onConflict?: (serverVersion?: number | string | null) => void;
  /** Callback triggered when save errors */
  onError?: (error: Error) => void;
}

export interface UseWorkspaceAutosaveResult {
  status: WorkspaceAutosaveStatus;
  lastSavedAt: Date | null;
  error: Error | null;
  dirty: boolean;
  isOnline: boolean;
  /** Immediately flushes pending changes */
  flush: () => Promise<boolean>;
  /** Manually marks current state as clean */
  markClean: () => void;
  /** Marks target (or active) key dirty again and un-cancels it (e.g., after Undo Delete) */
  markDirty: (targetKey?: string) => void;
  /** Cancels pending/queued/auto-flush saves for target (or active) key (e.g., on Delete) */
  cancelPending: (targetKey?: string) => void;
  /** Resolves conflict by forcing a save */
  resolveConflictByOverwriting: () => Promise<boolean>;
}

interface FailedSaveEntry<T> {
  data: T;
  expectedVersion: number | string | null;
  error: Error;
  isConflict: boolean;
}

export function useWorkspaceAutosave<T>(
  options: UseWorkspaceAutosaveOptions<T>
): UseWorkspaceAutosaveResult {
  const {
    id,
    ready = true,
    enabled = true,
    data,
    expectedVersion = null,
    debounceMs = 3000,
    intervalMs = 30000,
    onSave,
    onConflict,
    onError,
  } = options;

  const [status, setStatus] = useState<WorkspaceAutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    return true;
  });

  // Latest references to prevent stale closures in async/timers
  const dataRef = useRef<T>(data);
  const idRef = useRef<string | null>(id);
  const activeKeyRef = useRef<string | null>(id);
  const readyRef = useRef<boolean>(ready);
  const enabledRef = useRef<boolean>(enabled);
  const debounceMsRef = useRef<number>(debounceMs);
  const expectedVersionRef = useRef<number | string | null>(expectedVersion);
  const onSaveRef = useRef(onSave);
  const onConflictRef = useRef(onConflict);
  const onErrorRef = useRef(onError);

  const lastSavedJsonRef = useRef<string | null>(null);
  const lastSavedJsonByKeyRef = useRef<Map<string, string>>(new Map());
  const lastSavedAtByKeyRef = useRef<Map<string, Date>>(new Map());
  const expectedVersionByKeyRef = useRef<Map<string, number | string | null>>(new Map());
  const failedSavesByKeyRef = useRef<Map<string, FailedSaveEntry<T>>>(new Map());
  const cancelledKeysRef = useRef<Set<string>>(new Set());

  const prevIdRef = useRef<string | null>(id);
  const latestDataByIdRef = useRef<Map<string, T>>(new Map());
  const pendingSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingTimerKeyRef = useRef<string | null>(null);
  const intervalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inFlightPromiseRef = useRef<Promise<boolean> | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Synchronously track active key during render so async completions never contaminate another item
  activeKeyRef.current = id;
  idRef.current = id;
  if (id && !cancelledKeysRef.current.has(id)) {
    latestDataByIdRef.current.set(id, data);
  }

  // Keep refs up to date
  useEffect(() => {
    dataRef.current = data;
    idRef.current = id;
    activeKeyRef.current = id;
    if (id && !cancelledKeysRef.current.has(id)) {
      latestDataByIdRef.current.set(id, data);
    }
    if (id) {
      expectedVersionByKeyRef.current.set(id, expectedVersion);
    }
    readyRef.current = ready;
    enabledRef.current = enabled;
    debounceMsRef.current = debounceMs;
    expectedVersionRef.current = expectedVersion;
    onSaveRef.current = onSave;
    onConflictRef.current = onConflict;
    onErrorRef.current = onError;
  });

  // Track mounted status
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pendingSaveTimerRef.current) clearTimeout(pendingSaveTimerRef.current);
      if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
    };
  }, []);

  const currentJson = JSON.stringify(data);
  const hasFailedCurrentKey = Boolean(id && failedSavesByKeyRef.current.has(id));
  const isDirty =
    (lastSavedJsonRef.current !== null && lastSavedJsonRef.current !== currentJson) ||
    hasFailedCurrentKey;

  // Execute the actual save
  const executeSave = useCallback(
    async (
      ignoreConflict: boolean = false,
      overrideId?: string | null,
      overrideData?: T,
      overrideExpectedVersion?: number | string | null
    ): Promise<boolean> => {
      const flushedKey = overrideId ?? activeKeyRef.current;
      if (!flushedKey || !readyRef.current || !enabledRef.current) {
        return false;
      }
      if (cancelledKeysRef.current.has(flushedKey)) {
        return false;
      }

      const isBackgroundKeySave =
        overrideId !== undefined && overrideId !== activeKeyRef.current;

      // Check offline status
      const currentlyOnline =
        typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
          ? navigator.onLine
          : true;

      if (!currentlyOnline) {
        if (isMountedRef.current && activeKeyRef.current === flushedKey) {
          setStatus('offline');
        }
        return false;
      }

      // Concurrency lock: await in-flight save before starting another
      if (inFlightPromiseRef.current) {
        try {
          const prevOk = await inFlightPromiseRef.current;
          if (cancelledKeysRef.current.has(flushedKey)) {
            return false;
          }
          if (
            prevOk &&
            !ignoreConflict &&
            !isBackgroundKeySave &&
            activeKeyRef.current === flushedKey &&
            !failedSavesByKeyRef.current.has(flushedKey) &&
            lastSavedJsonRef.current !== null &&
            lastSavedJsonRef.current === JSON.stringify(dataRef.current)
          ) {
            return true;
          }
        } catch {
          // ignore previous errors
        }
      }

      if (cancelledKeysRef.current.has(flushedKey)) {
        return false;
      }

      const storedFailed = failedSavesByKeyRef.current.get(flushedKey);
      const payloadData =
        overrideData !== undefined
          ? overrideData
          : activeKeyRef.current === flushedKey
          ? lastSavedJsonRef.current !== null &&
            lastSavedJsonRef.current === JSON.stringify(dataRef.current) &&
            storedFailed
            ? storedFailed.data
            : dataRef.current
          : latestDataByIdRef.current.get(flushedKey) ?? storedFailed?.data ?? dataRef.current;

      const jsonToSave = JSON.stringify(payloadData);
      const versionToSend = ignoreConflict
        ? null
        : overrideExpectedVersion !== undefined
        ? overrideExpectedVersion
        : activeKeyRef.current === flushedKey
        ? expectedVersionRef.current
        : expectedVersionByKeyRef.current.get(flushedKey) ?? null;

      const saveOperation = (async (): Promise<boolean> => {
        if (isMountedRef.current && activeKeyRef.current === flushedKey) {
          setStatus('saving');
          setError(null);
        }

        try {
          const res = await onSaveRef.current({
            id: flushedKey,
            data: payloadData,
            expectedVersion: versionToSend,
          });

          if (cancelledKeysRef.current.has(flushedKey)) {
            return false;
          }

          const resolvedSavedJson =
            res && typeof res === 'object' && 'savedData' in res && res.savedData !== undefined
              ? JSON.stringify(res.savedData)
              : jsonToSave;
          const savedAtNow = new Date();

          failedSavesByKeyRef.current.delete(flushedKey);
          lastSavedJsonByKeyRef.current.set(flushedKey, resolvedSavedJson);
          lastSavedAtByKeyRef.current.set(flushedKey, savedAtNow);
          if (res?.version !== undefined && res.version !== null) {
            expectedVersionByKeyRef.current.set(flushedKey, res.version);
          }

          if (!isMountedRef.current) return true;

          // Only update visible UI status if flushedKey is STILL the currently selected item!
          if (activeKeyRef.current === flushedKey) {
            lastSavedJsonRef.current = resolvedSavedJson;
            if (
              pendingSaveTimerRef.current &&
              pendingTimerKeyRef.current === flushedKey &&
              lastSavedJsonRef.current === JSON.stringify(dataRef.current)
            ) {
              clearTimeout(pendingSaveTimerRef.current);
              pendingSaveTimerRef.current = null;
              pendingTimerKeyRef.current = null;
            }
            if (res?.version !== undefined && res.version !== null) {
              expectedVersionRef.current = res.version;
            }
            setLastSavedAt(savedAtNow);
            setError(null);
            setStatus('saved');
          }
          return true;
        } catch (err: unknown) {
          if (cancelledKeysRef.current.has(flushedKey)) {
            return false;
          }
          if (!isMountedRef.current) return false;

          const errorObj = err instanceof Error ? err : new Error(String(err));
          const is409 =
            (err as { status?: number })?.status === 409 ||
            (err as { statusCode?: number })?.statusCode === 409 ||
            errorObj.message.includes('409') ||
            errorObj.name === 'ConflictError';

          failedSavesByKeyRef.current.set(flushedKey, {
            data: payloadData,
            expectedVersion: versionToSend,
            error: errorObj,
            isConflict: is409,
          });

          // Prevent cross-item contamination: only update status/error if flushedKey is still active!
          if (activeKeyRef.current === flushedKey) {
            if (is409) {
              setStatus('conflict');
              const serverVersion = (err as { serverVersion?: number | string })?.serverVersion;
              onConflictRef.current?.(serverVersion);
            } else {
              setStatus('error');
              setError(errorObj);
              onErrorRef.current?.(errorObj);
            }
          }
          return false;
        } finally {
          inFlightPromiseRef.current = null;
        }
      })();

      inFlightPromiseRef.current = saveOperation;
      return saveOperation;
    },
    []
  );

  // Manual flush method (retries active key's pending or failed payload)
  const flush = useCallback(async (): Promise<boolean> => {
    if (pendingSaveTimerRef.current) {
      clearTimeout(pendingSaveTimerRef.current);
      pendingSaveTimerRef.current = null;
      pendingTimerKeyRef.current = null;
    }
    return executeSave(false);
  }, [executeSave]);

  // Mark clean (e.g. after initial fetch)
  const markClean = useCallback(() => {
    const cleanJson = JSON.stringify(dataRef.current);
    lastSavedJsonRef.current = cleanJson;
    if (activeKeyRef.current) {
      failedSavesByKeyRef.current.delete(activeKeyRef.current);
      lastSavedJsonByKeyRef.current.set(activeKeyRef.current, cleanJson);
    }
    if (isMountedRef.current) {
      setStatus('saved');
      setError(null);
    }
  }, []);

  // Cancel pending/queued/auto-flush save for targetKey (or active key if omitted)
  const cancelPending = useCallback((targetKey?: string) => {
    const keyToCancel = targetKey ?? activeKeyRef.current;
    if (keyToCancel) {
      cancelledKeysRef.current.add(keyToCancel);
      failedSavesByKeyRef.current.delete(keyToCancel);
      latestDataByIdRef.current.delete(keyToCancel);
    }
    if (!targetKey || targetKey === pendingTimerKeyRef.current || targetKey === activeKeyRef.current) {
      if (pendingSaveTimerRef.current) {
        clearTimeout(pendingSaveTimerRef.current);
        pendingSaveTimerRef.current = null;
        pendingTimerKeyRef.current = null;
      }
    }
    if (!targetKey || targetKey === activeKeyRef.current) {
      lastSavedJsonRef.current = JSON.stringify(dataRef.current);
      if (isMountedRef.current) {
        setStatus('idle');
        setError(null);
      }
    }
  }, []);

  // Re-enable saving and mark dirty for targetKey (e.g. after Undo Delete)
  const markDirty = useCallback(
    (targetKey?: string) => {
      const keyToMark = targetKey ?? activeKeyRef.current;
      if (keyToMark) {
        cancelledKeysRef.current.delete(keyToMark);
      }
      if (!targetKey || targetKey === activeKeyRef.current) {
        if (activeKeyRef.current) {
          latestDataByIdRef.current.set(activeKeyRef.current, dataRef.current);
        }
        lastSavedJsonRef.current = '';
        if (isMountedRef.current) {
          setStatus('dirty');
          setError(null);
        }
        if (pendingSaveTimerRef.current) {
          clearTimeout(pendingSaveTimerRef.current);
          pendingSaveTimerRef.current = null;
          pendingTimerKeyRef.current = null;
        }
        if (readyRef.current && enabledRef.current && activeKeyRef.current) {
          const scheduledKey = activeKeyRef.current;
          pendingTimerKeyRef.current = scheduledKey;
          pendingSaveTimerRef.current = setTimeout(() => {
            pendingSaveTimerRef.current = null;
            pendingTimerKeyRef.current = null;
            void executeSave(false, scheduledKey);
          }, debounceMsRef.current);
        }
      }
    },
    [executeSave]
  );

  // Overwrite conflict
  const resolveConflictByOverwriting = useCallback(async (): Promise<boolean> => {
    return executeSave(true);
  }, [executeSave]);

  // Track online/offline browser events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      const currentKey = activeKeyRef.current;
      if (currentKey && cancelledKeysRef.current.has(currentKey)) {
        return;
      }
      // If there was an unsaved change queued while offline, flush immediately
      if (
        lastSavedJsonRef.current !== null &&
        lastSavedJsonRef.current !== JSON.stringify(dataRef.current)
      ) {
        void executeSave(false);
      } else if (status === 'offline') {
        setStatus('idle');
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setStatus('offline');
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, [executeSave, status]);

  // Initialize baseline snapshot once ready
  useEffect(() => {
    if (ready && lastSavedJsonRef.current === null) {
      lastSavedJsonRef.current = currentJson;
      if (id) {
        lastSavedJsonByKeyRef.current.set(id, currentJson);
      }
    }
  }, [ready, currentJson, id]);

  // Debounce effect on data change
  useEffect(() => {
    if (!ready || !enabled || !id) {
      if (pendingSaveTimerRef.current) {
        clearTimeout(pendingSaveTimerRef.current);
        pendingSaveTimerRef.current = null;
        pendingTimerKeyRef.current = null;
      }
      return;
    }
    if (prevIdRef.current !== id) {
      const prevId = prevIdRef.current;
      if (pendingSaveTimerRef.current) {
        clearTimeout(pendingSaveTimerRef.current);
        pendingSaveTimerRef.current = null;
        pendingTimerKeyRef.current = null;
        if (
          prevId &&
          !cancelledKeysRef.current.has(prevId) &&
          latestDataByIdRef.current.has(prevId)
        ) {
          const prevData = latestDataByIdRef.current.get(prevId)!;
          const prevVer = expectedVersionByKeyRef.current.get(prevId) ?? null;
          void executeSave(false, prevId, prevData, prevVer);
        }
      }
      prevIdRef.current = id;
      const existingFailed = failedSavesByKeyRef.current.get(id);
      if (existingFailed) {
        lastSavedJsonRef.current = lastSavedJsonByKeyRef.current.get(id) ?? currentJson;
        setLastSavedAt(lastSavedAtByKeyRef.current.get(id) ?? null);
        setError(existingFailed.isConflict ? null : existingFailed.error);
        setStatus(existingFailed.isConflict ? 'conflict' : 'error');
      } else {
        lastSavedJsonRef.current = currentJson;
        lastSavedJsonByKeyRef.current.set(id, currentJson);
        setLastSavedAt(lastSavedAtByKeyRef.current.get(id) ?? null);
        setError(null);
        setStatus('idle');
      }
      return;
    }
    if (lastSavedJsonRef.current === null) {
      lastSavedJsonRef.current = currentJson;
      lastSavedJsonByKeyRef.current.set(id, currentJson);
      return;
    }

    if (lastSavedJsonRef.current === currentJson) {
      if (pendingSaveTimerRef.current) {
        clearTimeout(pendingSaveTimerRef.current);
        pendingSaveTimerRef.current = null;
        pendingTimerKeyRef.current = null;
      }
      return;
    }

    // Data has genuinely changed on the active key -> lift any prior cancellation (e.g., after Undo Delete)
    cancelledKeysRef.current.delete(id);
    latestDataByIdRef.current.set(id, dataRef.current);

    const currentlyOnline =
      typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
        ? navigator.onLine
        : true;

    if (!currentlyOnline) {
      setStatus('offline');
      return;
    }

    setStatus('dirty');

    if (pendingSaveTimerRef.current) {
      clearTimeout(pendingSaveTimerRef.current);
      pendingSaveTimerRef.current = null;
      pendingTimerKeyRef.current = null;
    }

    const scheduledKey = id;
    pendingTimerKeyRef.current = scheduledKey;
    pendingSaveTimerRef.current = setTimeout(() => {
      pendingSaveTimerRef.current = null;
      pendingTimerKeyRef.current = null;
      void executeSave(false, scheduledKey);
    }, debounceMs);
  }, [currentJson, ready, enabled, id, debounceMs, executeSave]);

  // 30s Periodic save fallback if dirty
  useEffect(() => {
    if (!ready || !enabled || intervalMs <= 0) return;

    intervalTimerRef.current = setInterval(() => {
      const currentKey = activeKeyRef.current;
      if (!currentKey || cancelledKeysRef.current.has(currentKey)) return;
      if (
        lastSavedJsonRef.current !== null &&
        lastSavedJsonRef.current !== JSON.stringify(dataRef.current) &&
        !inFlightPromiseRef.current
      ) {
        void executeSave(false, currentKey);
      }
    }, intervalMs);

    return () => {
      if (intervalTimerRef.current) {
        clearInterval(intervalTimerRef.current);
        intervalTimerRef.current = null;
      }
    };
  }, [ready, enabled, intervalMs, executeSave]);

  return {
    status,
    lastSavedAt,
    error,
    dirty: isDirty,
    isOnline,
    flush,
    markClean,
    markDirty,
    cancelPending,
    resolveConflictByOverwriting,
  };
}

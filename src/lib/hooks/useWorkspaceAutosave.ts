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
  }) => Promise<{ version?: number | string | null } | void>;
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
  /** Resolves conflict by forcing a save */
  resolveConflictByOverwriting: () => Promise<boolean>;
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
  const readyRef = useRef<boolean>(ready);
  const enabledRef = useRef<boolean>(enabled);
  const expectedVersionRef = useRef<number | string | null>(expectedVersion);
  const onSaveRef = useRef(onSave);
  const onConflictRef = useRef(onConflict);
  const onErrorRef = useRef(onError);

  const lastSavedJsonRef = useRef<string | null>(null);
  const pendingSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const intervalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inFlightPromiseRef = useRef<Promise<boolean> | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Keep refs up to date
  useEffect(() => {
    dataRef.current = data;
    idRef.current = id;
    readyRef.current = ready;
    enabledRef.current = enabled;
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
  const isDirty = lastSavedJsonRef.current !== null && lastSavedJsonRef.current !== currentJson;

  // Execute the actual save
  const executeSave = useCallback(
    async (ignoreConflict: boolean = false): Promise<boolean> => {
      const currentId = idRef.current;
      if (!currentId || !readyRef.current || !enabledRef.current) {
        return false;
      }

      // Check offline status
      const currentlyOnline = typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
        ? navigator.onLine
        : true;

      if (!currentlyOnline) {
        if (isMountedRef.current) {
          setStatus('offline');
        }
        return false;
      }

      // Concurrency lock: await in-flight save before starting another
      if (inFlightPromiseRef.current) {
        try {
          await inFlightPromiseRef.current;
        } catch {
          // ignore previous errors
        }
      }

      const payloadData = dataRef.current;
      const jsonToSave = JSON.stringify(payloadData);
      const versionToSend = ignoreConflict ? null : expectedVersionRef.current;

      const saveOperation = (async (): Promise<boolean> => {
        if (isMountedRef.current) {
          setStatus('saving');
          setError(null);
        }

        try {
          const res = await onSaveRef.current({
            id: currentId,
            data: payloadData,
            expectedVersion: versionToSend,
          });

          if (!isMountedRef.current) return true;

          lastSavedJsonRef.current = jsonToSave;
          if (res?.version !== undefined && res.version !== null) {
            expectedVersionRef.current = res.version;
          }

          setLastSavedAt(new Date());
          setStatus('saved');
          return true;
        } catch (err: unknown) {
          if (!isMountedRef.current) return false;

          const errorObj = err instanceof Error ? err : new Error(String(err));
          const is409 =
            (err as { status?: number })?.status === 409 ||
            (err as { statusCode?: number })?.statusCode === 409 ||
            errorObj.message.includes('409') ||
            errorObj.name === 'ConflictError';

          if (is409) {
            setStatus('conflict');
            const serverVersion = (err as { serverVersion?: number | string })?.serverVersion;
            onConflictRef.current?.(serverVersion);
          } else {
            setStatus('error');
            setError(errorObj);
            onErrorRef.current?.(errorObj);
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

  // Manual flush method
  const flush = useCallback(async (): Promise<boolean> => {
    if (pendingSaveTimerRef.current) {
      clearTimeout(pendingSaveTimerRef.current);
      pendingSaveTimerRef.current = null;
    }
    return executeSave(false);
  }, [executeSave]);

  // Mark clean (e.g. after initial fetch)
  const markClean = useCallback(() => {
    lastSavedJsonRef.current = JSON.stringify(dataRef.current);
    if (isMountedRef.current) {
      setStatus('saved');
      setError(null);
    }
  }, []);

  // Overwrite conflict
  const resolveConflictByOverwriting = useCallback(async (): Promise<boolean> => {
    return executeSave(true);
  }, [executeSave]);

  // Track online/offline browser events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // If there was an unsaved change queued while offline, flush immediately
      if (lastSavedJsonRef.current !== null && lastSavedJsonRef.current !== JSON.stringify(dataRef.current)) {
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
    }
  }, [ready, currentJson]);

  // Debounce effect on data change
  useEffect(() => {
    if (!ready || !enabled || !id) return;
    if (lastSavedJsonRef.current === null) {
      lastSavedJsonRef.current = currentJson;
      return;
    }

    if (lastSavedJsonRef.current === currentJson) {
      return;
    }

    // Data has changed
    const currentlyOnline = typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true;

    if (!currentlyOnline) {
      setStatus('offline');
      return;
    }

    setStatus('dirty');

    if (pendingSaveTimerRef.current) {
      clearTimeout(pendingSaveTimerRef.current);
    }

    pendingSaveTimerRef.current = setTimeout(() => {
      pendingSaveTimerRef.current = null;
      void executeSave(false);
    }, debounceMs);

    return () => {
      if (pendingSaveTimerRef.current) {
        clearTimeout(pendingSaveTimerRef.current);
        pendingSaveTimerRef.current = null;
      }
    };
  }, [currentJson, ready, enabled, id, debounceMs, executeSave]);

  // 30s Periodic save fallback if dirty
  useEffect(() => {
    if (!ready || !enabled || intervalMs <= 0) return;

    intervalTimerRef.current = setInterval(() => {
      if (
        lastSavedJsonRef.current !== null &&
        lastSavedJsonRef.current !== JSON.stringify(dataRef.current) &&
        !inFlightPromiseRef.current
      ) {
        void executeSave(false);
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
    resolveConflictByOverwriting,
  };
}

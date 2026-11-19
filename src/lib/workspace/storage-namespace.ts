/**
 * @file src/lib/workspace/storage-namespace.ts
 * @description Shared-PC tenant isolation & logout purge utilities for broker workspace client storage.
 */
import { createClient } from "@/lib/supabase/client";

export const LAST_ACTIVE_USER_KEY = "credeal-active-broker-uid";
export const PURGE_STORAGE_COOKIE_NAME = "credeal_purge_storage";

const PRESERVED_UI_STORAGE_KEYS = new Set<string>([
  "credeal-workspace-font-scale-v1",
  "credeal-workspace-col-widths-v1",
  "credeal_remembered_email",
  "credeal-ws-list-view-v1",
  "credeal-broker-paper-mode",
]);

const SENSITIVE_KEY_PREFIXES: readonly string[] = [
  "credeal-w-dealcards",
  "credeal-w-im",
  "credeal-w-inbox",
  "credeal-magazine-draft",
  "magazine-editor-draft",
  "cre-newsletter-",
  "cre_im_draft_",
  "ideal_personas_",
  "kakao_text_",
  "cre_qa_",
];

export function normalizeWorkspaceUserId(userId?: string | null): string | null {
  if (typeof userId !== "string") return null;
  const trimmed = userId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function scopedWorkspaceStorageKey(
  baseKey: string,
  userId?: string | null
): string {
  const uid = normalizeWorkspaceUserId(userId);
  return uid ? `${baseKey}:u:${uid}` : `${baseKey}:anon`;
}

const QA_STORAGE_KEY_PATTERN = /^credeal[_-]qa[_-]/i;

const SENSITIVE_EXACT_STORAGE_KEYS = new Set<string>([
  LAST_ACTIVE_USER_KEY,
  "credeal_qa_mode",
  "credeal_qa_pin_docked",
  "credeal-qa-pin-active",
  "credeal-qa-pin-role",
  "credeal-qa-signoff-session-v1",
  "dealcard_recent_searches",
  "memo_transfer",
]);

export function isSensitiveWorkspaceStorageKey(key: string): boolean {
  if (!key || PRESERVED_UI_STORAGE_KEYS.has(key)) return false;
  if (SENSITIVE_EXACT_STORAGE_KEYS.has(key)) return true;
  if (QA_STORAGE_KEY_PATTERN.test(key)) return true;
  return SENSITIVE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function isUnscopedSensitiveDraftKey(key: string): boolean {
  if (!isSensitiveWorkspaceStorageKey(key)) return false;
  if (key === LAST_ACTIVE_USER_KEY) return false;
  return !key.includes(":u:");
}

function resolveDefaultLocalStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function resolveDefaultSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isDefaultBrowserLocalStorage(storage?: Storage): boolean {
  if (!storage) return true;
  if (typeof window === "undefined") return false;
  try {
    return storage === window.localStorage;
  } catch {
    return false;
  }
}

function readCookieValue(name: string): string | null {
  if (typeof document === "undefined" || typeof document.cookie !== "string") {
    return null;
  }
  const cookies = document.cookie.split(";");
  for (const rawPart of cookies) {
    const part = rawPart.trim();
    if (!part) continue;
    const eqIdx = part.indexOf("=");
    const key = eqIdx >= 0 ? part.slice(0, eqIdx).trim() : part;
    if (key === name) {
      return eqIdx >= 0 ? decodeURIComponent(part.slice(eqIdx + 1).trim()) : "";
    }
  }
  return null;
}

function clearBrowserCookie(name: string): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    // Ignore cookie clear errors in restricted environments
  }
}

export function purgeWorkspaceClientStorage(storage?: Storage): void {
  const targetStorage = resolveDefaultLocalStorage(storage);
  if (targetStorage) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < targetStorage.length; i++) {
        const key = targetStorage.key(i);
        if (key && isSensitiveWorkspaceStorageKey(key)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        targetStorage.removeItem(key);
      }
    } catch {
      // Ignore storage iteration/removal failures
    }
  }

  if (isDefaultBrowserLocalStorage(storage)) {
    const sessionStore = resolveDefaultSessionStorage();
    if (sessionStore) {
      try {
        const sessionKeysToRemove: string[] = [];
        for (let i = 0; i < sessionStore.length; i++) {
          const key = sessionStore.key(i);
          if (key && isSensitiveWorkspaceStorageKey(key)) {
            sessionKeysToRemove.push(key);
          }
        }
        for (const key of sessionKeysToRemove) {
          sessionStore.removeItem(key);
        }
      } catch {
        // Ignore sessionStorage failures
      }
    }
  }
}

export function consumeLogoutPurgeSignal(storage?: Storage): boolean {
  if (!isDefaultBrowserLocalStorage(storage)) return false;
  const cookieVal = readCookieValue(PURGE_STORAGE_COOKIE_NAME);
  if (!cookieVal) return false;
  clearBrowserCookie(PURGE_STORAGE_COOKIE_NAME);
  purgeWorkspaceClientStorage(storage);
  return true;
}

function extractRecordOwnerId(record: unknown): string | null {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const obj = record as Record<string, unknown>;
  return (
    normalizeWorkspaceUserId(
      typeof obj.ownerUserId === "string" ? obj.ownerUserId : null
    ) ??
    normalizeWorkspaceUserId(
      typeof obj.brokerId === "string" ? obj.brokerId : null
    )
  );
}

function isLegacyEnvelope<T>(
  parsed: Record<string, unknown>,
  fallback: T
): parsed is { ownerUserId?: string; brokerId?: string; data: T } {
  if (!("data" in parsed)) return false;
  if (Array.isArray(fallback) && Array.isArray(parsed.data)) return true;
  const allowedKeys = new Set([
    "ownerUserId",
    "brokerId",
    "data",
    "updatedAt",
    "savedAt",
    "__workspaceScopedEnvelope",
  ]);
  const keys = Object.keys(parsed);
  return keys.length > 0 && keys.every((k) => allowedKeys.has(k));
}

export function getLastActiveBrokerUserId(storage?: Storage): string | null {
  consumeLogoutPurgeSignal(storage);
  const targetStorage = resolveDefaultLocalStorage(storage);
  if (!targetStorage) return null;
  try {
    return normalizeWorkspaceUserId(targetStorage.getItem(LAST_ACTIVE_USER_KEY));
  } catch {
    return null;
  }
}

export function syncActiveBrokerSessionStorage(
  userId: string | null | undefined,
  storage?: Storage
): {
  switched: boolean;
  previousUserId: string | null;
  activeUserId: string | null;
} {
  consumeLogoutPurgeSignal(storage);
  const targetStorage = resolveDefaultLocalStorage(storage);
  const uid = normalizeWorkspaceUserId(userId);
  if (!targetStorage) {
    return { switched: false, previousUserId: null, activeUserId: uid };
  }

  let prevUserId: string | null = null;
  try {
    prevUserId = normalizeWorkspaceUserId(
      targetStorage.getItem(LAST_ACTIVE_USER_KEY)
    );
  } catch {
    prevUserId = null;
  }

  if (!uid) {
    return { switched: false, previousUserId: prevUserId, activeUserId: null };
  }

  const switched = Boolean(prevUserId && prevUserId !== uid);

  try {
    if (switched) {
      const legacyKeys: string[] = [];
      for (let i = 0; i < targetStorage.length; i++) {
        const key = targetStorage.key(i);
        if (key && isUnscopedSensitiveDraftKey(key)) {
          legacyKeys.push(key);
        }
      }
      for (const key of legacyKeys) {
        targetStorage.removeItem(key);
      }

      if (isDefaultBrowserLocalStorage(storage)) {
        const sessionStore = resolveDefaultSessionStorage();
        if (sessionStore) {
          const sessionToRemove: string[] = [];
          for (let i = 0; i < sessionStore.length; i++) {
            const sk = sessionStore.key(i);
            if (
              sk &&
              isSensitiveWorkspaceStorageKey(sk) &&
              (!sk.includes(":u:") ||
                (prevUserId ? sk.endsWith(`:u:${prevUserId}`) : false))
            ) {
              sessionToRemove.push(sk);
            }
          }
          for (const sk of sessionToRemove) {
            sessionStore.removeItem(sk);
          }
        }
      }
    } else {
      // Even without a recorded prevUserId, drop any un-scoped legacy key explicitly owned by another user
      const foreignLegacyKeys: string[] = [];
      for (let i = 0; i < targetStorage.length; i++) {
        const key = targetStorage.key(i);
        if (!key || !isUnscopedSensitiveDraftKey(key)) continue;
        const raw = targetStorage.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as unknown;
          const ownerId = extractRecordOwnerId(parsed);
          if (ownerId && ownerId !== uid) {
            foreignLegacyKeys.push(key);
          }
        } catch {
          // Ignore malformed legacy entry
        }
      }
      for (const key of foreignLegacyKeys) {
        targetStorage.removeItem(key);
      }
    }

    targetStorage.setItem(LAST_ACTIVE_USER_KEY, uid);
  } catch {
    // Ignore storage write failures
  }

  return { switched, previousUserId: prevUserId, activeUserId: uid };
}

export function readScopedWorkspaceJson<T>(
  baseKey: string,
  userId: string | null | undefined,
  fallback: T,
  storage?: Storage
): T {
  consumeLogoutPurgeSignal(storage);
  const targetStorage = resolveDefaultLocalStorage(storage);
  if (!targetStorage) return fallback;

  const uid = normalizeWorkspaceUserId(userId);
  const scopedKey = scopedWorkspaceStorageKey(baseKey, uid);

  try {
    const rawScoped = targetStorage.getItem(scopedKey);
    if (rawScoped !== null) {
      const parsedScoped = JSON.parse(rawScoped) as unknown;
      if (
        parsedScoped &&
        typeof parsedScoped === "object" &&
        !Array.isArray(parsedScoped) &&
        isLegacyEnvelope(parsedScoped as Record<string, unknown>, fallback)
      ) {
        return (parsedScoped as { data: T }).data;
      }
      return parsedScoped as T;
    }
  } catch {
    // Fall through to legacy check or fallback
  }

  // Legacy migration safety: ONLY inspect legacy baseKey when scopedKey is absent
  try {
    const rawLegacy = targetStorage.getItem(baseKey);
    if (rawLegacy === null) return fallback;

    const parsedLegacy = JSON.parse(rawLegacy) as unknown;

    // Anonymous / unit-test mode without userId: preserve backward compatibility with legacy test seeds
    if (!uid) {
      if (
        parsedLegacy &&
        typeof parsedLegacy === "object" &&
        !Array.isArray(parsedLegacy) &&
        isLegacyEnvelope(parsedLegacy as Record<string, unknown>, fallback)
      ) {
        return (parsedLegacy as { data: T }).data;
      }
      return parsedLegacy as T;
    }

    // Authenticated user mode: migrate ONLY when ownership explicitly matches uid
    if (Array.isArray(parsedLegacy)) {
      const ownedItems = parsedLegacy.filter(
        (entry) => extractRecordOwnerId(entry) === uid
      );
      if (ownedItems.length === 0) {
        return fallback;
      }
      const migrated = ownedItems as unknown as T;
      try {
        targetStorage.setItem(scopedKey, JSON.stringify(migrated));
        if (ownedItems.length === parsedLegacy.length) {
          targetStorage.removeItem(baseKey);
        }
      } catch {
        // Ignore quota errors during migration
      }
      return migrated;
    }

    if (parsedLegacy && typeof parsedLegacy === "object") {
      const record = parsedLegacy as Record<string, unknown>;
      const ownerId = extractRecordOwnerId(record);
      if (ownerId !== uid) {
        return fallback;
      }
      const value = isLegacyEnvelope(record, fallback)
        ? (record.data as T)
        : (parsedLegacy as T);
      try {
        targetStorage.setItem(scopedKey, JSON.stringify(value));
        targetStorage.removeItem(baseKey);
      } catch {
        // Ignore quota errors during migration
      }
      return value;
    }

    return fallback;
  } catch {
    return fallback;
  }
}

export function writeScopedWorkspaceJson<T>(
  baseKey: string,
  userId: string | null | undefined,
  data: T,
  options?: { storage?: Storage; rethrowQuotaError?: boolean }
): void {
  consumeLogoutPurgeSignal(options?.storage);
  const targetStorage = resolveDefaultLocalStorage(options?.storage);
  if (!targetStorage) return;

  const uid = normalizeWorkspaceUserId(userId);
  const scopedKey = scopedWorkspaceStorageKey(baseKey, uid);
  const serialized = JSON.stringify(data);

  try {
    targetStorage.setItem(scopedKey, serialized);
    if (uid) {
      // Remove raw un-namespaced and anonymous keys so stale shared-PC legacy data cannot linger
      targetStorage.removeItem(baseKey);
      targetStorage.removeItem(`${baseKey}:anon`);
    } else {
      // Pure anonymous unit-test compatibility: mirror to raw baseKey only when no real user session is active
      const lastActive = normalizeWorkspaceUserId(
        targetStorage.getItem(LAST_ACTIVE_USER_KEY)
      );
      if (!lastActive) {
        targetStorage.setItem(baseKey, serialized);
      }
    }
  } catch (err) {
    if (options?.rethrowQuotaError) {
      throw err;
    }
  }
}

export function removeScopedWorkspaceKey(
  baseKey: string,
  userId?: string | null,
  storage?: Storage
): void {
  const targetStorage = resolveDefaultLocalStorage(storage);
  if (!targetStorage) return;
  const uid = normalizeWorkspaceUserId(userId);
  const scopedKey = scopedWorkspaceStorageKey(baseKey, uid);
  try {
    targetStorage.removeItem(scopedKey);
    if (uid) {
      const rawLegacy = targetStorage.getItem(baseKey);
      if (rawLegacy) {
        try {
          const parsed = JSON.parse(rawLegacy) as unknown;
          const ownerId = extractRecordOwnerId(parsed);
          if (!ownerId || ownerId === uid) {
            targetStorage.removeItem(baseKey);
          }
        } catch {
          targetStorage.removeItem(baseKey);
        }
      }
    } else {
      targetStorage.removeItem(baseKey);
    }
  } catch {
    // Ignore storage removal errors
  }
}

export function extractWorkspaceResponseUserId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const direct =
    normalizeWorkspaceUserId(typeof obj.userId === "string" ? obj.userId : null) ??
    normalizeWorkspaceUserId(
      typeof obj.viewerBrokerId === "string" ? obj.viewerBrokerId : null
    ) ??
    normalizeWorkspaceUserId(typeof obj.ownerId === "string" ? obj.ownerId : null) ??
    normalizeWorkspaceUserId(typeof obj.brokerId === "string" ? obj.brokerId : null);
  if (direct) return direct;

  if (obj.brokerProfile && typeof obj.brokerProfile === "object") {
    const bp = obj.brokerProfile as Record<string, unknown>;
    return (
      normalizeWorkspaceUserId(typeof bp.userId === "string" ? bp.userId : null) ??
      normalizeWorkspaceUserId(typeof bp.id === "string" ? bp.id : null)
    );
  }
  return null;
}

function hasSupabaseBrowserToken(): boolean {
  try {
    if (typeof document !== "undefined" && typeof document.cookie === "string") {
      if (document.cookie.includes("sb-")) return true;
    }
    if (typeof window !== "undefined" && window.localStorage) {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith("sb-")) return true;
      }
    }
  } catch {
    // Ignore restricted cookie/storage access
  }
  return false;
}

export async function resolveBrowserBrokerUserId(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const supabase = createClient() as {
      auth?: {
        getUser?: () => Promise<{ data?: { user?: { id?: string | null } | null } }>;
        getSession?: unknown;
      };
    };
    const isRealSsrClient = typeof supabase?.auth?.getSession === "function";
    if (isRealSsrClient && !hasSupabaseBrowserToken()) {
      return null;
    }
    if (typeof supabase?.auth?.getUser !== "function") {
      return null;
    }
    const { data } = await supabase.auth.getUser();
    return normalizeWorkspaceUserId(data?.user?.id ?? null);
  } catch {
    return null;
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  consumeLogoutPurgeSignal();
}

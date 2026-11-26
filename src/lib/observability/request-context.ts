import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import * as loggerModule from '@/lib/logger';

export interface RequestContextState {
  requestId: string;
  route?: string;
  method?: string;
  userId?: string;
  startedAt: number;
}

const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const VERCEL_REGION_PREFIX_RE = /^(?:[A-Za-z0-9_-]+::)+/;

const storage = new AsyncLocalStorage<RequestContextState>();

try {
  if (
    'registerRequestContextProvider' in loggerModule &&
    typeof loggerModule.registerRequestContextProvider === 'function'
  ) {
    loggerModule.registerRequestContextProvider(() => storage.getStore());
  }
} catch {
  // Ignore partial Vitest module mocks that omit registerRequestContextProvider
}

function sanitizeCandidateId(raw: string | null | undefined, stripVercelPrefix = false): string | null {
  if (typeof raw !== 'string') return null;
  let candidate = raw.trim();
  if (!candidate) return null;

  if (stripVercelPrefix) {
    const withoutRegion = candidate.replace(VERCEL_REGION_PREFIX_RE, '').replace(/:+/g, '-');
    if (REQUEST_ID_RE.test(withoutRegion)) {
      return withoutRegion;
    }
    const normalizedColons = candidate.replace(/:+/g, '-');
    if (REQUEST_ID_RE.test(normalizedColons)) {
      return normalizedColons;
    }
    return null;
  }

  return REQUEST_ID_RE.test(candidate) ? candidate : null;
}

export function resolveRequestIdFromHeaders(headers?: Pick<Headers, 'get'> | null): string {
  if (headers && typeof headers.get === 'function') {
    const fromRequestId = sanitizeCandidateId(headers.get('x-request-id'), false);
    if (fromRequestId) {
      return fromRequestId;
    }

    const fromVercelId = sanitizeCandidateId(headers.get('x-vercel-id'), true);
    if (fromVercelId) {
      return fromVercelId;
    }
  }

  return randomUUID();
}

export function runWithRequestContext<T>(
  init: Partial<RequestContextState> & { headers?: Pick<Headers, 'get'> | null },
  fn: (ctx: RequestContextState) => T,
): T {
  const parent = storage.getStore();
  const explicitRequestId = sanitizeCandidateId(init.requestId, false);
  const resolvedRequestId =
    explicitRequestId ??
    parent?.requestId ??
    resolveRequestIdFromHeaders(init.headers);

  const state: RequestContextState = {
    requestId: resolvedRequestId,
    route: init.route ?? parent?.route,
    method: init.method ?? parent?.method,
    userId: init.userId ?? parent?.userId,
    startedAt:
      typeof init.startedAt === 'number'
        ? init.startedAt
        : (parent?.startedAt ?? Date.now()),
  };

  return storage.run(state, () => fn(state));
}

export function getRequestContext(): RequestContextState | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function setRequestContextUser(userId: string): void {
  const store = storage.getStore();
  if (store && typeof userId === 'string' && userId.trim().length > 0) {
    store.userId = userId.trim();
  }
}

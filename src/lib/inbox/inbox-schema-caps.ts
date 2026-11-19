import { isRealProductionRuntime } from '@/lib/env';

export interface InboxSchemaCaps {
  brokerClientsExtended: boolean;
  inquiryStatusCol: boolean;
  subscriberExtended: boolean;
  subscriberBrokerUserId: boolean;
}

const caps: InboxSchemaCaps = {
  brokerClientsExtended: true,
  inquiryStatusCol: true,
  subscriberExtended: true,
  subscriberBrokerUserId: true,
};

function canCacheSchemaCaps(): boolean {
  return isRealProductionRuntime() || !process.env.VITEST;
}

export function getInboxSchemaCaps(): Readonly<InboxSchemaCaps> {
  if (!canCacheSchemaCaps()) {
    return {
      brokerClientsExtended: true,
      inquiryStatusCol: true,
      subscriberExtended: true,
      subscriberBrokerUserId: true,
    };
  }
  return caps;
}

export function markInboxSchemaCapUnsupported(key: keyof InboxSchemaCaps): void {
  if (canCacheSchemaCaps()) {
    caps[key] = false;
  }
}

export function resetInboxSchemaCapsForTests(): void {
  caps.brokerClientsExtended = true;
  caps.inquiryStatusCol = true;
  caps.subscriberExtended = true;
  caps.subscriberBrokerUserId = true;
}

export function isIgnorableSchemaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = String((err as any)?.code || '');
  if (
    code === 'PGRST116' ||
    code === 'PGRST200' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    code === '42P01' ||
    code === '42703'
  ) {
    return true;
  }
  return /relationship|does not exist|schema cache/i.test(String((err as any)?.message || ''));
}

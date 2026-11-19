import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  notifySloAlert,
  recordFunnelEvent,
  redactFunnelPii,
} from '@/lib/observability/funnel-slo';

describe('PR-3 Funnel SLO Telemetry & Critical Webhook Alerts', () => {
  const prevErrHook = process.env.ERROR_WEBHOOK_URL;
  const prevSlackHook = process.env.SLACK_WEBHOOK_URL;

  afterEach(() => {
    vi.restoreAllMocks();
    if (prevErrHook === undefined) delete process.env.ERROR_WEBHOOK_URL;
    else process.env.ERROR_WEBHOOK_URL = prevErrHook;
    if (prevSlackHook === undefined) delete process.env.SLACK_WEBHOOK_URL;
    else process.env.SLACK_WEBHOOK_URL = prevSlackHook;
  });

  it('redacts emails, Korean phone numbers, and bearer/share tokens in metadata and codes', () => {
    expect(redactFunnelPii('contact ceo@company.co.kr or 010-9876-5432 with slk.secret123'))
      .toBe('contact [EMAIL] or [PHONE] with [TOKEN]');

    const ev = recordFunnelEvent({
      funnel: 'inbox_governance',
      outcome: 'ok',
      meta: {
        note: 'sent to buyer@test.kr / +82-10-1111-2222 / Bearer tok_xyz',
        count: 3,
      },
    });

    expect(ev.sanitizedMeta.note).toBe('sent to [EMAIL] / [PHONE] / [TOKEN]');
    expect(ev.sanitizedMeta.count).toBe(3);
  });

  it('skips silently when webhook URL is unset, fires on LOOKUP_FAILED when set, and never throws on network error', async () => {
    delete process.env.ERROR_WEBHOOK_URL;
    delete process.env.SLACK_WEBHOOK_URL;
    expect(await notifySloAlert({ funnel: 'api_availability', code: 'LOOKUP_FAILED', message: 'db down' })).toBe(false);

    process.env.ERROR_WEBHOOK_URL = 'https://hooks.example.test/slo';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));

    recordFunnelEvent({
      funnel: 'api_availability',
      outcome: 'failed',
      code: 'LOOKUP_FAILED',
      entityId: 'bld-1',
      meta: { detail: 'timeout for user@secret.kr' },
    });

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const bodyStr = String(fetchSpy.mock.calls[0][1]?.body || '');
    expect(bodyStr).toContain('LOOKUP_FAILED');
    expect(bodyStr).not.toContain('user@secret.kr');

    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    await expect(
      notifySloAlert({ funnel: 'api_availability', code: 'LOOKUP_FAILED', message: 'fail' })
    ).resolves.toBe(false);
  });
});

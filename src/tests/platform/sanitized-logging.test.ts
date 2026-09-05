import { describe, it, expect } from 'vitest';
import { sanitizePii, PipelineTelemetry } from '@/platform/im-pipeline/telemetry';

describe('Pipeline Telemetry & PII Sanitized Logging (CIM-0205 / PR-M2-05)', () => {
  it('should mask phone numbers, registration numbers and sensitive keys in payloads', () => {
    const rawPayload = {
      dealId: 'deal-123',
      ownerName: '홍길동',
      contactPhone: '010-1234-5678',
      memoExcerpt: '소유자 연락처는 010-9876-5432 이며 즉시 계약 가능함',
      tenant_name: '스타벅스코리아',
      askingPrice: 12000000000,
    };

    const sanitized = sanitizePii(rawPayload) as Record<string, unknown>;

    expect(sanitized.dealId).toBe('deal-123');
    expect(sanitized.askingPrice).toBe(12000000000);
    expect(sanitized.ownerName).toBe('[REDACTED:PII]');
    expect(sanitized.contactPhone).toBe('[REDACTED:PII]');
    expect(sanitized.tenant_name).toBe('[REDACTED:PII]');
    expect(sanitized.memoExcerpt).toBe('소유자 연락처는 [REDACTED:PII] 이며 즉시 계약 가능함');
  });

  it('should record execution duration and status metrics', () => {
    const telemetry = new PipelineTelemetry();

    telemetry.recordMetric({
      dealRunId: 'run-001',
      stage: 'P10',
      durationMs: 1450,
      tokenCount: 420,
      status: 'success',
    });

    const metrics = telemetry.getMetrics();
    expect(metrics.length).toBe(1);
    expect(metrics[0].dealRunId).toBe('run-001');
    expect(metrics[0].stage).toBe('P10');
    expect(metrics[0].durationMs).toBe(1450);
  });
});

/**
 * IM Pipeline Telemetry, Metrics & PII Sanitized Logging
 * @see CREDEAL_IM_MODERNIZATION/08_PHASE_2_RESUMABLE_RUNTIME_AND_HARNESS.md §6
 * Upstream U4 requirement: Event payload strict PII prohibition
 */

const PII_PATTERNS = [
  /01[0-9]-?[0-9]{3,4}-?[0-9]{4}/g, // 한국 휴대전화 번호
  /\b[0-9]{6}-?[1-4][0-9]{6}\b/g,   // 주민등록번호
  /\b[0-9]{3}-?[0-9]{2}-?[0-9]{5}\b/g, // 사업자등록번호
];

export function sanitizePii(input: unknown): unknown {
  if (typeof input === 'string') {
    let sanitized = input;
    for (const pattern of PII_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED:PII]');
    }
    return sanitized;
  }
  if (Array.isArray(input)) {
    return input.map(sanitizePii);
  }
  if (input !== null && typeof input === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('owner') ||
        lowerKey.includes('phone') ||
        lowerKey.includes('resident') ||
        lowerKey.includes('tenant_name')
      ) {
        output[key] = '[REDACTED:PII]';
      } else {
        output[key] = sanitizePii(value);
      }
    }
    return output;
  }
  return input;
}

export interface PipelineMetric {
  dealRunId: string;
  stage: string;
  durationMs: number;
  tokenCount?: number;
  status: 'success' | 'failure';
  timestamp: string;
}

export class PipelineTelemetry {
  private metrics: PipelineMetric[] = [];

  recordMetric(metric: Omit<PipelineMetric, 'timestamp'>): void {
    this.metrics.push({
      ...metric,
      timestamp: new Date().toISOString(),
    });
  }

  getMetrics(): PipelineMetric[] {
    return [...this.metrics];
  }

  logEvent(level: 'info' | 'warn' | 'error', message: string, payload: Record<string, unknown>): void {
    const sanitizedPayload = sanitizePii(payload);
    const logEntry = {
      level,
      message,
      payload: sanitizedPayload,
      timestamp: new Date().toISOString(),
    };
    // Structured JSON log output
    if (level === 'error') {
      console.error(JSON.stringify(logEntry));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }
  }
}

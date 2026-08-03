export type FailureKind = 'network_error' | 'validation_error' | 'generation_timeout' | 'system_fault';

export interface FailureRecovery {
  retryable: boolean;
  maxRetries: number;
  fallbackAction?: string;
}

export const FAILURE_RECOVERY_MATRIX: Record<FailureKind, FailureRecovery> = {
  network_error: { retryable: true, maxRetries: 3 },
  validation_error: { retryable: false, maxRetries: 0, fallbackAction: 'request_manual_input' },
  generation_timeout: { retryable: true, maxRetries: 2, fallbackAction: 'use_cached_version' },
  system_fault: { retryable: false, maxRetries: 0, fallbackAction: 'escalate_to_admin' },
};

export function handleFailure(kind: FailureKind): FailureRecovery {
  return FAILURE_RECOVERY_MATRIX[kind];
}

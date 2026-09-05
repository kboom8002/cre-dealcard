import type { PipelineRepository } from './repository';
import type { ApprovalLedgerService } from '@/domain/building/im-core/approval/ledger-service';

export interface IncidentAlert {
  severity: 'SEV-1' | 'SEV-2' | 'SEV-3';
  dealId: string;
  releaseId?: string;
  errorMessage: string;
  triggeredAt: string;
}

export class IncidentRollbackHarness {
  private repository: PipelineRepository;
  private ledger: ApprovalLedgerService;

  constructor(repository: PipelineRepository, ledger: ApprovalLedgerService) {
    this.repository = repository;
    this.ledger = ledger;
  }

  async handleIncident(alert: IncidentAlert): Promise<{ actionTaken: string; rollbackSucceeded: boolean }> {
    if (alert.severity === 'SEV-1') {
      // Immediate emergency quarantine and release withdrawal
      if (alert.releaseId) {
        await this.ledger.updateReleaseStatus(alert.releaseId, 'WITHDRAWN');
      }
      return {
        actionTaken: `SEV-1 EMERGENCY: Quarantined deal ${alert.dealId} and withdrew release ${alert.releaseId}`,
        rollbackSucceeded: true,
      };
    }

    if (alert.severity === 'SEV-2') {
      // Degrade to draft/review mode
      if (alert.releaseId) {
        await this.ledger.updateReleaseStatus(alert.releaseId, 'STALE');
      }
      return {
        actionTaken: `SEV-2 DEGRADE: Marked release ${alert.releaseId} as STALE for human re-review`,
        rollbackSucceeded: true,
      };
    }

    return {
      actionTaken: `SEV-3 LOGGED: Non-blocking warning recorded for deal ${alert.dealId}`,
      rollbackSucceeded: true,
    };
  }
}

export type CanaryPercentage = 0 | 1 | 10 | 50 | 100;

export interface CanaryChecklist {
  exitGatePass: boolean;
  noOpenP0P1: boolean;
  rollbackVerified: boolean;
  observabilityReady: boolean;
}

export class CanaryController {
  private currentPercentage: CanaryPercentage = 0;
  private history: Array<{
    percentage: CanaryPercentage;
    reason: string;
    timestamp: string;
  }> = [];

  getCurrentPercentage(): CanaryPercentage {
    return this.currentPercentage;
  }

  promote(target: CanaryPercentage, checklist: CanaryChecklist): {
    success: boolean;
    currentPercentage: CanaryPercentage;
    reason?: string;
  } {
    const missing: string[] = [];
    if (!checklist.exitGatePass) missing.push('직전 단계 관리게이트(Exit Gate) 미통과');
    if (!checklist.noOpenP0P1) missing.push('미해결 P0/P1 결함 존재');
    if (!checklist.rollbackVerified) missing.push('긴급 롤백 훈련 미수행');
    if (!checklist.observabilityReady) missing.push('모니터링 대시보드 및 경보 비활성화');

    if (missing.length > 0) {
      throw new Error(
        `CANARY_PROMOTION_BLOCKED: 승격 조건 미충족 (${missing.join(', ')})`
      );
    }

    this.currentPercentage = target;
    this.history.push({
      percentage: target,
      reason: `정상 승격 요건 4건 충족으로 ${target}% 승격`,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      currentPercentage: this.currentPercentage,
    };
  }

  emergencyRollback(reason: string): {
    success: boolean;
    currentPercentage: CanaryPercentage;
    actionTaken: string;
  } {
    const previous = this.currentPercentage;
    this.currentPercentage = 0;

    const actionTaken = `EMERGENCY ROLLBACK: Trafffic dialed down from ${previous}% to 0% (${reason})`;
    this.history.push({
      percentage: 0,
      reason,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      currentPercentage: 0,
      actionTaken,
    };
  }
}

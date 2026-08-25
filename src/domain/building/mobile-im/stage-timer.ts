/**
 * @file stage-timer.ts
 * @description IM 생성 글로벌 타임 버짓 및 보호선 관리 (GENERATION_PERF_SPEC.md §3)
 * Vercel 120초 실행 제한 방어 및 구간별 타임아웃 제어
 */

export interface StageTimerLimits {
  softLimit?: number; // 90초: 선택 섹션 생성 중단
  hardLimit?: number; // 105초: 확보된 섹션으로 즉시 렌더
  killLimit?: number; // 120초: 안전 한계선
}

export class StageTimer {
  private startTime: number;
  public readonly softLimit: number;
  public readonly hardLimit: number;
  public readonly killLimit: number;

  constructor(limits?: StageTimerLimits) {
    this.startTime = Date.now();
    this.softLimit = limits?.softLimit ?? 90_000;
    this.hardLimit = limits?.hardLimit ?? 105_000;
    this.killLimit = limits?.killLimit ?? 120_000;
  }

  /** 시작 시점부터 경과된 시간 (ms) */
  elapsedMs(): number {
    return Date.now() - this.startTime;
  }

  /** 선택적 섹션 생성을 중단해야 하는지 (90초 경과) */
  shouldAbortOptional(): boolean {
    return this.elapsedMs() >= this.softLimit;
  }

  /** 추가 LLM 호출을 중단하고 확보된 데이터로 강제 렌더링해야 하는지 (105초 경과) */
  shouldForceRender(): boolean {
    return this.elapsedMs() >= this.hardLimit;
  }

  /** 전체 작업이 타임아웃 임계에 도달했는지 (120초 경과) */
  shouldDiscard(): boolean {
    return this.elapsedMs() >= this.killLimit;
  }

  /** 하드 리밋까지 남은 시간 (ms) */
  getRemainingMs(): number {
    return Math.max(0, this.hardLimit - this.elapsedMs());
  }

  /** 리셋 (테스트용) */
  reset(): void {
    this.startTime = Date.now();
  }
}

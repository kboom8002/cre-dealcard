/**
 * @file numerical-anchors.ts
 * @description 섹션 간 수치 일관성 보장을 위한 정형 앵커 객체 (GENERATION_PERF_SPEC.md §5)
 * 선행 스테이지에서 확정된 수치(가격, 면적, 임대료 등)를 후행 스테이지로 안전하게 전파
 */

import type { CrossValidatorAnchors } from './cross-validator';

export interface AnchorEntry {
  value: number;
  source: string; // 섹션 타입 또는 출처
  stage: number;  // 확정된 스테이지 번호
  unit?: string;  // 단위 (원, ㎡, %, 등)
}

export class NumericalAnchors {
  toCrossValidatorAnchors(): CrossValidatorAnchors {
    const all = this.getAll();
    return {
      totalAreaSqm: all['totalAreaSqm'],
      vacancyPct: all['vacancyPct'],
      monthlyRentKrw: all['monthlyRentTotalKrw'] ?? all['monthlyRentKrw'],
      capRateBase: all['capRateBase'] ?? all['capRate'],
      buildingAge: all['buildingAge'],
      stationDistance: all['stationDistance'],
      landCostKrw: all['landCostKrw'],
      constructionCostKrw: all['constructionCostKrw'],
      totalProjectCostKrw: all['totalProjectCostKrw'],
      adrKrw: all['adrKrw'],
      occPct: all['occPct'],
      revparKrw: all['revparKrw'],
      pricePerPyeong: all['pricePerPyeong'],
      askingPriceKrw: all['askingPriceKrw'],
    };
  }

  private values: Map<string, AnchorEntry> = new Map();
  public conflictCount: number = 0;
  public conflicts: Array<{ key: string; existing: AnchorEntry; attempted: { value: number; source: string; stage: number } }> = [];

  constructor(initialValues?: Record<string, number>) {
    if (initialValues) {
      for (const [k, v] of Object.entries(initialValues)) {
        if (typeof v === 'number' && !isNaN(v)) {
          this.set(k, v, 'initial_context', 0);
        }
      }
    }
  }

  /**
   * 앵커 값을 등록합니다.
   * 불변 원칙: 선행 확정값을 유지하며, 충돌 시 경고를 기록하고 덮어쓰지 않습니다.
   */
  set(key: string, value: number, source: string, stage: number, unit?: string): void {
    if (typeof value !== 'number' || isNaN(value)) return;

    if (this.values.has(key)) {
      const existing = this.values.get(key)!;
      // 상대 오차 1% 이내면 동일한 값으로 간주
      const relativeDiff = existing.value !== 0 ? Math.abs(existing.value - value) / Math.abs(existing.value) : Math.abs(value);
      if (relativeDiff > 0.01) {
        this.conflictCount++;
        this.conflicts.push({
          key,
          existing: { ...existing },
          attempted: { value, source, stage },
        });
        console.warn(
          `[NumericalAnchors] 수치 충돌 감지 [${key}]: 기존값=${existing.value} (${existing.source}, Stage ${existing.stage}) vs 시도값=${value} (${source}, Stage ${stage})`
        );
        return; // 선행 확정값 유지
      }
      return;
    }

    this.values.set(key, { value, source, stage, unit });
  }

  get(key: string): number | undefined {
    return this.values.get(key)?.value;
  }

  getEntry(key: string): AnchorEntry | undefined {
    return this.values.get(key);
  }

  has(key: string): boolean {
    return this.values.has(key);
  }

  getAll(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [k, v] of this.values.entries()) {
      result[k] = v.value;
    }
    return result;
  }

  /**
   * 섹션 결과에서 앵커 수치를 추출하여 병합
   */
  mergeFrom(sectionResult: {
    anchors?: Record<string, number>;
    section_type: string;
    stage?: number;
  }): void {
    if (!sectionResult.anchors) return;
    const stage = sectionResult.stage ?? 1;
    for (const [k, v] of Object.entries(sectionResult.anchors)) {
      if (typeof v === 'number' && !isNaN(v)) {
        this.set(k, v, sectionResult.section_type, stage);
      }
    }
  }

  /**
   * 프롬프트 주입용 앵커 텍스트 블록 생성
   */
  toPromptContext(): string {
    if (this.values.size === 0) return '';
    const lines: string[] = ['[확정 수치 앵커 (반드시 아래 수치와 정확히 일치시킬 것)]'];
    for (const [k, v] of this.values.entries()) {
      lines.push(`- ${k}: ${v.value}${v.unit ? ` ${v.unit}` : ''} (출처: ${v.source})`);
    }
    return lines.join('\n');
  }
}

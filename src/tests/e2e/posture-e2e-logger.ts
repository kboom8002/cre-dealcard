/**
 * posture-e2e-logger.ts
 * ──────────────────────
 * 포스처별 E2E 파이프라인 테스트 중간 결과물 로거
 * 각 단계의 입력/출력을 JSON, Markdown, PPTX 파일로 자동 저장하여 추적 및 육안 검수 지원
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = join(process.cwd(), 'docs', 'test', 'stress', 'e2e-outputs');

export interface PipelineStepLog {
  step: string;
  timestamp: string;
  durationMs: number;
  status: 'success' | 'warning' | 'error';
  summary: string;
  details?: Record<string, unknown>;
}

export class PipelineLogger {
  private readonly prefix: string;
  private readonly logs: PipelineStepLog[] = [];
  private stepStart: number = 0;

  constructor(posture: string, caseName: string) {
    this.prefix = `${posture}_${caseName}`;
    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  }

  /** 단계 시작 타이머 */
  startStep(): void {
    this.stepStart = Date.now();
  }

  /** 단계 완료 및 로그 기록 */
  endStep(step: string, status: 'success' | 'warning' | 'error', summary: string, details?: Record<string, unknown>): void {
    const durationMs = this.stepStart > 0 ? Date.now() - this.stepStart : 0;
    this.logs.push({
      step,
      timestamp: new Date().toISOString(),
      durationMs,
      status,
      summary,
      details,
    });
    this.stepStart = 0;
  }

  // ── 단계별 저장 메서드 ───────────────────────────────────────────────

  /** ① SSoT Lite 입력 스냅샷 저장 */
  saveSsotInput(data: Record<string, unknown>): void {
    this.writeJson('ssot_input', data);
  }

  /** ② 바텀시트 보강 데이터 저장 */
  saveSupplemental(data: Record<string, unknown>): void {
    this.writeJson('supplemental', data);
  }

  /** ③ 7섹션 생성 결과 저장 (LLM 원문 포함) */
  saveSections(sections: unknown[]): void {
    this.writeJson('sections', sections);
  }

  /** ④ 재무 산출 결과 저장 */
  saveFinancials(data: Record<string, unknown> | null): void {
    this.writeJson('financials', data ?? { note: 'no financials computed' });
  }

  /** ⑤ HeroCard 메트릭 저장 */
  saveHeroCard(data: Record<string, unknown> | null): void {
    this.writeJson('hero_card', data ?? { note: 'no hero card' });
  }

  /** ⑥ 가드레일/게이트 결과 저장 */
  saveGates(data: Record<string, unknown>): void {
    this.writeJson('gates', data);
  }

  /** ⑦ 최종 MobileIMDocument 저장 */
  saveImDocument(data: Record<string, unknown>): void {
    this.writeJson('im_document', data);
  }

  /** ⑧ PPTX 바이너리 저장 (육안 검수용) */
  savePptx(buffer: Buffer): void {
    const filePath = join(OUTPUT_DIR, `${this.prefix}_basic.pptx`);
    writeFileSync(filePath, buffer);
  }

  /** ⑨ 파이프라인 타임라인 로그 (Markdown) 저장 */
  saveTimelineLog(): void {
    const totalMs = this.logs.reduce((sum, l) => sum + l.durationMs, 0);
    const lines: string[] = [
      `# Pipeline Log: ${this.prefix}`,
      '',
      `**Generated**: ${new Date().toISOString()}`,
      `**Total Duration**: ${(totalMs / 1000).toFixed(1)}s`,
      '',
      '## Step-by-Step Timeline',
      '',
      '| # | Step | Duration | Status | Summary |',
      '|---|------|----------|--------|---------|',
    ];

    this.logs.forEach((log, i) => {
      const statusIcon = log.status === 'success' ? '✅' : log.status === 'warning' ? '⚠️' : '❌';
      lines.push(
        `| ${i + 1} | ${log.step} | ${(log.durationMs / 1000).toFixed(2)}s | ${statusIcon} ${log.status} | ${log.summary} |`
      );
    });

    lines.push('');
    lines.push('## Detailed Metrics');
    lines.push('');

    for (const log of this.logs) {
      if (log.details && Object.keys(log.details).length > 0) {
        lines.push(`### ${log.step}`);
        lines.push('```json');
        lines.push(JSON.stringify(log.details, null, 2));
        lines.push('```');
        lines.push('');
      }
    }

    const filePath = join(OUTPUT_DIR, `${this.prefix}_pipeline_log.md`);
    writeFileSync(filePath, lines.join('\n'), 'utf-8');
  }

  /** 전체 로그 배열 반환 (테스트 assertion용) */
  getLogs(): PipelineStepLog[] {
    return [...this.logs];
  }

  // ── 내부 유틸 ────────────────────────────────────────────────────────

  private writeJson(suffix: string, data: unknown): void {
    const filePath = join(OUTPUT_DIR, `${this.prefix}_${suffix}.json`);
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

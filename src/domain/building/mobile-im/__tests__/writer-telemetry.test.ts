import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordSectionTelemetry } from '../writer-telemetry';
import * as telemetry from '../telemetry';

describe('writer-telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records metrics with correct latency and token counts', () => {
    const spy = vi.spyOn(telemetry, 'recordGenerationMetric').mockResolvedValue(undefined);

    recordSectionTelemetry({
      buildingId: 'b-123',
      sectionType: 'property_overview',
      stageName: 'stage_1_parallel',
      section: {
        section_type: 'property_overview',
        section_order: 1,
        title: '물건 개요',
        markdown: '# Overview',
        confidence: 'high',
        boundary_note: '',
        provenance: [],
        min_tier: 'public',
        _latencyMs: 1200,
        _inputTokens: 350,
        _outputTokens: 420,
      } as any,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      buildingId: 'b-123',
      sectionType: 'property_overview',
      stageName: 'stage_1_parallel',
      latencyMs: 1200,
      inputTokens: 350,
      outputTokens: 420,
      outcome: 'completed',
    });
  });

  it('falls back to 0 when telemetry fields are missing (negative case)', () => {
    const spy = vi.spyOn(telemetry, 'recordGenerationMetric').mockResolvedValue(undefined);

    recordSectionTelemetry({
      buildingId: 'b-456',
      sectionType: 'risk_check',
      stageName: 'stage_2_sequential',
      section: {
        section_type: 'risk_check',
        section_order: 2,
        title: '리스크',
        markdown: '# Risk',
        confidence: 'inferred',
        boundary_note: '',
        provenance: [],
        min_tier: 'public',
      },
    });

    expect(spy).toHaveBeenCalledWith({
      buildingId: 'b-456',
      sectionType: 'risk_check',
      stageName: 'stage_2_sequential',
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      outcome: 'completed',
    });
  });

  it('gracefully handles telemetry recording rejection without throwing', async () => {
    const spy = vi.spyOn(telemetry, 'recordGenerationMetric').mockRejectedValue(new Error('DB unreachable'));
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => {
      recordSectionTelemetry({
        buildingId: 'b-789',
        sectionType: 'closing',
        stageName: 'stage_3_sequential',
      });
    }).not.toThrow();

    await new Promise(r => setTimeout(r, 10));
    expect(consoleWarnSpy).toHaveBeenCalled();
  });
});

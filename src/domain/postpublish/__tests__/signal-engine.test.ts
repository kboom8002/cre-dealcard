import { describe, it, expect } from 'vitest';
import { evaluateSignals } from '../signal-engine';

describe('Signal Engine (S01~S08) Comprehensive Edge Cases', () => {
  it('S01-이탈집중: flags warning when section bounce rate >= 40% with sample >= 10', () => {
    const verdicts = evaluateSignals({
      totalViews: 15,
      distinctDevices: 2,
      publishedDays: 3,
      maxSectionBounceRate: 0.45,
      bouncedSectionKey: 'rentRoll',
    });
    expect(verdicts.some(v => v.code === 'S01' && v.severity === 'warn')).toBe(true);
  });

  it('S01-정상: does not flag when section bounce rate < 40%', () => {
    const verdicts = evaluateSignals({
      totalViews: 15,
      distinctDevices: 2,
      publishedDays: 3,
      maxSectionBounceRate: 0.30,
      bouncedSectionKey: 'rentRoll',
    });
    expect(verdicts.some(v => v.code === 'S01')).toBe(false);
  });

  it('S01-표본부족: does not flag when sample < 10 even if bounce rate is high', () => {
    const verdicts = evaluateSignals({
      totalViews: 5,
      distinctDevices: 2,
      publishedDays: 3,
      maxSectionBounceRate: 0.50,
      bouncedSectionKey: 'rentRoll',
    });
    expect(verdicts.some(v => v.code === 'S01')).toBe(false);
  });

  it('S02-극단체류 (too_short): flags info when price slide dwell < 3s', () => {
    const verdicts = evaluateSignals({
      totalViews: 6,
      distinctDevices: 2,
      publishedDays: 2,
      priceSlideDwellSeconds: 2,
    });
    const s02 = verdicts.find(v => v.code === 'S02');
    expect(s02).toBeDefined();
    expect(s02?.details.type).toBe('too_short');
  });

  it('S02-극단체류 (deep_interest): flags info when price slide dwell > 30s', () => {
    const verdicts = evaluateSignals({
      totalViews: 6,
      distinctDevices: 2,
      publishedDays: 2,
      priceSlideDwellSeconds: 35,
    });
    const s02 = verdicts.find(v => v.code === 'S02');
    expect(s02).toBeDefined();
    expect(s02?.details.type).toBe('deep_interest');
  });

  it('S03-급증: flags warning when share link forwarded >= 3 times', () => {
    const verdicts = evaluateSignals({
      totalViews: 10,
      distinctDevices: 2,
      publishedDays: 3,
      shareLinkForwardCount: 4,
    });
    expect(verdicts.some(v => v.code === 'S03' && v.severity === 'warn')).toBe(true);
  });

  it('S04-전환저하: flags warning when views >= 20 and CTA conversion < 2%', () => {
    const verdicts = evaluateSignals({
      totalViews: 25,
      distinctDevices: 5,
      publishedDays: 5,
      ctaConversionRate: 0.015,
    });
    expect(verdicts.some(v => v.code === 'S04' && v.severity === 'warn')).toBe(true);
  });

  it('S05-모바일이탈: flags info when mobile bounce multiplier >= 2.0 with views >= 15', () => {
    const verdicts = evaluateSignals({
      totalViews: 18,
      distinctDevices: 3,
      publishedDays: 4,
      mobileBounceMultiplier: 2.5,
    });
    expect(verdicts.some(v => v.code === 'S05' && v.severity === 'info')).toBe(true);
  });

  it('S06-렌트롤즉시: flags warning when rent roll dwell < 5s and exit rate >= 50%', () => {
    const verdicts = evaluateSignals({
      totalViews: 12,
      distinctDevices: 3,
      publishedDays: 3,
      rentRollDwellSeconds: 3,
      rentRollImmediateExitRate: 0.55,
    });
    expect(verdicts.some(v => v.code === 'S06' && v.severity === 'warn')).toBe(true);
  });

  it('S07-반복미문의: flags info when repeated views occur without inquiry', () => {
    const verdicts = evaluateSignals({
      totalViews: 5,
      distinctDevices: 1,
      publishedDays: 2,
      repeatedViewsWithoutInquiry: true,
    });
    expect(verdicts.some(v => v.code === 'S07' && v.severity === 'info')).toBe(true);
  });

  it('S08-미열람: flags warning when 0 views recorded after 7 days', () => {
    const verdicts = evaluateSignals({
      totalViews: 0,
      distinctDevices: 0,
      publishedDays: 7,
    });
    expect(verdicts.some(v => v.code === 'S08' && v.severity === 'warn')).toBe(true);
  });

  it('ALL-source: ensures all generated signal verdicts strictly originate from rule engine', () => {
    const verdicts = evaluateSignals({
      totalViews: 30,
      distinctDevices: 5,
      publishedDays: 10,
      maxSectionBounceRate: 0.5,
      bouncedSectionKey: 'pricing',
      priceSlideDwellSeconds: 1,
      shareLinkForwardCount: 5,
      ctaConversionRate: 0.01,
      mobileBounceMultiplier: 3.0,
      rentRollDwellSeconds: 2,
      rentRollImmediateExitRate: 0.6,
      repeatedViewsWithoutInquiry: true,
    });
    expect(verdicts.length).toBeGreaterThanOrEqual(6);
    verdicts.forEach(v => {
      expect(v.source).toBe('rule');
      expect(v.resolved).toBe(false);
      expect(v.detectedAt).toBeDefined();
    });
  });
});

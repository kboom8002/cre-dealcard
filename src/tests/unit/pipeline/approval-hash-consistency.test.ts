import { describe, expect, test } from 'vitest';
import { computeTargetHash } from '@/domain/building/im-core/target-hash';

describe('Approval Hash Consistency', () => {
  test('POSITIVE: 문서의 tier가 명시된 경몄 해싰 tier로 hash가 계산된다', () => {
    const docBody = {
      title: '테스트 빌딨',
      releaseTier: 'decision_im',
      claims: [{ subject: 'asking_price', value: 1000000000, provenance: 'broker', status: 'reconciled' }]
    };

    const hash = computeTargetHash({
      body: docBody,
      releaseTier: docBody.releaseTier,
      policyVersion: '2026-08-31'
    });

    const wrongHash = computeTargetHash({
      body: docBody,
      releaseTier: 'fact_om',
      policyVersion: '2026-08-31'
    });

    expect(hash).not.toBe(wrongHash);
    expect(hash).toMatch(/^sha256:/);
  });

  test('POSITIVE: targetHash 속성읰 계산 시 제외됬다 (Sunhwan 방지)', () => {
    const docBody1 = { title: 'A', releaseTier: 'fact_om' };
    const docBody2 = { title: 'A', releaseTier: 'fact_om', approval_target_hash: 'sha256:123' };

    const hash1 = computeTargetHash({ body: docBody1, releaseTier: 'fact_om', policyVersion: '2026-08-31' });
    const hash2 = computeTargetHash({ body: docBody2, releaseTier: 'fact_om', policyVersion: '2026-08-31' });

    expect(hash1).toBe(hash2);
  });
});
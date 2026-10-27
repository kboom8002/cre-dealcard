/**
 * @file src/tests/im-versioning/approval-hash-immutability.test.ts
 * @description WP-P4a1-04: Three-Tier Hash Matrix & Approval Hash Immutability Test.
 *
 * Asserts:
 * 1. content_hash strictly filters volatile keys (generated_at, approved_at, approval_target_hash, targetHash).
 * 2. Hash remains 100% reproducible before and after approval (zero drift).
 * 3. doc_hash is deterministic across property ordering.
 * 4. file_sha256 matches standard cryptographic SHA-256 on binary buffers.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import {
  computeContentHash,
  computeDocHash,
  computeFileSha256,
  pickContentKeys,
  VOLATILE_CONTENT_KEYS,
} from '@/domain/building/im-core/hashes';

describe('WP-P4a1-04: Three-Tier Hash Matrix & Immutability Verification', () => {
  const baseDocumentBody = {
    title: '강남구 역삼동 빌딩',
    address: '서울특별시 강남구 역삼동 123-45',
    asking_price_manwon: 1500000,
    gross_yield_pct: 4.35,
    sections: [
      { id: '01_cover', title: '표지' },
      { id: '02_summary', title: '요약' },
    ],
    claims: [
      { subject: 'asking_price', value: 150_0000_0000 },
      { subject: 'total_area', value: 1200 },
    ],
  };

  it('Tier 1: computeContentHash strips volatile keys and produces sha256: prefixed string', () => {
    const hash = computeContentHash({
      body: baseDocumentBody,
      releaseTier: 'fact_om',
      policyVersion: '2026-08-31',
    });

    expect(hash.startsWith('sha256:')).toBe(true);
    expect(hash.length).toBe(7 + 64); // 'sha256:' + 64 hex chars
  });

  it('Approval Hash Stability: injecting approved_at, approval_target_hash, or generated_at does NOT alter content_hash', () => {
    const unapprovedHash = computeContentHash({
      body: baseDocumentBody,
      releaseTier: 'fact_om',
      policyVersion: '2026-08-31',
    });

    // Simulate post-approval metadata injection
    const postApprovalBody = {
      ...baseDocumentBody,
      approved_at: '2026-10-27T12:00:00.000Z',
      approvedAt: '2026-10-27T12:00:00.000Z',
      approval_target_hash: unapprovedHash,
      targetHash: unapprovedHash,
      generated_at: '2026-10-27T11:59:00.000Z',
      runtimeId: 'test-runtime-uuid-999',
      cost_usd: 0.045,
      tokens: 3500,
      dataCompleteness: {
        score: 95,
        generatedAt: '2026-10-27T11:59:00.000Z',
      },
    };

    const recomputedHash = computeContentHash({
      body: postApprovalBody,
      releaseTier: 'fact_om',
      policyVersion: '2026-08-31',
    });

    expect(
      recomputedHash,
      'content_hash must remain identical after approval metadata injection!'
    ).toBe(unapprovedHash);
  });

  it('detects substantive domain modifications: changing asking price changes content_hash', () => {
    const hash1 = computeContentHash({
      body: baseDocumentBody,
      releaseTier: 'fact_om',
      policyVersion: '2026-08-31',
    });

    const modifiedBody = {
      ...baseDocumentBody,
      asking_price_manwon: 1600000, // modified price
    };

    const hash2 = computeContentHash({
      body: modifiedBody,
      releaseTier: 'fact_om',
      policyVersion: '2026-08-31',
    });

    expect(hash1).not.toBe(hash2);
  });

  it('recursively strips large inline base64 images into digests', () => {
    const heavyBase64 = 'data:image/png;base64,' + 'A'.repeat(2000);
    const bodyWithImage = {
      ...baseDocumentBody,
      heroPhoto: heavyBase64,
    };

    const clean = pickContentKeys(bodyWithImage) as Record<string, any>;
    expect(typeof clean.heroPhoto).toBe('string');
    expect(clean.heroPhoto.startsWith('[image_digest:')).toBe(true);
    expect(clean.heroPhoto.length).toBeLessThan(50);
  });

  it('Tier 2: computeDocHash produces deterministic hash regardless of key insertion order', () => {
    const doc1 = {
      schemaVersion: '3.0',
      builderVersion: '2026.10',
      title: '건물 개요',
      sections: [{ id: '01', name: 'A' }, { id: '02', name: 'B' }],
    };

    const doc2 = {
      title: '건물 개요',
      sections: [{ id: '01', name: 'A' }, { id: '02', name: 'B' }],
      builderVersion: '2026.10',
      schemaVersion: '3.0',
    };

    const hash1 = computeDocHash(doc1);
    const hash2 = computeDocHash(doc2);

    expect(hash1).toBe(hash2);
    expect(hash1.startsWith('sha256:')).toBe(true);
  });

  it('Tier 3: computeFileSha256 accurately matches crypto SHA-256 for binary PPTX buffers', () => {
    const mockPptxBinary = Buffer.from('PK\x03\x04MockPptxZipBinaryContentForTesting1234567890');
    const expectedHex = 'sha256:' + createHash('sha256').update(mockPptxBinary).digest('hex');

    const calculated = computeFileSha256(mockPptxBinary);
    expect(calculated).toBe(expectedHex);
  });
});

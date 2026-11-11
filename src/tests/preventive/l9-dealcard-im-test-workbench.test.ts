/**
 * L9. 인간 테스터 클릭 스루 MECE 워크벤치 (/dealcard-im-test) 및 내장 테스트 에셋 예방 테스트 (PT-901 ~ PT-903)
 *
 * 검증 범위:
 * - PT-901: MECE 6차원·5트랙·24단계 SSOT 무결성 및 내장 프리셋(메모 A/B, Ctrl+V TSV) 도메인 정합성 검증
 * - PT-902: 비표준 .xlsx(단일 임차인/업종 열 + 합계 푸터) 및 표준 .xlsx 동적 생성기 → parseRentRollData 무결성 검증
 * - PT-903: 가로·세로(853x1280) 및 JPG/PNG/WebP 혼합 테스트 사진 생성기 실측 해상도·포맷 검증
 */
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import sharp from 'sharp';
import {
  WORKBENCH_TRACKS,
  MECE_6_DIMENSIONS,
  TEST_PHOTO_7_PACK,
  BOJEONG_TSV_CLIPBOARD,
  CLICK_THROUGH_STEPS,
} from '@/lib/testguide/dealcard-im-mece-guide-data';
import { GET as getTestAsset } from '@/app/api/public/dealcard-im-test-assets/route';
import { parseRentRollData } from '@/lib/rentroll/parse-rentroll-sheet';
import { parseMemoIntoCard4 } from '@/lib/deal-card/memo-pairing';

describe('L9 Click-Through MECE Workbench (/dealcard-im-test) & Assets (PT-901 ~ PT-903)', () => {
  it('[PT-901] maintains MECE 6-dimension × 5-track coverage and domain-accurate copy presets (Memo A/B & TSV)', () => {
    expect(MECE_6_DIMENSIONS).toHaveLength(6);
    expect(WORKBENCH_TRACKS.map((t) => t.id)).toEqual([
      'overview',
      'track1',
      'track2',
      'track3',
      'track4',
      'track5',
      'signoff',
    ]);
    expect(TEST_PHOTO_7_PACK).toHaveLength(7);

    const stepIds = CLICK_THROUGH_STEPS.map((s) => s.id);
    expect(new Set(stepIds).size).toBe(stepIds.length);
    for (const trackId of ['track1', 'track2', 'track3', 'track4', 'track5'] as const) {
      expect(CLICK_THROUGH_STEPS.some((s) => s.trackId === trackId)).toBe(true);
    }

    // Verify Memo A (T1-02) & Memo B (T1-03) match the exact expectedOracle in the guide
    const stepT102 = CLICK_THROUGH_STEPS.find((s) => s.id === 'T1-02');
    const memoA = stepT102?.copyPresets?.[0]?.content || '';
    const parsedA = parseMemoIntoCard4(memoA);
    expect(parsedA.posture).toBe('income');
    expect(parsedA.area).toBe('연면적 1,195평');
    expect([parsedA.region, parsedA.headline, ...parsedA.points].join(' ')).not.toContain('315-3');
    expect([parsedA.region, parsedA.headline, ...parsedA.points].join(' ')).not.toContain('010-8888-9999');

    const stepT103 = CLICK_THROUGH_STEPS.find((s) => s.id === 'T1-03');
    const memoB = stepT103?.copyPresets?.[0]?.content || '';
    const parsedB = parseMemoIntoCard4(memoB);
    expect(parsedB.posture).toBe('value_add');
    expect(parsedB.area).toBe('토지 814평');
    expect([parsedB.region, parsedB.headline, ...parsedB.points].join(' ')).not.toContain('395-165');

    // Verify Bojeong TSV clipboard preset parses into exact 7 units (65,000 / 1,980)
    const tsvRows = BOJEONG_TSV_CLIPBOARD.split('\n').map((line) => line.split('\t'));
    const parsedTsv = parseRentRollData(tsvRows);
    expect(parsedTsv.parsedRows).toHaveLength(7);
    expect(parsedTsv.totalDeposit).toBe(65000);
    expect(parsedTsv.monthlyRent).toBe(1980);
    expect(parsedTsv.parsedRows.find((r) => r.floor === '3F')?.lease_state).toBe('공실');
    const jeonse4F = parsedTsv.parsedRows.find((r) => r.floor === '4F');
    expect(jeonse4F?.deposit_manwon).toBe(35000);
    expect(jeonse4F?.rent_manwon).toBe(0);
    expect(Boolean(jeonse4F?.is_vacant)).toBe(false);
    expect(jeonse4F?.lease_state).not.toBe('자가사용');
    expect(parsedTsv.parsedRows.find((r) => r.floor === '5F')?.lease_state).toBe('자가사용');
  });

  it('[PT-902] generates real Seogyo non-standard .xlsx (skipping 합계 footer, preserving 공실/전세/자가사용) and Bojeong standard .xlsx', async () => {
    const reqSeogyo = new NextRequest(
      'http://localhost:3000/api/public/dealcard-im-test-assets?kind=xlsx&preset=seogyo_nonstandard'
    );
    const resSeogyo = await getTestAsset(reqSeogyo);
    expect(resSeogyo.status).toBe(200);
    expect(resSeogyo.headers.get('content-type')).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    const bufSeogyo = Buffer.from(await resSeogyo.arrayBuffer());
    const wbSeogyo = XLSX.read(bufSeogyo, { type: 'buffer' });
    const rowsSeogyo = XLSX.utils.sheet_to_json<Array<string | number>>(
      wbSeogyo.Sheets[wbSeogyo.SheetNames[0]],
      { header: 1, defval: '' }
    );

    const parsedSeogyo = parseRentRollData(rowsSeogyo);
    expect(parsedSeogyo.parsedRows).toHaveLength(12);
    expect(parsedSeogyo.totalDeposit).toBe(185000);
    expect(parsedSeogyo.monthlyRent).toBe(10250);
    expect(parsedSeogyo.parsedRows.find((r) => r.floor === '4F')?.lease_state).toBe('공실');
    const jeonse5F = parsedSeogyo.parsedRows.find((r) => r.floor === '5F');
    expect(jeonse5F?.deposit_manwon).toBe(50000);
    expect(jeonse5F?.rent_manwon).toBe(0);
    expect(Boolean(jeonse5F?.is_vacant)).toBe(false);
    expect(jeonse5F?.lease_state).not.toBe('자가사용');
    expect(parsedSeogyo.parsedRows.find((r) => r.floor === '10F')?.lease_state).toBe('자가사용');

    const reqBojeong = new NextRequest(
      'http://localhost:3000/api/public/dealcard-im-test-assets?kind=xlsx&preset=bojeong_standard'
    );
    const resBojeong = await getTestAsset(reqBojeong);
    expect(resBojeong.status).toBe(200);
    const bufBojeong = Buffer.from(await resBojeong.arrayBuffer());
    const wbBojeong = XLSX.read(bufBojeong, { type: 'buffer' });
    const rowsBojeong = XLSX.utils.sheet_to_json<Array<string | number>>(
      wbBojeong.Sheets[wbBojeong.SheetNames[0]],
      { header: 1, defval: '' }
    );
    const parsedBojeong = parseRentRollData(rowsBojeong);
    expect(parsedBojeong.parsedRows).toHaveLength(7);
    expect(parsedBojeong.totalDeposit).toBe(65000);
    expect(parsedBojeong.monthlyRent).toBe(1980);
  });

  it('[PT-903] serves portrait (853x1280 JPEG) and landscape (1280x853 PNG/WebP) architectural test photos without binary git bloat', async () => {
    const resSlot3 = await getTestAsset(
      new NextRequest(
        'http://localhost:3000/api/public/dealcard-im-test-assets?kind=photo&slot=3&download=1'
      )
    );
    expect(resSlot3.status).toBe(200);
    expect(resSlot3.headers.get('content-type')).toBe('image/jpeg');
    expect(resSlot3.headers.get('content-disposition')).toContain('03_lobby_portrait.jpg');
    const meta3 = await sharp(Buffer.from(await resSlot3.arrayBuffer())).metadata();
    expect(meta3.width).toBe(853);
    expect(meta3.height).toBe(1280);

    const resSlot4 = await getTestAsset(
      new NextRequest(
        'http://localhost:3000/api/public/dealcard-im-test-assets?kind=photo&slot=4'
      )
    );
    expect(resSlot4.status).toBe(200);
    expect(resSlot4.headers.get('content-type')).toBe('image/png');
    const meta4 = await sharp(Buffer.from(await resSlot4.arrayBuffer())).metadata();
    expect(meta4.width).toBe(1280);
    expect(meta4.height).toBe(853);

    const resSlot5 = await getTestAsset(
      new NextRequest(
        'http://localhost:3000/api/public/dealcard-im-test-assets?kind=photo&slot=5'
      )
    );
    expect(resSlot5.status).toBe(200);
    expect(resSlot5.headers.get('content-type')).toBe('image/webp');
    const meta5 = await sharp(Buffer.from(await resSlot5.arrayBuffer())).metadata();
    expect(meta5.width).toBe(1280);
    expect(meta5.height).toBe(853);
  }, 20000);
});

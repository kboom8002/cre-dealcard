import { describe, expect, it } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import { splitFloorAndUnit } from '@/domain/building/mobile-im/floor-unit-resolver';
import { parseRentRollData } from '@/lib/rentroll/parse-rentroll-sheet';
import { bindRentRollTable } from '@/domain/building/mobile-im/pptx/binder/rent-roll-table-builder';
import { buildA24RentrollStacking } from '@/domain/building/mobile-im/pptx/archetypes/a24-rentroll-stacking';
import { planGallerySlides } from '@/domain/building/mobile-im/pptx/gallery-planner';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { applyStudioSlideOverrides } from '@/domain/building/mobile-im/pptx/studio-overrides-applier';

describe('Wellbing Plaza Forensic Audit Remediation (Waves 1-5)', () => {
  describe('Wave 3: splitFloorAndUnit SSOT', () => {
    it('splits bare room numbers into physical floor + unit label', () => {
      expect(splitFloorAndUnit('101호')).toMatchObject({
        floorKey: '1F',
        order: 1,
        isSubterranean: false,
        floorLabel: '1F',
        unitLabel: '101호',
        displayLabel: '1F 101호',
      });
      expect(splitFloorAndUnit('B101호')).toMatchObject({
        floorKey: 'B1',
        order: -1,
        isSubterranean: true,
        floorLabel: 'B1',
        unitLabel: 'B101호',
        displayLabel: 'B1 B101호',
      });
      expect(splitFloorAndUnit('1105호')).toMatchObject({
        floorKey: '11F',
        order: 11,
        isSubterranean: false,
        floorLabel: '11F',
        unitLabel: '1105호',
        displayLabel: '11F 1105호',
      });
    });

    it('preserves explicit floor labels and combines separate floor + unit inputs', () => {
      expect(splitFloorAndUnit('2F 205호')).toMatchObject({
        floorKey: '2F',
        floorLabel: '2F',
        unitLabel: '205호',
        displayLabel: '2F 205호',
      });
      expect(splitFloorAndUnit('3F')).toMatchObject({
        floorKey: '3F',
        floorLabel: '3F',
        unitLabel: '',
        displayLabel: '3F',
      });
      expect(splitFloorAndUnit('2층', '205')).toMatchObject({
        floorKey: '2F',
        floorLabel: '2F',
        unitLabel: '205호',
        displayLabel: '2F 205호',
      });
    });
  });

  describe('Wave 2: Parser Poka-Yoke (Row 13 overwrite & invalid contract_group guard)', () => {
    it('strips Row 13 example note when broker overwrites Row 13 and ignores building-use contract_group', () => {
      const rows = [
        ['층/호실', '통합계약그룹', '임대면적(㎡)', '전용면적(㎡)', '임차인/상호', '업종', '보증금(만원)', '월임대료(만원)', '월관리비(만원)', '계약시작일', '계약만료일', '임대상태', '비고'],
        ['B101호', '근린생활', 222.84, 148.56, '락휴노래연습장', '노래연습장', 3000, 190, 0, '2024-01-01', '2026-12-31', '임대중', '예시 행(13행): 실제 입력 시 삭제하거나 덮어쓰세요'],
        ['205호', '근린생활', 180.51, 120.34, '공실', '', 0, 0, 0, '', '', '공실', ''],
      ];
      const parsed = parseRentRollData(rows);
      expect(parsed.rowCount).toBe(2);
      expect(parsed.parsedRows[0].contract_group).toBeUndefined();
      expect(parsed.parsedRows[0].tenant_name).toBe('락휴노래연습장');
      expect(parsed.parsedRows[0].note).toBeUndefined();
      expect(parsed.parsedRows[1].contract_group).toBeUndefined();
      expect(parsed.parsedRows[1].is_vacant).toBe(true);
    });
  });

  describe('Wave 3: Wellbing Plaza 13-unit Rent Roll & 5-floor Stacking Plan', () => {
    it('groups 13 room-level leases into 5 physical floors (B1~4F) and prevents vacant 〃 bug', () => {
      const wellbingLeases = [
        { floor: 'B101호', contract_group: '근린생활', area_sqm: 222.84, exclusive_area_sqm: 148.56, tenant_name: '락휴노래연습장', deposit_manwon: 3000, rent_manwon: 190, is_vacant: false },
        { floor: '101호', contract_group: '근린생활', area_sqm: 120.0, exclusive_area_sqm: 80.0, tenant_name: '편의점', deposit_manwon: 5000, rent_manwon: 350, is_vacant: false },
        { floor: '102호', contract_group: '근린생활', area_sqm: 110.0, exclusive_area_sqm: 75.0, tenant_name: '부동산', deposit_manwon: 3000, rent_manwon: 220, is_vacant: false },
        { floor: '201호', contract_group: '근린생활', area_sqm: 150.0, exclusive_area_sqm: 100.0, tenant_name: '미용실', deposit_manwon: 2000, rent_manwon: 150, is_vacant: false },
        { floor: '205호', contract_group: '근린생활', area_sqm: 180.51, exclusive_area_sqm: 120.34, tenant_name: '공실', deposit_manwon: 0, rent_manwon: 0, is_vacant: true, lease_state: '공실' },
        { floor: '301호', contract_group: '근린생활', area_sqm: 562.53, exclusive_area_sqm: 375.02, tenant_name: '학원', deposit_manwon: 5000, rent_manwon: 400, is_vacant: false },
        { floor: '402호', contract_group: '주거', area_sqm: 389.55, exclusive_area_sqm: 259.7, tenant_name: '공실', deposit_manwon: 0, rent_manwon: 0, is_vacant: true, lease_state: '공실' },
      ];

      const result: Record<string, any> = {
        rentRoll: { title: '렌트롤', content: '', tables: [], metrics: {} },
        stackingPlan: { title: '스태킹', content: '', tables: [], metrics: {} },
      };

      bindRentRollTable({ body: { floor_leases: wellbingLeases, preset: 'credeal_basic' } }, '', result);

      const tableRows: string[][] = result.rentRoll.tableRows;
      // Floor + Unit formatted properly
      expect(tableRows[0][0]).toBe('B1 B101호');
      expect(tableRows[1][0]).toBe('1F 101호');
      expect(tableRows[4][0]).toBe('2F 205호');
      // Vacant row 205호 must NOT have '〃' in deposit/rent
      expect(tableRows[4][1]).toBe('공실');
      expect(tableRows[4][5]).toBe('-');
      expect(tableRows[4][6]).toBe('-');

      // Render A24 and verify Stacking Plan has 5 physical floors (4F, 3F, 2F, 1F, B1), not 7 unit bars
      const pres = new PptxGenJS();
      pres.defineLayout({ name: 'CUSTOM', width: 13.333, height: 7.5 });
      pres.layout = 'CUSTOM';
      const out = buildA24RentrollStacking({
        pres,
        slideNum: 6,
        docno: 'IM-WELLBING',
        data: result.rentRoll,
        grade: 'B',
        provenance: {},
      });
      const objs: any[] = (out.slide as any)._slideObjects ?? [];
      const texts = objs
        .map((o) => (typeof o.text === 'string' ? o.text : Array.isArray(o.text) ? o.text.map((t: any) => t.text ?? '').join('') : ''))
        .map((s) => s.trim())
        .filter(Boolean);

      // Physical floor labels appear on stacking bars, not '101호' as a floor bar label
      for (const fl of ['4F', '3F', '2F', '1F', 'B1']) {
        expect(texts).toContain(fl);
      }
      expect(texts).not.toContain('〃');
    });
  });

  describe('Wave 4: 12-Photo 2-Slide Gallery & Multi-Slide Rent Roll Sequencer', () => {
    it('plans 2 balanced gallery slides for 7~12 photos in credeal_basic and prioritizes isHero', () => {
      const photos = Array.from({ length: 10 }, (_, i) => ({
        url: `https://example.com/p${i + 1}.jpg`,
        category: i === 0 ? 'exterior' : 'interior',
        isHero: i === 4,
      })) as any[];

      const specs = planGallerySlides(photos, 'income', 'credeal_basic');
      expect(specs).toHaveLength(2);
      expect(specs[0].dataKey).toBe('gallery_0');
      expect(specs[0].title).toBe('현장 사진 (1/2)');
      expect(specs[0].photos).toHaveLength(5);
      // Hero photo (p5) must be placed first
      expect(specs[0].photos[0].url).toBe('https://example.com/p5.jpg');
      expect(specs[1].dataKey).toBe('gallery_1');
      expect(specs[1].title).toBe('현장 사진 (2/2)');
      expect(specs[1].photos).toHaveLength(5);
    });

    it('expands Basic IM sequence with rentRoll + rentRoll_1 and gallery_0 + gallery_1', () => {
      const photos = Array.from({ length: 8 }, (_, i) => ({
        url: `https://example.com/p${i + 1}.jpg`,
        category: 'interior',
      })) as any[];
      const gallerySpecs = planGallerySlides(photos, 'income', 'credeal_basic');
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'B',
        preset: 'credeal_basic',
        hasPhotos: true,
        gallerySpecs,
        rentRollSlideCount: 2,
        dataAvailability: {
          hasRentRoll: true,
          hasPhotos: true,
          hasCadastralMap: true,
        },
      });
      const dataKeys = seq.map((s) => s.dataKey);
      expect(dataKeys).toContain('rentRoll');
      expect(dataKeys).toContain('rentRoll_1');
      expect(dataKeys).toContain('gallery_0');
      expect(dataKeys).toContain('gallery_1');
    });
  });

  describe('Wave 5: Studio Overrides Sanitization (Station suffix, Scale/Floor dedup, Fake Broker Note guard)', () => {
    it('sanitizes 보정역 수인분당선역, deduplicates 층수/규모, formats 2004 -> 2004년, and blocks boilerplate brokerConfirmNote', () => {
      const dataMap: Record<string, any> = {
        summary: {
          leadSentence: '수인분당선 보정역 도보 12분 · 현행 임대수익률 3.09%',
          keyPoints: ['실제 하이라이트 1', '실제 하이라이트 2', '실제 하이라이트 3'],
        },
        building: {
          left: {
            rows: [
              ['층수', '지하 1층 / 지상 4층'],
              ['사용승인일', '2004.12.30 (22년차)'],
            ],
          },
          assetHighlights: ['기존 하이라이트'],
        },
        location: {
          right: {
            rows: [['대중교통', '보정역(수인분당선) 도보 12분']],
            callout: { kind: 'info', title: '입지 요약', body: '실제 입지 요약' },
          },
        },
        land: {
          overviewRows: [],
        },
      };

      applyStudioSlideOverrides(
        [],
        dataMap,
        {
          _studioSlideOverrides: {
            overview: {
              floors: 'B1/4F',
              completionYear: '2004',
              rightCallout: '• 건축물대장·토지이용계획확인서 공적장부 대조 완료\n• 역세권 가시성 및 임차 수요 우수 구간',
            },
            location: {
              transitInfo: '보정역 수인분당선역 도보 12분 (약 951m)',
              locationCallout: '보정역 수인분당선역 도보 12분 중심의 유동인구 및 배후 오피스·주거 수요가 탄탄한 입지',
            },
            land: {
              landCallout: '토지이용계획확인원 및 건축물대장 기준 공법상 특이 제한사항 확인',
            },
          },
        },
      );

      // 1. No duplicate 규모 row; 층수 row preserved as 지하 1층 / 지상 4층
      const bldgRows: [string, string][] = dataMap.building.left.rows;
      expect(bldgRows.filter(([k]) => k === '규모' || k === '층수')).toHaveLength(1);
      expect(bldgRows.find(([k]) => k === '층수')?.[1]).toBe('지하 1층 / 지상 4층');
      // 2. 사용승인일 preserved full date instead of truncating to bare "2004"
      expect(bldgRows.find(([k]) => k === '사용승인일')?.[1]).toBe('2004.12.30 (22년차)');
      // 3. Station name sanitized to 보정역(수인분당선)
      expect(dataMap.location.right.rows[0][1]).toBe('보정역(수인분당선) 도보 12분 (약 951m)');
      // 4. Boilerplate landCallout did NOT set brokerConfirmNote
      expect(dataMap.land.brokerConfirmNote).toBeUndefined();
    });
  });
});

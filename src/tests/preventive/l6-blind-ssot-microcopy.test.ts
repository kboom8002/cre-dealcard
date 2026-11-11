/**
 * L6. 산출물 블라인드 보안 · 수치 SSOT 동치 · 한국어 마이크로카피 예방 테스트 (PT-601 ~ PT-603)
 *
 * 실전 프로덕션 경험 교훈:
 * - PT-601: 공개 딜카드 DTO(`toPublicDealCard`)에서 상세 지번·도로명 건물번호·건물명·소유주 연락처 0% 노출 보장 +
 *           동 이름(`기흥구 보정동`, `마포구 동교동`, `당산동4가`, `역삼동`, `분당구 정자동`)이 `●●●`로 과잉 마스킹되지 않는지 동시 검증
 * - PT-602: 보정동 표준 매물 8대 핵심 지표(매매가·대지면적·연면적·건폐율·용적률·보증금·월임대료·Cap Rate)가
 *           `StoredQuickImRecord` ↔ `BasicImDocument` ↔ `fullDocBody(모바일 IM)` 간 100% 일치하는지 검증
 * - PT-603: 워크스페이스 및 뷰어에 이스케이프 오타(`\'원\'`), 영문 원시 배지(`EXTERIOR`), 파일 확장자 캡션이 0건인지 검증
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { toPublicDealCard, PublicDealCardSchema } from "@/domain/public-projection/deal-card";
import { synthesizeQuickRecordFromImItem } from "@/lib/im-lite/quick-generate-store";
import { normalizeViewerGalleryPhoto } from "@/app/(public)/im-lite/[buildingId]/mobile-im-viewer";

describe("L6 Blind Address Policy, Cross-Artifact Numeric SSOT & Microcopy Hygiene (PT-601 ~ PT-603)", () => {
  it("[PT-601] enforces zero leak of exact lot/road numbers, building names & owner phone while preserving clean dong-level region labels", () => {
    const cases = [
      {
        id: "dc-bojeong",
        rawAddress: "경기도 용인시 기흥구 보정동 1323-2",
        roadAddress: "경기도 용인시 기흥구 신촌로47번길 6",
        buildingName: "웰빙프라자",
        ownerSecret: "건물주 박모씨 010-9123-4567 급매 협의",
        expectedDongTokens: ["보정동"],
        forbiddenTokens: ["1323-2", "신촌로47번길 6", "웰빙프라자", "010-9123-4567"],
      },
      {
        id: "dc-donggyo",
        rawAddress: "서울특별시 마포구 동교동 147-8",
        roadAddress: "서울특별시 마포구 양화로18안길 7",
        buildingName: "더파크빌딩",
        ownerSecret: "임대인 직통 010-8877-6655",
        expectedDongTokens: ["동교동"],
        forbiddenTokens: ["147-8", "양화로18안길 7", "더파크빌딩", "010-8877-6655"],
      },
      {
        id: "dc-dangsan",
        rawAddress: "서울특별시 영등포구 당산동4가 80-1",
        roadAddress: "서울특별시 영등포구 당산로 142",
        buildingName: "당산센트럴타워",
        ownerSecret: "소유주 연락처 010-2233-4455",
        expectedDongTokens: ["당산동"],
        forbiddenTokens: ["80-1", "당산로 142", "당산센트럴타워", "010-2233-4455"],
      },
      {
        id: "dc-yeoksam-san",
        rawAddress: "서울특별시 강남구 역삼동 산12-3",
        roadAddress: "서울특별시 강남구 테헤란로 215",
        buildingName: "역삼프라임빌딩",
        ownerSecret: "비공개 메모 010-3344-5566",
        expectedDongTokens: ["역삼동"],
        forbiddenTokens: ["산12-3", "테헤란로 215", "역삼프라임빌딩", "010-3344-5566"],
      },
      {
        id: "dc-jeongja",
        rawAddress: "경기도 성남시 분당구 정자동 178-1",
        roadAddress: "경기도 성남시 분당구 성남대로 331",
        buildingName: "정자스퀘어",
        ownerSecret: "매도인 비밀조건 010-7788-9900",
        expectedDongTokens: ["정자동"],
        forbiddenTokens: ["178-1", "성남대로 331", "정자스퀘어", "010-7788-9900"],
      },
    ];

    for (const tc of cases) {
      const cleanAreaSignal = tc.rawAddress
        .replace(/^(서울특별시|경기도)\s+/, "")
        .replace(/\s+(산?\d+(?:-\d+)?).*$/, "");

      const dto = toPublicDealCard({
        id: tc.id,
        building: {
          id: tc.id,
          raw_address: `${tc.rawAddress} ${tc.buildingName}`,
          raw_input: `${tc.rawAddress} ${tc.buildingName} (${tc.roadAddress}) / ${tc.ownerSecret}`,
          area_signal: cleanAreaSignal,
          asset_type: "근린생활시설",
          price_band: "25억~30억",
          status: "public_signal_ready",
          layers: {
            location: {
              address: tc.rawAddress,
              road_address: tc.roadAddress,
              building_name: tc.buildingName,
              pnu: "4146311800113230002",
            },
            physical: {
              total_floor_area_sqm: 1230.46,
              land_area_sqm: 440,
            },
            lease_summary: {
              asking_price_manwon: 280000,
              monthly_rent_total_krw: 8990000,
              total_deposit_manwon: 27950,
            },
          },
        },
        signalCard: {
          title: `${tc.rawAddress.split(/\s+/)[2]} 역세권 수익형 근생빌딩`,
          area_signal: tc.rawAddress
            .replace(/^(서울특별시|경기도)\s+/, "")
            .replace(/\s+(산?\d+(?:-\d+)?).*$/, ""),
          asset_type: "근린생활시설",
          price_band: "25억~30억",
          body: {
            dealPoints: [
              "역세권 도보 5분 코너 가시성 우수",
              "전층 우량 근생 임차인 만실 운영 중",
              "대지 133평 · 연면적 372평 안정적 임대수익",
            ],
          },
        },
        teaserDoc: null,
        brokerProfile: {
          display_name: "박상현 대표중개사",
          phone: "02-555-8899",
          slug: "park-cre",
          is_licensed: true,
        },
        hasImDoc: true,
        isPptxApproved: true,
        pptxDownloadUrl: `/api/public/im-lite/${tc.id}/pptx`,
      });

      // Strict Zod schema validation (rejects any unknown leaked field)
      const parsed = PublicDealCardSchema.parse(dto);
      const serialized = JSON.stringify(parsed);

      // 1. Zero leak of exact lot number, road address number, building name, PNU, or owner phone
      for (const forbidden of [...tc.forbiddenTokens, "4146311800113230002"]) {
        expect(serialized).not.toContain(forbidden);
      }

      // 2. Dong-level region label must remain human-readable without `●●●` over-masking
      expect(parsed.hero.regionLabel).not.toContain("●●●");
      for (const dong of tc.expectedDongTokens) {
        expect(parsed.hero.regionLabel).toContain(dong);
      }
    }
  });

  it("[PT-602] guarantees 8-metric SSOT parity across StoredQuickImRecord, BasicImDocument, and Mobile IM fullDocBody", () => {
    const rec = synthesizeQuickRecordFromImItem(
      "982bd803-368a-49ca-9d0d-5bff92b07c60",
      {
        id: "64bacb6b-1111-4222-8333-444444444444",
        buildingId: "982bd803-368a-49ca-9d0d-5bff92b07c60",
        title: "보정동 웰빙프라자",
        address: "경기도 용인시 기흥구 보정동 1323-2",
        askingPriceManwon: 280000, // 28억 원
        gfaSqm: 1230.46,
        landAreaSqm: 440,
        bcrPct: 49.91,
        farPct: 209.24,
        zoning: "제1종일반주거지역",
        floorsAbove: 3,
        floorsBelow: 1,
        parkingTotal: 10,
        elevatorCount: 1,
        rentRoll: [
          { floor: "B1", unit: "B101", use: "스크린골프", areaSqm: 309.76, depositManwon: 5000, monthlyRentManwon: 180, status: "occupied" },
          { floor: "1F", unit: "101", use: "편의점·베이커리", areaSqm: 219.62, depositManwon: 12950, monthlyRentManwon: 290, status: "occupied" },
          { floor: "2F", unit: "201", use: "어학원", areaSqm: 219.62, depositManwon: 6000, monthlyRentManwon: 190, status: "occupied" },
          { floor: "3F", unit: "301", use: "필라테스", areaSqm: 219.62, depositManwon: 4000, monthlyRentManwon: 149, status: "occupied" },
        ],
      },
      {
        displayName: "박상현 대표중개사",
        company: "크리딜부동산중개법인",
        phone: "02-555-8899",
      }
    );

    const facts = rec.basicImDoc.facts;
    const body = rec.fullDocBody!;
    const hero = body.heroCard;
    const ssot = body.ssot_summary;

    // 1. Asking Price: 28억 (280,000만원 = 2,800,000,000원)
    expect(rec.askingPriceManwon).toBe(280000);
    expect(facts.transaction.askingPriceKrw).toBe(2_800_000_000);
    expect(hero.askingPriceBil).toBe(28);
    expect(ssot.asking_price_manwon).toBe(280000);

    // 2. Land Area: 440㎡
    expect(rec.specs?.landAreaSqm).toBe(440);
    expect(facts.land.landAreaSqm).toBe(440);
    expect(hero.landAreaM2).toBe(440);
    expect(ssot.land_area_sqm).toBe(440);

    // 3. Gross Floor Area (GFA): 1,230.46㎡
    expect(rec.specs?.gfaSqm).toBeCloseTo(1230.46, 2);
    expect(facts.building.totalGrossAreaSqm).toBeCloseTo(1230.46, 2);
    expect(hero.totalGrossAreaSqm).toBeCloseTo(1230.46, 2);
    expect(ssot.total_gross_area_sqm).toBeCloseTo(1230.46, 2);

    // 4 & 5. BCR (49.91%) & FAR (209.24%)
    expect(rec.specs?.bcrPct).toBeCloseTo(49.91, 2);
    expect(facts.building.buildingCoverageRatioPct).toBeCloseTo(49.91, 2);
    expect(rec.specs?.farPct).toBeCloseTo(209.24, 2);
    expect(facts.building.floorAreaRatioPct).toBeCloseTo(209.24, 2);

    // 6 & 7. Total Deposit (27,950만원) & Monthly Rent (809만원)
    const expectedDepositManwon = 5000 + 12950 + 6000 + 4000; // 27,950만원
    const expectedRentManwon = 180 + 290 + 190 + 149; // 809만원
    expect(facts.rent.depositTotalKrw).toBe(expectedDepositManwon * 10_000);
    expect(facts.rent.monthlyRentTotalKrw).toBe(expectedRentManwon * 10_000);
    expect(ssot.total_deposit_krw).toBe(expectedDepositManwon * 10_000);
    expect(ssot.monthly_rent_total_krw).toBe(expectedRentManwon * 10_000);

    // 8. Gross Yield (3.85%) & Cap Rate (~3.30%) SSOT parity
    expect(facts.valuation.grossYieldPct).toBeCloseTo(3.85, 2);
    expect(ssot.gross_yield_pct).toBeCloseTo(facts.valuation.grossYieldPct, 2);
    expect(hero.capRateBase).toBeCloseTo(facts.valuation.capRatePct, 2);
    expect(ssot.cap_rate_pct).toBeCloseTo(facts.valuation.capRatePct, 2);
  });

  it("[PT-603] blocks escaped quote typos (\\'원\\'), raw English category badges, and file-extension captions across workspaces & viewers", () => {
    const englishCategories = [
      ["EXTERIOR", "외관"],
      ["INTERIOR", "실내 공간"],
      ["PARKING", "주차·설비"],
      ["ROOFTOP", "옥상·테라스"],
      ["LOBBY", "메인 로비"],
      ["ENTRANCE", "주출입구"],
      ["FLOOR_PLAN", "평면도"],
    ] as const;

    for (const [rawEng, expectedKo] of englishCategories) {
      // Even when raw uppercase English is stored inside `label` AND `caption`, viewer must translate badge & suppress redundant caption
      const out = normalizeViewerGalleryPhoto(
        {
          url: "https://proj.supabase.co/storage/v1/object/public/building_photos/b1/01.jpg",
          category: rawEng,
          label: rawEng,
          caption: `${rawEng}.JPG`,
        },
        0
      );
      expect(out.label).toBe(expectedKo);
      expect(out.label).not.toMatch(/^[A-Z_]+$/);
      expect(out.caption).toBeUndefined();
    }

    // Scan workspace & viewer TSX files for escaped quote regressions (`\'원\'`)
    const workspaceFiles = [
      "src/app/(broker)/broker/w/im/page.tsx",
      "src/app/(broker)/broker/w/dealcards/page.tsx",
      "src/app/(broker)/broker/w/magazine/page.tsx",
      "src/app/(broker)/broker/w/inbox/page.tsx",
      "src/components/workspace/WorkspaceShell.tsx",
      "src/app/(public)/im-lite/[buildingId]/mobile-im-viewer.tsx",
    ];

    for (const relPath of workspaceFiles) {
      const absPath = path.resolve(process.cwd(), relPath);
      const src = fs.readFileSync(absPath, "utf8");
      expect(src, `${relPath} must not contain escaped quote typo \\'원\\'`).not.toContain("\\'원\\'");
      expect(src, `${relPath} must not contain escaped quote typo \\"원\\"`).not.toContain('\\"원\\"');
    }
  });
});

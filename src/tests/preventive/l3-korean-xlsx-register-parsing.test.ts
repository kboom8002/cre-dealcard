/**
 * L3. 실무 비정형 한국어 · 엑셀(`.xlsx`) · 공적장부 파싱 경계 예방 테스트 (PT-301 ~ PT-304)
 *
 * 실전 프로덕션 경험 교훈:
 * - PT-301: 천단위 콤마(`2억7,950만`), 가운뎃점(`학원·카페`), 산번지/가번지, 차주 연락처 메모 퍼징 검증
 * - PT-302: `.xlsx`/시트 데이터에서 전세(`월세 0`), `자가사용`, `공실`, 렌트프리, 지하층, 기계실(비임대), 원화/만원 단위 혼용 검증
 * - PT-303: 수기 입력 다호실 층별 면적 균등 안분(`Σ 호실면적 ≈ 연면적`, Slide 02 공실면적 `> 0㎡`) 불변식 검증
 * - PT-304: 건축물대장 총괄표제부 vs 표제부 병합 시 `0` 폴백 덮어쓰기 방지 검증
 */
import { describe, it, expect } from "vitest";
import { parseMemoIntoCard4 } from "@/lib/deal-card/memo-pairing";
import { parseRentRollData } from "@/lib/rentroll/parse-rentroll-sheet";
import {
  summarizeLeaseOccupancy,
  isVacantLeaseRow,
} from "@/domain/building/mobile-im/lease-vacancy";

describe("L3 Messy Korean Memo, .xlsx Rent-Roll & Public Register Parsing Suite (PT-301 ~ PT-304)", () => {
  it("[PT-301] fuzzes messy Korean broker field memos without splitting numbers/dots or leaking owner PII", () => {
    const corpus = [
      {
        memo: "경기도 용인시 기흥구 보정동 1323-2 웰빙프라자 근생빌딩 매각 희망가 28억, 대지 133평 / 연면적 372평, 보증금 2억7,950만 월세 809만, 분당선 보정역 도보 7분 학원·카페 코너 상권 (박사장님 010-9876-5432)",
        forbidden: ["1323-2", "웰빙프라자", "010-9876-5432", "박사장", "950만 단독절단"],
        expectedRegionSubstring: "보정",
      },
      {
        // Rare asset type ('병·의원' -> 메디컬빌딩) intentionally triggers k-anonymity Dong -> Gu fallback ('영등포구')!
        memo: "서울시 영등포구 당산동4가 80-1 한강빌딩 매매 95억, 연면적 438평, 수익률 4.35%, 2·9호선 당산역 도보 3분 병·의원·약국 성업중 (김회장 010.1111.2222 현관비번 #2580*)",
        forbidden: ["80-1", "한강빌딩", "010.1111.2222", "김회장", "2580"],
        expectedRegionSubstring: "영등포구",
      },
      {
        // General neighborhood retail ('근생빌딩') preserves clean Dong label ('영등포구 당산동')
        memo: "서울시 영등포구 당산동4가 80-1 한강빌딩 근생빌딩 매매 95억, 연면적 438평, 수익률 4.35%, 2·9호선 당산역 도보 3분 카페·베이커리 성업중 (김회장 010.1111.2222)",
        forbidden: ["80-1", "한강빌딩", "010.1111.2222", "김회장"],
        expectedRegionSubstring: "당산동",
      },
      {
        memo: "서울 강남구 역삼동 산12-3 신축부지 매각 145억, 대지 185평, 제2종일반주거지역, 역삼역 도보 5분 코너 각지 (소유주 직접 02-555-7788)",
        forbidden: ["산12-3", "02-555-7788"],
        expectedRegionSubstring: "역삼",
      },
    ];

    for (const item of corpus) {
      const card4 = parseMemoIntoCard4(item.memo);
      const serialized = [
        card4.region,
        card4.use,
        card4.priceBand,
        card4.headline || "",
        ...card4.points,
      ].join(" | ");

      expect(card4.region).toContain(item.expectedRegionSubstring);
      for (const token of item.forbidden) {
        expect(serialized).not.toContain(token);
      }
      // Ensure `,950` or `.35%` was never split into a garbage point starting with digits from thousands/decimals
      for (const pt of card4.points) {
        expect(pt).not.toMatch(/^(?:950만|35%)/);
      }
    }
  });

  it("[PT-302] parses .xlsx matrix with Jeonse (rent=0), Owner-use (자가사용), Vacant, Rent-Free, Basement, and Machine Room accurately", () => {
    const sheetRows = [
      ["층", "호실", "업종/임차인", "임대면적(㎡)", "전용면적(㎡)", "보증금(만원)", "월임대료(만원)", "관리비(만원)", "임대상태", "만기일", "비고"],
      ["B1", "B101호", "기계실", "", "", 0, 0, 0, "", "", "설비실"],
      ["1F", "101호", "카페", 58.21, 33.69, 3000, 180, 15, "임대중", "2027-12-31", ""],
      ["2F", "201호", "공실", 177.77, 109.53, 0, 0, 0, "공실", "", "즉시입주"],
      ["3F", "305호", "주거(전세)", 41.02, 28.5, 12000, 0, 5, "임대중", "2027-08-31", "전세 세대"],
      ["3F", "306호", "주거(전세)", 41.02, 28.5, 11000, 0, 5, "임대중", "2027-09-30", "전세 세대"],
      ["4F", "401호", "스터디카페", 246.09, 165.0, 5000, 0, 25, "임대중", "2028-03-31", "렌트프리 1개월"],
      ["5F", "501호", "주택(주인세대)", 246.09, 165.0, 0, 0, 0, "자가사용", "", "매도인 거주(명도협의)"],
      ["합계", "", "", 769.18, 530.22, 31000, 180, 50, "", "", ""],
    ];

    const parsed = parseRentRollData(sheetRows);

    // Summary row excluded; 7 real unit rows parsed
    expect(parsed.parsedRows.length).toBe(7);

    // Jeonse rows (305호, 306호) MUST be preserved with rent_manwon === 0 and lease_state === '임대중'
    const jeonse305 = parsed.parsedRows.find((r) => r.unit_label === "305호");
    const jeonse306 = parsed.parsedRows.find((r) => r.unit_label === "306호");
    expect(jeonse305).toBeDefined();
    expect(jeonse305?.deposit_manwon).toBe(12000);
    expect(jeonse305?.rent_manwon).toBe(0);
    expect(jeonse305?.lease_state).toBe("임대중");
    expect(jeonse306?.deposit_manwon).toBe(11000);
    expect(jeonse306?.rent_manwon).toBe(0);

    // Owner-use (501호) MUST preserve lease_state === '자가사용' and NOT count as vacant or rent
    const owner501 = parsed.parsedRows.find((r) => r.unit_label === "501호");
    expect(owner501?.lease_state).toBe("자가사용");
    expect(Boolean(owner501?.is_vacant)).toBe(false);
    expect(isVacantLeaseRow(owner501 as any)).toBe(false);

    // Totals: 3000 + 12000 + 11000 + 5000 = 31,000만원 deposit; 180만원 monthly rent
    expect(parsed.totalDeposit).toBe(31000);
    expect(parsed.monthlyRent).toBe(180);

    // Verify Rule 76 occupancy SSOT excludes machine room (기계실) and owner-use (자가사용) from vacancy denominator
    const occ = summarizeLeaseOccupancy(parsed.parsedRows as any);
    expect(occ.vacant).toBe(1); // Only 201호
    expect(occ.ownerUse).toBe(1); // 501호
    expect(occ.nonLeasable).toBe(1); // B101호 기계실
    const vacantAreaSqm = parsed.parsedRows
      .filter((r) => isVacantLeaseRow(r as any))
      .reduce((acc, r) => acc + (r.area_sqm || 0), 0);
    expect(vacantAreaSqm).toBeCloseTo(177.77, 1);
  });

  it("[PT-303] allocates floor register gross area evenly across same-floor manual units so GFA matches and Slide 02 vacant area > 0㎡", () => {
    // Bojeong-dong 1323-2 register floor areas: B1..5F = 1,230.46㎡ (5 floors × 246.092㎡)
    const floorAreaMap = new Map<string, number>([
      ["1F", 246.09],
      ["2F", 246.09],
      ["3F", 246.09],
      ["4F", 246.09],
      ["5F", 246.1],
    ]);
    const manualRows = [
      { floor: "1F", unit: "101호", use: "카페", status: "occupied" },
      { floor: "1F", unit: "102호", use: "제과점", status: "occupied" },
      { floor: "1F", unit: "103호", use: "미용실", status: "occupied" },
      { floor: "1F", unit: "104호", use: "영어학원", status: "occupied" },
      { floor: "1F", unit: "105호", use: "아이스크림", status: "occupied" },
      { floor: "2F", unit: "201호", use: "공실", status: "vacant" },
      { floor: "2F", unit: "202호", use: "학원", status: "occupied" },
      { floor: "3F", unit: "301호", use: "원룸", status: "occupied" },
      { floor: "3F", unit: "302호", use: "원룸", status: "occupied" },
      { floor: "3F", unit: "303호", use: "원룸", status: "occupied" },
      { floor: "3F", unit: "304호", use: "원룸", status: "occupied" },
      { floor: "3F", unit: "305호", use: "전세", status: "occupied" },
      { floor: "3F", unit: "306호", use: "전세", status: "occupied" },
      { floor: "4F", unit: "401호", use: "스터디카페", status: "occupied" },
      { floor: "5F", unit: "501호", use: "자가사용", status: "owner" },
    ];

    const countsByFloor = new Map<string, number>();
    for (const r of manualRows) {
      countsByFloor.set(r.floor, (countsByFloor.get(r.floor) || 0) + 1);
    }
    const allocated = manualRows.map((r) => {
      const flTotal = floorAreaMap.get(r.floor) || 0;
      const cnt = countsByFloor.get(r.floor) || 1;
      const area_sqm = Math.round((flTotal / cnt) * 100) / 100;
      return {
        ...r,
        area_sqm,
        is_vacant: r.status === "vacant",
        lease_state:
          r.status === "vacant" ? "공실" : r.status === "owner" ? "자가사용" : "임대중",
      };
    });

    const sumSqm = allocated.reduce((acc, r) => acc + r.area_sqm, 0);
    // Must match 1,230.46㎡ within ±0.1㎡ (never 5x inflated 3,691㎡ and never 0㎡)
    expect(Math.abs(sumSqm - 1230.46)).toBeLessThanOrEqual(0.1);

    const occ = summarizeLeaseOccupancy(allocated as any);
    expect(occ.vacant).toBe(1);
    const vacantAreaSqm = allocated
      .filter((r) => isVacantLeaseRow(r as any))
      .reduce((acc, r) => acc + r.area_sqm, 0);
    expect(Math.round(vacantAreaSqm)).toBe(123); // Never 0㎡!
  });

  it("[PT-304] building register fallback helper ignores spurious 0 from empty summary register while preserving real positive ratios", () => {
    const pickPositiveRegisterNumber = (...candidates: unknown[]): number | undefined => {
      for (const c of candidates) {
        const n = typeof c === "number" ? c : Number(c);
        if (Number.isFinite(n) && n > 0) return n;
      }
      return undefined;
    };

    // Case 1: Summary register returns bcRat=0, vlRat=0, parking=0, but Title register has real values
    const summaryReg = { bcRat: 0, vlRat: 0, totPkngCnt: 0, rideUseElvtCnt: 0 };
    const titleReg = { bcRat: 49.91, vlRat: 209.24, totPkngCnt: 7, rideUseElvtCnt: 1 };

    expect(pickPositiveRegisterNumber(summaryReg.bcRat, titleReg.bcRat)).toBe(49.91);
    expect(pickPositiveRegisterNumber(summaryReg.vlRat, titleReg.vlRat)).toBe(209.24);
    expect(pickPositiveRegisterNumber(summaryReg.totPkngCnt, titleReg.totPkngCnt)).toBe(7);
    expect(pickPositiveRegisterNumber(summaryReg.rideUseElvtCnt, titleReg.rideUseElvtCnt)).toBe(1);
  });
});

/**
 * 렌트롤 파서 — 실수입 합계 기준 / 만료 계약 경고
 *
 *  발견 경위: income 실매물 골든(as-is) — 공실 희망 임대료·자가사용 환산금액이 월세/보증금 합계에 섞이고,
 *  만기가 지난 계약에도 경고가 없었음.
 *  1) 임대상태가 공실·자가사용인 행의 금액은 합계에서 제외 (행 금액은 비우고 비고에 보존, 경고)
 *  2) 임대중 행의 만료일이 기준일 이전이면 1건으로 요약 경고
 *  3) 공실 판정이 암묵(업종 공란)이어도 동일하게 제외
 */
import { describe, it, expect } from "vitest";
import { parseRentRollData } from "@/lib/rentroll/parse-rentroll-sheet";

const header = ["호실/층", "임대면적(㎡)", "업종/상호 (원문)", "보증금(원)", "월세(원,VAT별도)", "관리비(원,VAT별도)", "현 계약 만료일", "임대상태", "비고"];
const row = (v: Record<string, any>) => header.map((h) => v[h] ?? "");
const AS_OF = new Date("2026-10-05T00:00:00Z");

describe("parseRentRollData — 임대중 행만 합계", () => {
  const data = [
    header,
    row({ "호실/층": "B1", "업종/상호 (원문)": "소매점", "보증금(원)": 40000000, "월세(원,VAT별도)": 4000000, "관리비(원,VAT별도)": 400000, 임대상태: "공실", 비고: "희망 임대료" }),
    row({ "호실/층": "1F", "업종/상호 (원문)": "약국", "보증금(원)": 60000000, "월세(원,VAT별도)": 1830000, "관리비(원,VAT별도)": 100000, 임대상태: "임대중" }),
    row({ "호실/층": "7F", "업종/상호 (원문)": "사무소", "보증금(원)": 20000000, "월세(원,VAT별도)": 1000000, 임대상태: "자가사용" }),
  ];

  it("공실·자가사용 행 금액은 합계에서 빠지고 임대중 행만 합산된다", () => {
    const r = parseRentRollData(data, { asOf: AS_OF });
    expect(r.totalDeposit).toBe(6000);
    expect(r.monthlyRent).toBe(183);
    expect(r.mgmtFeeTotal).toBe(10);
  });

  it("제외된 행의 금액은 비우고 비고에 보존하며 경고한다 (조용히 버리지 않음)", () => {
    const r = parseRentRollData(data, { asOf: AS_OF });
    const [b1, f1, f7] = r.parsedRows;
    expect(b1.deposit_manwon).toBeUndefined();
    expect(b1.rent_manwon).toBeUndefined();
    expect(b1.note).toContain("희망 임대료");
    expect(b1.note).toMatch(/보증금 4,000/);
    expect(f1.rent_manwon).toBe(183);
    expect(f7.deposit_manwon).toBeUndefined();
    expect(f7.note).toContain("자가사용");
    expect(r.warnings.filter((w) => /합계에서 제외/.test(w))).toHaveLength(2);
  });

  it("금액이 없는 공실·자가사용 행에는 제외 경고를 내지 않는다", () => {
    const r = parseRentRollData(
      [header, row({ "호실/층": "B1", "업종/상호 (원문)": "카페", 임대상태: "자가사용" }), row({ "호실/층": "1F", "업종/상호 (원문)": "약국", "보증금(원)": 10000000, "월세(원,VAT별도)": 500000, 임대상태: "임대중" })],
      { asOf: AS_OF },
    );
    expect(r.warnings.some((w) => /합계에서 제외/.test(w))).toBe(false);
    expect(r.monthlyRent).toBe(50);
  });

  it("임대상태 열 없이 업종 공란으로 추정한 공실도 동일하게 제외한다", () => {
    const h2 = ["호실/층", "업종", "보증금(원)", "월세(원)"];
    const r = parseRentRollData(
      [h2, ["1F", "", 50000000, 2000000], ["2F", "사무소", 30000000, 1500000]],
      { asOf: AS_OF },
    );
    expect(r.vacantCount).toBe(1);
    expect(r.monthlyRent).toBe(150);
    expect(r.totalDeposit).toBe(3000);
  });
});

describe("parseRentRollData — 만료 계약 경고", () => {
  it("임대중 행의 만료일이 기준일 이전이면 1건으로 요약 경고한다", () => {
    const r = parseRentRollData(
      [
        header,
        row({ "호실/층": "4F", "업종/상호 (원문)": "와인", "보증금(원)": 30000000, "월세(원,VAT별도)": 2600000, "현 계약 만료일": "2025-04-30", 임대상태: "임대중" }),
        row({ "호실/층": "3F", "업종/상호 (원문)": "헬스", "보증금(원)": 50000000, "월세(원,VAT별도)": 4550000, "현 계약 만료일": "2026-04-17", 임대상태: "임대중" }),
        row({ "호실/층": "5F", "업종/상호 (원문)": "내과", "보증금(원)": 10000000, "월세(원,VAT별도)": 1650000, "현 계약 만료일": "2027-01-31", 임대상태: "임대중" }),
      ],
      { asOf: AS_OF },
    );
    const w = r.warnings.filter((x) => /만료일이 기준일/.test(x));
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("2건");
    expect(w[0]).toContain("4F 2025-04-30");
    expect(w[0]).not.toContain("5F");
  });

  it("공실·자가사용 행과 기준일 이후 만료는 경고하지 않는다", () => {
    const r = parseRentRollData(
      [
        header,
        row({ "호실/층": "B1", "업종/상호 (원문)": "카페", "현 계약 만료일": "2020-01-01", 임대상태: "공실" }),
        row({ "호실/층": "1F", "업종/상호 (원문)": "약국", "보증금(원)": 10000000, "월세(원,VAT별도)": 500000, "현 계약 만료일": "2026-10-05", 임대상태: "임대중" }),
      ],
      { asOf: AS_OF },
    );
    expect(r.warnings.some((x) => /만료일이 기준일/.test(x))).toBe(false);
  });
});

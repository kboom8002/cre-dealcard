import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  appendSecondaryLotsToAddress,
  removeSecondaryLotFromAddress,
  splitMultiParcelAddressPure,
} from "@/lib/address/multi-parcel-format";

const PNU_117 = "1156012800101170000";
const PNU_134 = "1156012800101340000";
const PNU_125_2 = "1156012800101250002";

const mockState = vi.hoisted(() => ({
  registerCalls: [] as string[],
  attachedCalls: [] as string[],
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        or: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return chain;
    },
  }),
}));

vi.mock("@/lib/external/address-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/external/address-resolver")>();
  return {
    ...actual,
    resolveAddress: vi.fn(async (raw: string) => {
      const parsed = actual.splitMultiParcelAddress(raw);
      const firstMatch = parsed.primaryAddress.match(/(\d+)(?:-(\d+))?\s*$/);
      const bun = actual.padNumber(firstMatch?.[1] || "117");
      const ji = actual.padNumber(firstMatch?.[2] || "0");
      const primaryPnu = `11560128001${bun}${ji}`;
      return {
        pnu: primaryPnu,
        legalDongCode: "1156012800",
        sigunguCd: "11560",
        bjdongCd: "12800",
        platGbCd: "0" as const,
        bun,
        ji,
        roadAddress: "서울특별시 영등포구 선유동2로 73",
        jibunAddress: `서울특별시 영등포구 양평동4가 ${parseInt(bun, 10)}${
          parseInt(ji, 10) > 0 ? `-${parseInt(ji, 10)}` : ""
        }`,
        lat: 37.5377,
        lng: 126.8947,
        buildingMgtNo: "",
      };
    }),
  };
});

vi.mock("@/lib/external/building-register-api", () => ({
  fetchBuildingRegister: vi.fn(
    async (_sgg: string, _bjd: string, bun: string, ji: string) => {
      mockState.registerCalls.push(`${bun}-${ji}`);
      if (bun === "0117" && ji === "0000") {
        return {
          totalArea: 2490.88,
          platArea: 518.7,
          useAprDay: "20180912",
          mainPurpose: "업무시설",
          structure: "철근콘크리트구조",
          floorsAbove: 10,
          floorsBelow: 1,
          bcRat: 58.4,
          vlRat: 398.8,
          buildingName: "더레드빌딩",
          parkingCount: 23,
          elevatorCount: 1,
        };
      }
      return null;
    }
  ),
  fetchBuildingAttachedLots: vi.fn(
    async (_sgg: string, _bjd: string, bun: string, ji: string) => {
      mockState.attachedCalls.push(`${bun}-${ji}`);
      if (bun === "0117" && ji === "0000") {
        return [PNU_125_2, PNU_134];
      }
      return [];
    }
  ),
}));

vi.mock("@/lib/external/land-use-api", () => ({
  fetchLandUsePlan: vi.fn(async (pnu: string) => {
    const areaByPnu: Record<string, number> = {
      [PNU_117]: 210.0,
      [PNU_134]: 160.0,
      [PNU_125_2]: 148.7,
    };
    return {
      landArea: areaByPnu[pnu] ?? 0,
      zoningDistrict: "준공업지역",
      pblntfPclnd: 9800000,
    };
  }),
}));

vi.mock("@/lib/external/land-price-api", () => ({
  fetchLandPrice: vi.fn(async (pnu: string) => {
    const map: Record<string, { landArea: number; landCategory: string; pricePerSqm: number }> = {
      [PNU_117]: { landArea: 210.0, landCategory: "대", pricePerSqm: 10200000 },
      [PNU_134]: { landArea: 160.0, landCategory: "대", pricePerSqm: 9500000 },
      [PNU_125_2]: { landArea: 148.7, landCategory: "대", pricePerSqm: 9600000 },
    };
    return map[pnu] ?? null;
  }),
}));

describe("IM Multi-Parcel Address Helpers & getBrAtchJibunInfo Auto Reverse Lookup", () => {
  beforeEach(() => {
    mockState.registerCalls.length = 0;
    mockState.attachedCalls.length = 0;
  });

  it("parses '외 N필지' / '외 N' hints and cleanly appends/removes secondary lot numbers", () => {
    const p1 = splitMultiParcelAddressPure("서울특별시 영등포구 양평동4가 117 외 2필지");
    expect(p1.primaryAddress).toBe("서울특별시 영등포구 양평동4가 117");
    expect(p1.secondaryLots).toHaveLength(0);
    expect(p1.hasExplicitMultiLotHint).toBe(true);

    const p2 = splitMultiParcelAddressPure("서울특별시 서초구 잠원동 26-14외1");
    expect(p2.primaryAddress).toBe("서울특별시 서초구 잠원동 26-14");
    expect(p2.hasExplicitMultiLotHint).toBe(true);

    const appended = appendSecondaryLotsToAddress(
      "서울특별시 영등포구 양평동4가 117 외 2필지",
      "134번지, 125-2, 117, 산 12-1"
    );
    expect(appended.addedLots).toEqual(["134", "125-2", "산 12-1"]);
    expect(appended.nextAddress).toBe(
      "서울특별시 영등포구 양평동4가 117, 134, 125-2, 산 12-1"
    );

    const afterRemovePnu = removeSecondaryLotFromAddress(appended.nextAddress, {
      pnu: PNU_134,
    });
    expect(afterRemovePnu).toBe("서울특별시 영등포구 양평동4가 117, 125-2, 산 12-1");

    const afterRemoveSan = removeSecondaryLotFromAddress(afterRemovePnu, {
      lotLabel: "산 12-1",
    });
    expect(afterRemoveSan).toBe("서울특별시 영등포구 양평동4가 117, 125-2");
  });

  it("auto-discovers attached lots (getBrAtchJibunInfo) when user enters '117 외 2필지' without secondary numbers", async () => {
    const { GET } = await import("@/app/api/buildings/lookup/route");
    const req = new NextRequest(
      `http://localhost/api/buildings/lookup?address=${encodeURIComponent(
        "서울특별시 영등포구 양평동4가 117 외 2필지"
      )}`
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.attachedLotsAutoDiscovered).toBe(true);
    expect(data.pnu).toBe(PNU_117);
    expect(data.pnus).toEqual([PNU_117, PNU_125_2, PNU_134]);
    expect(data.parcels).toHaveLength(3);
    expect(data.landAreaSqm).toBeCloseTo(518.7, 1);
    expect(data.gfaSqm).toBeCloseTo(2490.88, 2);
    expect(data.canonicalMultiParcelAddress).toBe(
      "서울특별시 영등포구 양평동4가 117, 125-2, 134"
    );
  });

  it("resolves the main lot building register even when a secondary lot ('134, 117, 125-2') is typed first", async () => {
    const { GET } = await import("@/app/api/buildings/lookup/route");
    const req = new NextRequest(
      `http://localhost/api/buildings/lookup?address=${encodeURIComponent(
        "서울특별시 영등포구 양평동4가 134, 117, 125-2"
      )}`
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.pnu).toBe(PNU_117);
    expect(data.gfaSqm).toBeCloseTo(2490.88, 2);
    expect(data.landAreaSqm).toBeCloseTo(518.7, 1);
    expect(data.parcels).toHaveLength(3);
  });
});

// src/lib/external/main-lot-resolver.ts
// 다필지(합필/부속지번) 대표지번 해석 — 건축물대장 표제부는 '대표지번' 한 필지에만 존재한다.
// 중개인이 부속지번(예: p5 134, 125-2)을 먼저 입력해도 대표지번(117)의 대장을 조회할 수 있어야 한다.
//
// 실측 (p5 양평동4가, 2026-10): 117 → 표제부 1건 + 부속지번(125-2, 134) 2건 / 134·125-2 → 표제부 0건·부속 0건.
//  → 부속→대표 역조회 API 는 없다. 따라서
//    ① 입력 필지를 각각 표제부 조회해 결과가 나오는 첫 필지를 대표로 채택 (순서 무관)
//    ② 대표지번의 부속지번 목록(getBrAtchJibunInfo)으로 관계를 확인·기록
//    ③ 전부 0건이면 도로명주소 → 지번 → PNU (카카오 주소검색; 행안부 juso 키는 2026-10 만료로 사용 불가)
// 날조 금지: 모두 실패하면 null 을 반환한다.

import {
  fetchBuildingRegister,
  fetchBuildingAttachedLots,
  type BuildingRegisterData,
} from "./building-register-api";
import { searchAddress } from "@/domain/verification/address-resolver";
import { createModuleLogger } from "@/lib/logger";

const logger = createModuleLogger("main-lot-resolver");

/** 동시 조회 상한 (공공데이터 API 과부하·소켓 오류 방지) */
export const MAIN_LOT_CONCURRENCY = 3;

export interface MainLotResolution {
  /** 표제부가 존재하는 대표지번 PNU (19자리) */
  mainPnu: string;
  /** [대표, ...나머지(입력 순서 유지)] — 호출부가 primary PNU 로 쓰기 위한 정렬 결과 */
  orderedPnus: string[];
  /** 대표지번의 부속지번 PNU 전체 (getBrAtchJibunInfo) */
  attachedLots: string[];
  /** 입력 필지 중 부속지번으로 확인된 PNU */
  attachedInInput: string[];
  /** 대표지번 선정 근거: register_title=표제부 조회 / road_address=도로명주소→지번 폴백 */
  source: "register_title" | "road_address";
  /** 대표지번 조회 시 이미 받은 대장 (호출부 재조회 방지) */
  register: BuildingRegisterData;
}

export interface MainLotDeps {
  fetchRegister: typeof fetchBuildingRegister;
  fetchAttachedLots: typeof fetchBuildingAttachedLots;
  /** 도로명/지번 주소 → PNU 후보 (19자리). 기본: 카카오 주소검색 */
  addressToPnu: (address: string) => Promise<string | null>;
}

async function defaultAddressToPnu(address: string): Promise<string | null> {
  const results = await searchAddress(address, 1);
  const pnu = results.find((r) => /^\d{19}$/.test(r.pnu ?? ""))?.pnu;
  return pnu ?? null;
}

// 호출 시점에 import 바인딩을 읽는다 (모듈 로드 시점 접근 금지 — 부분 목킹된 테스트 보호)
const DEFAULT_DEPS: MainLotDeps = {
  fetchRegister: (...a) => fetchBuildingRegister(...a),
  fetchAttachedLots: (...a) => fetchBuildingAttachedLots(...a),
  addressToPnu: defaultAddressToPnu,
};

function parts(pnu: string) {
  return {
    sigunguCd: pnu.substring(0, 5),
    bjdongCd: pnu.substring(5, 10),
    platGbCd: pnu.charAt(10) === "2" ? "1" : "0",
    bun: pnu.substring(11, 15),
    ji: pnu.substring(15, 19),
  };
}

/** 최대 limit 개씩 병렬 실행, 결과 순서는 입력 순서 유지 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function lookupRegister(pnu: string, deps: MainLotDeps): Promise<BuildingRegisterData | null> {
  const p = parts(pnu);
  try {
    return await deps.fetchRegister(p.sigunguCd, p.bjdongCd, p.bun, p.ji, undefined, p.platGbCd);
  } catch (err) {
    logger.warn(`register lookup failed for ${pnu}`, { err });
    return null;
  }
}

async function finalize(
  mainPnu: string,
  register: BuildingRegisterData,
  inputPnus: string[],
  source: MainLotResolution["source"],
  deps: MainLotDeps,
): Promise<MainLotResolution> {
  const p = parts(mainPnu);
  let attachedLots: string[] = [];
  try {
    attachedLots = await deps.fetchAttachedLots(p.sigunguCd, p.bjdongCd, p.bun, p.ji, p.platGbCd);
  } catch (err) {
    logger.warn(`attached-lots lookup failed for ${mainPnu}`, { err });
  }
  return {
    mainPnu,
    orderedPnus: [mainPnu, ...inputPnus.filter((x) => x !== mainPnu)],
    attachedLots,
    attachedInInput: inputPnus.filter((x) => x !== mainPnu && attachedLots.includes(x)),
    source,
    register,
  };
}

/**
 * 다필지 입력에서 건축물대장(표제부)이 존재하는 대표지번을 찾는다. 입력 순서와 무관하다.
 *
 * @param pnus        19자리 PNU 목록 (그 외 형식은 무시)
 * @param roadAddress 선택: 모든 필지가 0건일 때 도로명주소→지번→PNU 폴백에 사용
 * @returns 대표지번 해석 결과, 어디서도 대장을 찾지 못하면 null (날조 금지)
 */
export async function resolveMainLotPnu(
  pnus: string[],
  roadAddress?: string,
  deps: Partial<MainLotDeps> = {},
): Promise<MainLotResolution | null> {
  const d: MainLotDeps = { ...DEFAULT_DEPS, ...deps };
  const input = Array.from(new Set((pnus ?? []).map((p) => String(p).replace(/[^0-9]/g, "")).filter((p) => p.length === 19)));

  // ① 필지별 표제부 조회 (병렬, 동시성 제한). 결과가 나오는 '입력 순서상 첫' 필지가 대표.
  const registers = await mapLimit(input, MAIN_LOT_CONCURRENCY, (pnu) => lookupRegister(pnu, d));
  const hit = registers.findIndex((r) => r !== null);
  if (hit >= 0) {
    const res = await finalize(input[hit], registers[hit] as BuildingRegisterData, input, "register_title", d);
    logger.info(`main lot ${res.mainPnu} (attached: ${res.attachedLots.length}, input order idx=${hit})`);
    return res;
  }

  // ③ 폴백: 도로명주소 → 지번 → PNU (이미 0건으로 확인된 필지는 재조회하지 않음)
  const cleanAddr = (roadAddress ?? "").replace(/\s*외\s*\d*\s*필지/g, "").trim();
  if (cleanAddr.length >= 2) {
    try {
      const candidate = await d.addressToPnu(cleanAddr);
      if (candidate && !input.includes(candidate)) {
        const reg = await lookupRegister(candidate, d);
        if (reg) {
          const res = await finalize(candidate, reg, input, "road_address", d);
          logger.info(`main lot ${candidate} resolved from road address`);
          return res;
        }
      }
    } catch (err) {
      logger.warn("road-address main lot fallback failed", { err });
    }
  }
  return null;
}

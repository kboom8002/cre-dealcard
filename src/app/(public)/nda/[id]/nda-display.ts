import { maskAddressForPublic } from "@/lib/magazine/public-page-data";

/**
 * P1-2 (WP-7.3A): pre-NDA display label for the target property.
 *
 * The NDA page is reachable without signing anything, so it must never reveal the
 * exact address (지번/도로명 번호). Only an area-level signal is rendered:
 *  1. `area_signal` (already area-level by contract) — still passed through the public
 *     masking helper as defence in depth;
 *  2. otherwise the address reduced to 시/도·구/군·동/읍/면 tokens + "일대";
 *  3. otherwise a masked workspace title, then the asset type, then a generic label.
 */
export const NDA_FALLBACK_TITLE = "대상 부동산";

const AREA_TOKEN_RE = /(?:특별시|광역시|특별자치시|특별자치도|시|도|구|군|동|읍|면|\d+가)$/;
const ROAD_OR_LOT_TOKEN_RE = /(?:대로|로|길|번길)$|\d/;

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** "서울특별시 강남구 역삼동 123-45 3층" → "서울특별시 강남구 역삼동 일대" */
export function toAreaLevelLabel(address: unknown): string {
  const normalized = cleanString(address);
  if (!normalized) return "";
  const areaTokens: string[] = [];
  for (const token of normalized.split(" ")) {
    const isArea = AREA_TOKEN_RE.test(token);
    if (isArea && (!ROAD_OR_LOT_TOKEN_RE.test(token) || /\d+가$/.test(token))) {
      areaTokens.push(token);
      continue;
    }
    // stop at the first road name / lot number / building token
    if (ROAD_OR_LOT_TOKEN_RE.test(token) || areaTokens.length > 0) break;
  }
  if (areaTokens.length === 0) return "";
  return maskAddressForPublic(`${areaTokens.join(" ")} 일대`);
}

export function resolveNdaPublicBuildingTitle(input: {
  areaSignal?: unknown;
  address?: unknown;
  assetType?: unknown;
  workspaceTitle?: unknown;
}): string {
  const area = cleanString(input.areaSignal);
  if (area) {
    const maskedArea = maskAddressForPublic(area);
    if (maskedArea) return maskedArea;
  }

  const fromAddress = toAreaLevelLabel(input.address);
  if (fromAddress) return fromAddress;

  const title = cleanString(input.workspaceTitle);
  if (title) {
    const maskedTitle = maskAddressForPublic(title);
    if (maskedTitle) return maskedTitle;
  }

  const assetType = cleanString(input.assetType);
  if (assetType) return assetType;

  return NDA_FALLBACK_TITLE;
}

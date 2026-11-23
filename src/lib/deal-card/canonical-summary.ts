/**
 * Canonical Deal Summary Projector (client + server safe — pure TypeScript, zero Node imports).
 *
 * Unifies DealCard, IM Lite, and Newsletter featured-deal projection:
 * - Single pyeong conversion constant (`3.305785`) and integer rounding for card badges
 * - Posture-aware area priority (`development`/`value_add` -> 토지/대지, `income`/`owner_occupied` -> 연면적)
 * - Specific `mainPurpose` preservation over generic `'근린생활시설'`
 * - Non-generic broker headline preservation
 */

export const SQM_PER_PYEONG = 3.305785;

export function toPositiveNumber(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw === "string") {
    const n = Number(raw.replace(/,/g, "").trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export function sqmToRoundedPyeong(sqm: unknown): number | null {
  const n = toPositiveNumber(sqm);
  if (!n) return null;
  return Math.round(n / SQM_PER_PYEONG);
}

export function normalizeRoundedPyeong(pyeongOrSqm: {
  pyeong?: unknown;
  sqm?: unknown;
}): number | null {
  const py = toPositiveNumber(pyeongOrSqm.pyeong);
  if (py) return Math.round(py);
  return sqmToRoundedPyeong(pyeongOrSqm.sqm);
}

export function isLandPriorityPosture(posture: unknown): boolean {
  if (typeof posture !== "string") return false;
  const p = posture.trim().toLowerCase();
  return (
    p === "development" ||
    p === "value_add" ||
    p === "개발형" ||
    p === "밸류애드형" ||
    p.includes("개발") ||
    p.includes("신축") ||
    p.includes("토지")
  );
}

export function resolveCanonicalAreaLabel(input: {
  posture?: unknown;
  explicitAreaLabel?: unknown;
  gfaSqm?: unknown;
  landSqm?: unknown;
  gfaPyeong?: unknown;
  landPyeong?: unknown;
}): string {
  const landPy = normalizeRoundedPyeong({
    pyeong: input.landPyeong,
    sqm: input.landSqm,
  });
  const gfaPy = normalizeRoundedPyeong({
    pyeong: input.gfaPyeong,
    sqm: input.gfaSqm,
  });
  const explicit =
    typeof input.explicitAreaLabel === "string"
      ? input.explicitAreaLabel.trim()
      : "";

  if (isLandPriorityPosture(input.posture)) {
    if (landPy && landPy > 0) return `토지 ${landPy}평`;
    if (
      explicit &&
      (explicit.startsWith("토지") || explicit.startsWith("대지")) &&
      !/^(?:토지|대지)\s*0+(?:\.0+)?\s*(?:평|㎡)/.test(explicit)
    ) {
      return explicit;
    }
    if (gfaPy && gfaPy > 0) return `연면적 ${gfaPy}평`;
    return /^(?:연면적|토지|대지)?\s*0+(?:\.0+)?\s*(?:평|㎡)/.test(explicit) ? "" : explicit;
  }

  if (gfaPy && gfaPy > 0) return `연면적 ${gfaPy}평`;
  if (explicit && !/^(?:연면적|토지|대지)?\s*0+(?:\.0+)?\s*(?:평|㎡)/.test(explicit)) return explicit;
  if (landPy && landPy > 0) return `대지 ${landPy}평`;
  return "";
}

const GENERIC_ASSET_USES = new Set([
  "근린생활시설",
  "상업용 빌딩",
  "상업용 부동산",
  "상가/빌딩",
  "빌딩",
]);

export function isGenericAssetUse(use: unknown): boolean {
  if (typeof use !== "string") return true;
  const trimmed = use.trim();
  return !trimmed || GENERIC_ASSET_USES.has(trimmed);
}

export function resolveCanonicalAssetUse(input: {
  mainPurpose?: unknown;
  assetType?: unknown;
  existingUse?: unknown;
  fallbackUse?: string;
}): string {
  const candidates = [
    input.mainPurpose,
    input.assetType,
    input.existingUse,
  ]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);

  const specific = candidates.find((c) => !isGenericAssetUse(c));
  if (specific) return specific;
  if (candidates.length > 0) return candidates[0];
  return input.fallbackUse || "근린생활시설";
}

export function isGenericPlaceholderHeadline(
  text: unknown,
  region?: unknown,
  assetUse?: unknown,
): boolean {
  if (typeof text !== "string") return true;
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return true;
  const r = typeof region === "string" ? region.replace(/\s+/g, " ").trim() : "";
  const u = typeof assetUse === "string" ? assetUse.replace(/\s+/g, " ").trim() : "";
  if (r && u) {
    const combo = `${r} ${u}`;
    if (
      trimmed === combo ||
      trimmed === `${combo} 매각` ||
      trimmed === `${r} ${u} 빌딩`
    ) {
      return true;
    }
  }
  return (
    /^(?:새\s*IM|새\s*딜카드|매물\s*IM|상업용\s*부동산)$/.test(trimmed) ||
    /^(?:[가-힣]{2,6}(?:시|구|군)\s+)?[가-힣0-9]{1,8}(?:동|읍|면|리|가|권역)\s+(?:근린생활시설|제[12]종근린생활시설|제1·2종\s*근린생활시설|근생빌딩|꼬마빌딩|업무시설|상업용\s*부동산|상업용\s*빌딩)(?:\s+매각)?$/.test(
      trimmed,
    )
  );
}

export function resolveCanonicalDealHeadline(input: {
  brokerHeadline?: unknown;
  card4Headline?: unknown;
  ogTitle?: unknown;
  existingHeadline?: unknown;
  region?: unknown;
  assetType?: unknown;
}): string {
  const rawCandidates = [
    input.brokerHeadline,
    input.card4Headline,
    input.ogTitle,
    input.existingHeadline,
  ]
    .map((v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : ""))
    .filter(Boolean);

  const nonGeneric = rawCandidates.find(
    (c) => !isGenericPlaceholderHeadline(c, input.region, input.assetType),
  );
  if (nonGeneric) return nonGeneric;
  if (rawCandidates.length > 0) return rawCandidates[0];

  const r = typeof input.region === "string" ? input.region.trim() : "";
  const u = typeof input.assetType === "string" ? input.assetType.trim() : "";
  if (r && u) return `${r} ${u}`;
  return r || u || "상업용 부동산";
}

export interface CanonicalDealSummaryInput {
  posture?: unknown;
  region?: unknown;
  mainPurpose?: unknown;
  assetType?: unknown;
  existingUse?: unknown;
  explicitAreaLabel?: unknown;
  gfaSqm?: unknown;
  landSqm?: unknown;
  gfaPyeong?: unknown;
  landPyeong?: unknown;
  brokerHeadline?: unknown;
  card4Headline?: unknown;
  ogTitle?: unknown;
  existingHeadline?: unknown;
}

export interface CanonicalDealSummary {
  use: string;
  areaLabel: string;
  gfaPyeong: number | null;
  landPyeong: number | null;
  headline: string;
}

export function resolveCanonicalDealSummary(
  input: CanonicalDealSummaryInput,
): CanonicalDealSummary {
  const use = resolveCanonicalAssetUse({
    mainPurpose: input.mainPurpose,
    assetType: input.assetType,
    existingUse: input.existingUse,
  });
  const gfaPyeong = normalizeRoundedPyeong({
    pyeong: input.gfaPyeong,
    sqm: input.gfaSqm,
  });
  const landPyeong = normalizeRoundedPyeong({
    pyeong: input.landPyeong,
    sqm: input.landSqm,
  });
  const areaLabel = resolveCanonicalAreaLabel({
    posture: input.posture,
    explicitAreaLabel: input.explicitAreaLabel,
    gfaSqm: input.gfaSqm,
    landSqm: input.landSqm,
    gfaPyeong,
    landPyeong,
  });
  const headline = resolveCanonicalDealHeadline({
    brokerHeadline: input.brokerHeadline,
    card4Headline: input.card4Headline,
    ogTitle: input.ogTitle,
    existingHeadline: input.existingHeadline,
    region: input.region,
    assetType: use,
  });
  return { use, areaLabel, gfaPyeong, landPyeong, headline };
}

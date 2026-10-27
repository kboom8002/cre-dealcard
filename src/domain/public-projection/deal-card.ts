/**
 * @module public-projection/deal-card
 * @description P0-SEC (SEC-5) — explicit allowlisted public DTO for /dc/[id].
 *
 * The public deal-card page used to compute full attrs (buildAttrsFromSsotLite: address,
 * rawInput, rentRoll, floorLeases, pnu, ...) and hand them to the client component
 * PostureWidget, which serialised everything into the RSC payload.
 *
 * `toPublicDealCard()` is now the ONLY thing the page renders from. It:
 *   1. derives banded/teaser values server-side,
 *   2. copies only the fields the public UI actually reads into a fresh object,
 *   3. masks any exact address / tenant-name needle that slipped into free text,
 *   4. validates the result with a `.strict()` zod schema (unknown keys → throw).
 *
 * Never add raw_input, raw_address, exact jibun, PNU, tenant names, unit rents or
 * rent-roll rows to this schema.
 */
import { z } from 'zod';
import { buildAttrsFromSsotLite } from '@/lib/ssot-adapter';
import { projectToTeaser } from '@/domain/deal/teaser/teaser-projector';

// ── Schema ──────────────────────────────────────────────────────────────────

const TileSchema = z.object({
  emoji: z.string(),
  label: z.string(),
  value: z.string(),
}).strict();

const SliderAxisSchema = z.object({
  label: z.string(),
  min: z.number(),
  max: z.number(),
  step: z.number(),
  unit: z.string(),
}).strict();

/** Minimal numeric inputs for the posture calculators (PostureWidget + sub-widgets). */
export const PublicPostureWidgetInputSchema = z.object({
  posture: z.string(),
  assetType: z.string(),
  /** Asking price in 억원, rounded to 0.1억 (calculator default only). */
  askingPriceEok: z.number().nullable(),
  /** Aggregate annual rent in 억원, rounded to 0.1억 (never per-unit). */
  annualRentEok: z.number().nullable(),
  totalFloorAreaPyung: z.number().nullable(),
  landAreaPyung: z.number().nullable(),
  roomCount: z.number().nullable(),
  averageDailyRateManwon: z.number().nullable(),
  occupancyRatePct: z.number().nullable(),
  gopMarginPct: z.number().nullable(),
  pricePerPyung: z.number().nullable(),
  comparableAvgPricePerPyung: z.number().nullable(),
  sliderAxis2: SliderAxisSchema.nullable(),
}).strict();

export type PublicPostureWidgetInput = z.infer<typeof PublicPostureWidgetInputSchema>;

export const PublicDealCardSchema = z.object({
  id: z.string(),
  teaserConfigId: z.string(),
  hasMinimalData: z.boolean(),
  og: z.object({
    title: z.string(),
    description: z.string(),
  }).strict(),
  hero: z.object({
    archetype: z.string().nullable(),
    regionLabel: z.string(),
    title: z.string(),
    hookCopy: z.string(),
    posture: z.string(),
    postureLabel: z.string(),
    postureHeroTiles: z.array(TileSchema),
    bandedPrice: z.string(),
    bandedCapRate: z.string(),
    bandedArea: z.string(),
    vacancyLabel: z.string().nullable(),
    urgencyTag: z.enum(['urgent', 'reviewing', 'flexible']).nullable(),
  }).strict(),
  dealPoints: z.array(z.string()),
  postureWidget: PublicPostureWidgetInputSchema,
  broker: z.object({
    displayName: z.string(),
    phone: z.string().nullable(),
    slug: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    specialty: z.string().nullable(),
    responseGuaranteeHours: z.number().nullable(),
    closedDeals: z.number().nullable(),
    isLicensed: z.boolean(),
  }).strict(),
  cta: z.object({
    requireNda: z.boolean(),
    hasImDoc: z.boolean(),
    isPptxApproved: z.boolean(),
    pptxDownloadUrl: z.string(),
  }).strict(),
  policy: z.object({
    candidateCount: z.number(),
    kThreshold: z.number(),
    passed: z.boolean(),
  }).strict(),
}).strict();

export type PublicDealCard = z.infer<typeof PublicDealCardSchema>;

// ── Input ───────────────────────────────────────────────────────────────────

export interface PublicDealCardBrokerInput {
  display_name?: string | null;
  phone?: string | null;
  slug?: string | null;
  avatar_url?: string | null;
  specialty?: string | null;
  response_guarantee_hours?: number | null;
  closed_deals?: number | null;
  is_licensed?: boolean | null;
}

export interface ToPublicDealCardInput {
  id: string;
  /** readWithMigration().data — may be `{}` when the building is not found. */
  building: Record<string, any> | null | undefined;
  signalCard: {
    title?: string | null;
    area_signal?: string | null;
    asset_type?: string | null;
    price_band?: string | null;
    body?: unknown;
  } | null | undefined;
  teaserDoc: { body?: unknown } | null | undefined;
  brokerProfile: PublicDealCardBrokerInput | null | undefined;
  hasImDoc: boolean;
  isPptxApproved: boolean;
  pptxDownloadUrl: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const positiveOrNull = (v: unknown): number | null => {
  const n = numOrNull(v);
  return n !== null && n > 0 ? n : null;
};
const round1 = (n: number): number => Math.round(n * 10) / 10;
const asRecord = (v: unknown): Record<string, any> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {};

/**
 * Collects exact-location / tenant-identity strings from the raw building row so that any
 * accidental copy inside free text (AI teaser copy, hook copy, deal points) can be masked.
 */
export function collectSensitiveNeedles(building: Record<string, any> | null | undefined): string[] {
  if (!building) return [];
  const attrs = asRecord(building.attrs);
  const layers = asRecord(building.layers ?? attrs.layers);
  const location = asRecord(layers.location);
  const needles = new Set<string>();

  const addAddress = (v: unknown) => {
    if (typeof v !== 'string') return;
    const t = v.trim();
    if (t.length >= 6) needles.add(t);
    // Exact jibun / building-number tokens such as "117-3번지", "117-3", "12번지"
    for (const m of t.matchAll(/\d{1,5}-\d{1,5}(?:번지)?|\d{1,5}번지/g)) needles.add(m[0]);
    // Proper building names embedded in the address (e.g. "호산당빌딩", "OO타워")
    for (const m of t.matchAll(/[^\s,()]{2,}(?:빌딩|타워|센터|플라자|오피스텔|스퀘어|빌라|맨션|하우스)/g)) needles.add(m[0]);
  };
  addAddress(building.raw_address);
  addAddress(building.address);
  addAddress(attrs.address);
  addAddress(attrs.rawAddress);
  addAddress(attrs.raw_address);
  addAddress(location.raw_address);
  addAddress(location.exact_address);
  addAddress(location.address);

  const addName = (v: unknown) => {
    if (typeof v !== 'string') return;
    const t = v.trim();
    if (t.length >= 3) needles.add(t);
  };
  const register = asRecord(layers.building_register);
  addName(building.building_name);
  addName(attrs.buildingName);
  addName(attrs.building_name);
  addName(register.building_name);
  addName(register.bld_nm);

  const addTenant = addName;
  const leaseSummary = asRecord(building.lease_summary ?? attrs.leaseSummary ?? attrs.lease_summary);
  const tenantLists: unknown[] = [leaseSummary.tenants, layers.rent_roll, attrs.rentRoll, attrs.floorLeases];
  for (const list of tenantLists) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      const r = asRecord(row);
      addTenant(r.tenant_name);
      addTenant(r.tenantName);
      addTenant(r.name);
      addTenant(r.임차인);
      addTenant(r.상호);
    }
  }
  // Longest first so overlapping needles are fully masked.
  return Array.from(needles).sort((a, b) => b.length - a.length);
}

export function maskNeedles(text: string, needles: readonly string[]): string {
  let out = text;
  for (const n of needles) {
    if (n && out.includes(n)) out = out.split(n).join('●●●');
  }
  return out;
}

// ── Projection ──────────────────────────────────────────────────────────────

/**
 * Builds the public deal-card DTO. Pure (no I/O); throws if the result would contain
 * keys outside the allowlist.
 */
export function toPublicDealCard(input: ToPublicDealCardInput): PublicDealCard {
  const { id, building, signalCard, teaserDoc, brokerProfile } = input;

  // NOTE: readWithMigration returns `{}` for unknown ids, so this `||` fallback only applies
  // to null/undefined — identical to the previous page behaviour.
  const safeBuilding: Record<string, any> = building || {
    id,
    area_signal: signalCard?.area_signal || '비공개 권역',
    asset_type: signalCard?.asset_type || '근린생활시설',
    price_band: signalCard?.price_band || '가격 협의',
  };

  const body = asRecord(signalCard?.body);
  const imBody = asRecord(teaserDoc?.body);
  const card4 = asRecord(imBody.card4);

  // Server-only intermediate values — NEVER returned.
  const rawAttrs = buildAttrsFromSsotLite(safeBuilding);
  const attrs: Record<string, unknown> = {
    ...rawAttrs,
    areaSignal:
      rawAttrs.areaSignal ||
      signalCard?.area_signal ||
      safeBuilding.area_signal ||
      strOrNull(card4.region) ||
      strOrNull(imBody.region_display),
    priceBand:
      rawAttrs.priceBand ||
      signalCard?.price_band ||
      safeBuilding.price_band ||
      strOrNull(card4.priceBand) ||
      strOrNull(imBody.price_band),
    assetType:
      rawAttrs.assetType ||
      signalCard?.asset_type ||
      safeBuilding.asset_type ||
      strOrNull(card4.use),
  };
  const teaserView = projectToTeaser(attrs);

  const needles = collectSensitiveNeedles(building ?? null);
  const clean = (s: string) => maskNeedles(s, needles);

  const hasMinimalData = !!(
    attrs.areaSignal ||
    attrs.priceBand ||
    attrs.assetType ||
    teaserDoc ||
    card4.region ||
    card4.priceBand
  );

  // ── OG (mirrors previous generateMetadata, with card4 fallback) ──
  const card4Headline =
    card4.region || card4.use || card4.priceBand
      ? `${str(card4.region || safeBuilding.area_signal || '서울시')} ${str(card4.use || safeBuilding.asset_type || '근린생활시설')} ${str(card4.priceBand || safeBuilding.price_band || '')}`.trim()
      : '';
  const ogTitle = str(imBody.kakaoOgTitle)
    || str(imBody.ogTitle)
    || str(signalCard?.title)
    || card4Headline
    || `${safeBuilding.area_signal || '상업용 부동산'} ${safeBuilding.asset_type || '매물'} 매각`;
  const rawArea = str(card4.region) || str(safeBuilding.area_signal) || '서울 주요';
  const areaFormatted = rawArea.endsWith('권역') ? rawArea : rawArea.endsWith('권') ? `${rawArea}역` : `${rawArea} 권역`;
  const card4PointsList = Array.isArray(card4.points)
    ? card4.points.filter((p: unknown): p is string => typeof p === 'string' && p.length > 0)
    : [];
  const ogDescription = str(imBody.kakaoOgDescription)
    || str(imBody.ogDescription)
    || str(body.shortSummary)
    || (card4PointsList.length > 0 ? card4PointsList.join(' · ') : '')
    || `${areaFormatted} 블라인드 매각 딜카드`;

  // ── Hero ──
  const dealTitle =
    str(imBody.title) ||
    str(body.title) ||
    str(signalCard?.title) ||
    card4Headline ||
    '';
  const hookCopy = str(imBody.hookCopy) || str(body.hookCopy) || teaserView.hookCopy
    || `${str(card4.region) || teaserView.region || '비공개 권역'} ${str(card4.use) || safeBuilding.asset_type || '빌딩'} 매각`;
  const posture = teaserView.posture || 'income';
  const postureLabel = teaserView.postureLabel || '임대수익형';
  const urgencyRaw = teaserView.urgencyTag || body.urgencyTag;
  const urgencyTag = urgencyRaw === 'urgent' || urgencyRaw === 'reviewing' || urgencyRaw === 'flexible' ? urgencyRaw : null;

  const rawDealPoints = Array.isArray(imBody.dealPoints) && imBody.dealPoints.length > 0
    ? imBody.dealPoints
    : card4PointsList.length > 0
    ? card4PointsList
    : Array.isArray(imBody.key_points)
    ? imBody.key_points
    : [];
  const dealPoints = rawDealPoints
    .filter((p: unknown): p is string => typeof p === 'string' && p.length > 0)
    .map(clean);

  // ── Posture widget inputs (minimal, derived numbers only) ──
  const askingPriceKrw = positiveOrNull(attrs.askingPriceKrw);
  const monthlyRentKrw = positiveOrNull(attrs.monthlyRentKrw);
  const spec = asRecord(attrs.hospitalitySpec);
  const slider = teaserView.sliderAxis2;

  const postureWidget: PublicPostureWidgetInput = {
    posture,
    assetType: str(attrs.assetType) || str(attrs.asset_type),
    askingPriceEok: askingPriceKrw !== null ? round1(askingPriceKrw / 100_000_000) : null,
    annualRentEok: monthlyRentKrw !== null ? round1((monthlyRentKrw * 12) / 100_000_000) : null,
    totalFloorAreaPyung: positiveOrNull(attrs.totalFloorAreaPyung),
    landAreaPyung: positiveOrNull(attrs.landAreaPyung),
    roomCount: positiveOrNull(spec.totalRoomCount ?? attrs.roomCount),
    averageDailyRateManwon: positiveOrNull(spec.averageDailyRate),
    occupancyRatePct: positiveOrNull(spec.occupancyRate),
    gopMarginPct: positiveOrNull(spec.gopMargin),
    pricePerPyung: positiveOrNull(attrs.pricePerPyung),
    comparableAvgPricePerPyung: positiveOrNull(attrs.comparableAvgPricePerPyung),
    sliderAxis2: slider
      ? { label: str(slider.label), min: Number(slider.min), max: Number(slider.max), step: Number(slider.step), unit: str(slider.unit) }
      : null,
  };

  const disclosure = asRecord(safeBuilding.disclosure);

  const dto: PublicDealCard = {
    id,
    teaserConfigId: str(safeBuilding.id) || id,
    hasMinimalData,
    og: { title: clean(ogTitle), description: clean(ogDescription) },
    hero: {
      archetype: strOrNull(teaserView.archetypeResult?.primaryArchetype),
      regionLabel: clean(str(card4.region) || str(teaserView.region)),
      title: clean(dealTitle),
      hookCopy: clean(hookCopy),
      posture,
      postureLabel,
      postureHeroTiles: (teaserView.postureHeroTiles || []).map((t) => ({
        emoji: str(t.emoji),
        label: str(t.label),
        value: clean(str(t.value)),
      })),
      bandedPrice: str(card4.priceBand) || str(teaserView.bandedPrice),
      bandedCapRate: str(teaserView.bandedCapRate),
      bandedArea: str(teaserView.bandedArea),
      vacancyLabel: strOrNull(teaserView.vacancyLabel),
      urgencyTag,
    },
    dealPoints,
    postureWidget,
    broker: {
      displayName: str(brokerProfile?.display_name) || '담당 중개사',
      phone: strOrNull(brokerProfile?.phone),
      slug: strOrNull(brokerProfile?.slug),
      avatarUrl: strOrNull(brokerProfile?.avatar_url),
      specialty: strOrNull(brokerProfile?.specialty),
      responseGuaranteeHours: numOrNull(brokerProfile?.response_guarantee_hours),
      closedDeals: numOrNull(brokerProfile?.closed_deals),
      isLicensed: brokerProfile?.is_licensed ?? true,
    },
    cta: {
      requireNda: disclosure.requireNda === true,
      hasImDoc: input.hasImDoc,
      isPptxApproved: input.isPptxApproved,
      pptxDownloadUrl: input.pptxDownloadUrl,
    },
    policy: {
      candidateCount: teaserView.reidentResult?.candidateCount || 0,
      kThreshold: teaserView.reidentResult?.kThreshold || 20,
      passed: teaserView.reidentResult?.passed ?? true,
    },
  };

  return PublicDealCardSchema.parse(dto);
}

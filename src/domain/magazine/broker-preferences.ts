import {
  SPECIFIC_NEWS_CHANNELS,
  isSpecificNewsChannelId,
  type SpecificNewsChannelId,
} from "./news-channels";

export interface BrokerRegionPreset {
  id: string;
  label: string;
  shortLabel: string;
  keywords: readonly string[];
}

export const BROKER_REGION_PRESETS: readonly BrokerRegionPreset[] = [
  {
    id: "gbd",
    label: "강남·서초",
    shortLabel: "강남·서초",
    keywords: [
      "강남",
      "서초",
      "역삼",
      "삼성",
      "대치",
      "테헤란로",
      "논현",
      "신사",
      "압구정",
      "청담",
      "양재",
      "교대",
      "반포",
      "방배",
      "GBD",
    ],
  },
  {
    id: "mapo",
    label: "마포·홍대·합정",
    shortLabel: "마포·홍대",
    keywords: [
      "마포",
      "홍대",
      "합정",
      "연남",
      "동교",
      "서교",
      "상수",
      "망원",
      "공덕",
      "상암",
    ],
  },
  {
    id: "seongsu",
    label: "성수·왕십리",
    shortLabel: "성수·성동",
    keywords: ["성수", "성동", "왕십리", "뚝섬", "서울숲", "금호", "옥수", "건대", "광진"],
  },
  {
    id: "ybd",
    label: "여의도·영등포·당산",
    shortLabel: "여의도·YBD",
    keywords: ["여의도", "영등포", "당산", "문래", "양평", "구로", "가산", "마곡", "YBD"],
  },
  {
    id: "cbd",
    label: "종로·중구·용산",
    shortLabel: "도심·용산",
    keywords: [
      "종로",
      "중구",
      "을지로",
      "광화문",
      "명동",
      "충무로",
      "용산",
      "한남",
      "이태원",
      "삼각지",
      "서울역",
      "CBD",
    ],
  },
  {
    id: "songpa",
    label: "잠실·송파·강동",
    shortLabel: "잠실·송파",
    keywords: ["잠실", "송파", "문정", "가락", "방이", "석촌", "강동", "천호", "길동"],
  },
  {
    id: "bundang",
    label: "분당·판교·용인",
    shortLabel: "분당·판교",
    keywords: ["분당", "판교", "성남", "정자", "서현", "수내", "용인", "수지", "기흥", "광교", "수원"],
  },
  {
    id: "west_gyeonggi",
    label: "부천·인천·경기서부",
    shortLabel: "부천·인천",
    keywords: ["부천", "원미", "상동", "중동", "인천", "송도", "부평", "김포", "일산", "고양", "광명", "안양"],
  },
] as const;

export const DEFAULT_PREFERRED_REGIONS: readonly string[] = ["강남·서초", "마포·홍대·합정"] as const;

export const DEFAULT_PREFERRED_CHANNELS: readonly SpecificNewsChannelId[] = [
  "real_estate",
  "economy_finance",
  "tax_wealth",
  "commercial_trend",
] as const;

export interface BrokerNewsletterPreferences {
  preferredRegions: string[];
  preferredChannels: SpecificNewsChannelId[];
  updatedAt?: string | null;
}

export function normalizePreferredRegions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > 32) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed);
    if (cleaned.length >= 8) break;
  }
  return cleaned;
}

export function normalizePreferredChannels(raw: unknown): SpecificNewsChannelId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_PREFERRED_CHANNELS];
  const cleaned: SpecificNewsChannelId[] = [];
  const seen = new Set<SpecificNewsChannelId>();
  for (const item of raw) {
    if (!isSpecificNewsChannelId(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    cleaned.push(item);
  }
  return cleaned.length > 0 ? cleaned : [...DEFAULT_PREFERRED_CHANNELS];
}

export function normalizeBrokerPreferences(raw: unknown): BrokerNewsletterPreferences {
  if (!raw || typeof raw !== "object") {
    return {
      preferredRegions: [...DEFAULT_PREFERRED_REGIONS],
      preferredChannels: [...DEFAULT_PREFERRED_CHANNELS],
      updatedAt: null,
    };
  }
  const record = raw as Record<string, unknown>;
  const regions = normalizePreferredRegions(record.preferredRegions ?? record.specialty_regions);
  const channels = normalizePreferredChannels(record.preferredChannels ?? record.news_channels);
  return {
    preferredRegions: regions.length > 0 ? regions : [...DEFAULT_PREFERRED_REGIONS],
    preferredChannels: channels,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
  };
}

/**
 * 권역 라벨 목록(예: ["강남·서초", "마포·홍대·합정", "동교동"])을
 * 클러스터링 및 프롬프트 매칭용 세부 행정동/권역 키워드 배열로 확장합니다.
 */
export function expandRegionKeywords(regions: readonly string[]): string[] {
  const result = new Set<string>();
  for (const rawRegion of regions) {
    const trimmed = rawRegion.trim();
    if (!trimmed) continue;
    result.add(trimmed);

    const preset = BROKER_REGION_PRESETS.find(
      (p) => p.label === trimmed || p.id === trimmed || p.shortLabel === trimmed,
    );
    if (preset) {
      for (const kw of preset.keywords) {
        result.add(kw);
      }
    }

    const tokens = trimmed
      .split(/[·,/|\s]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);
    for (const token of tokens) {
      result.add(token);
      const stripped = token.replace(/(?:구|동|시|군|역)$/, "");
      if (stripped.length >= 2) {
        result.add(stripped);
      }
    }
  }
  return Array.from(result);
}

/**
 * 보유 매물 주소/제목에서 권역 프리셋 또는 지역 키워드를 자동 추출합니다.
 */
export function extractRegionsFromDeals(
  deals: ReadonlyArray<{ title?: string | null; address?: string | null }>,
): string[] {
  const matchedPresets = new Set<string>();
  const extraTokens = new Set<string>();

  for (const deal of deals) {
    const text = `${deal.title ?? ""} ${deal.address ?? ""}`.trim();
    if (!text) continue;

    for (const preset of BROKER_REGION_PRESETS) {
      if (preset.keywords.some((kw) => text.includes(kw))) {
        matchedPresets.add(preset.label);
      }
    }

    const addrParts = (deal.address ?? "")
      .split(/\s+/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 2 && /[구동시]$/.test(p));
    for (const part of addrParts.slice(0, 2)) {
      extraTokens.add(part);
    }
  }

  return Array.from(new Set([...matchedPresets, ...extraTokens]));
}

export function getPreferredChannelLabels(channels: readonly SpecificNewsChannelId[]): string[] {
  return channels.map((id) => {
    const meta = SPECIFIC_NEWS_CHANNELS.find((c) => c.id === id);
    return meta ? meta.shortLabel : id;
  });
}

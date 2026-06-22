import type { SupabaseClient } from "@supabase/supabase-js";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";
const YT_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const YT_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

// 꼬마빌딩 브로커 관련 채널 ID
const CRE_CHANNELS = [
  { id: "UCGilsanamChannel",  name: "빌사남" },     // 실제 채널 ID로 교체 필요
  { id: "UCGuhaeBuilding",    name: "구해줘빌딩" },
  { id: "UCCREStudy",         name: "상업부동산 스터디" },
  { id: "UCKingMaker",        name: "부동산 킹메이커" },
];

// 꼬마빌딩 검색 키워드
const CRE_YT_KEYWORDS = [
  "꼬마빌딩 투자",
  "상업용부동산 매매",
  "빌딩 경매 낙찰",
  "오피스 공실률",
];

export async function crawlYoutubeTrends(supabase: SupabaseClient): Promise<any[]> {
  const results: any[] = [];

  if (!YOUTUBE_API_KEY) {
    console.warn("[YouTube] YOUTUBE_API_KEY missing — using dummy data");
    return insertDummyVideos(supabase);
  }

  // 1단계: 키워드 검색으로 최신 CRE 영상 수집
  for (const keyword of CRE_YT_KEYWORDS.slice(0, 2)) {
    try {
      const searchUrl = new URL(YT_SEARCH_URL);
      searchUrl.searchParams.set("key", YOUTUBE_API_KEY);
      searchUrl.searchParams.set("q", keyword);
      searchUrl.searchParams.set("type", "video");
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("maxResults", "3");
      searchUrl.searchParams.set("order", "date");
      searchUrl.searchParams.set("relevanceLanguage", "ko");
      searchUrl.searchParams.set("regionCode", "KR");
      searchUrl.searchParams.set("publishedAfter", new Date(Date.now() - 7 * 86400000).toISOString());

      const res = await fetch(searchUrl.toString(), { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const json = await res.json();
      const items = json.items || [];

      // 조회수/좋아요 통계 일괄 조회
      const videoIds = items.map((i: any) => i.id?.videoId).filter(Boolean).join(",");
      let statsMap: Record<string, { viewCount: number; likeCount: number }> = {};

      if (videoIds) {
        try {
          const statsUrl = new URL(YT_VIDEOS_URL);
          statsUrl.searchParams.set("key", YOUTUBE_API_KEY);
          statsUrl.searchParams.set("id", videoIds);
          statsUrl.searchParams.set("part", "statistics");
          const statsRes = await fetch(statsUrl.toString(), { signal: AbortSignal.timeout(8000) });
          if (statsRes.ok) {
            const statsJson = await statsRes.json();
            for (const item of statsJson.items || []) {
              statsMap[item.id] = {
                viewCount: parseInt(item.statistics?.viewCount || "0", 10),
                likeCount: parseInt(item.statistics?.likeCount || "0", 10),
              };
            }
          }
        } catch { /* stats 실패 시 0으로 */ }
      }

      for (const item of items) {
        const videoId = item.id?.videoId;
        if (!videoId) continue;
        const snippet = item.snippet || {};
        const stats = statsMap[videoId] || { viewCount: 0, likeCount: 0 };

        const record = {
          video_id: videoId,
          title: snippet.title || "",
          channel_title: snippet.channelTitle || "",
          view_count: stats.viewCount,
          like_count: stats.likeCount,
          published_at: snippet.publishedAt || new Date().toISOString(),
          summary: (snippet.description || "").slice(0, 200),
          thumbnail_url: snippet.thumbnails?.medium?.url || "",
        };

        const { data, error } = await supabase
          .from("youtube_trends")
          .upsert(record, { onConflict: "video_id" })
          .select().single();

        if (!error && data) results.push(data);
      }
    } catch (err) {
      console.warn(`[YouTube] Keyword "${keyword}" failed:`, err);
    }
  }

  if (results.length === 0) return insertDummyVideos(supabase);
  return results;
}

async function insertDummyVideos(_supabase: SupabaseClient): Promise<any[]> {
  console.warn("[YouTube] No real video data available — returning empty");
  return [];
}


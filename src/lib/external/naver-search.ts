export interface NaverSearchItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
}

export interface NaverSearchResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverSearchItem[];
}

export async function searchNaverNews(query: string, display: number = 10): Promise<NaverSearchItem[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn("NAVER_CLIENT_ID or NAVER_CLIENT_SECRET is missing. Skipping Naver News API.");
    return [];
  }

  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${display}&sort=sim`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
      next: { revalidate: 3600 } // Cache for 1 hour
    });

    if (!res.ok) {
      throw new Error(`Naver API error: ${res.statusText}`);
    }

    const data = (await res.json()) as NaverSearchResponse;
    
    // 네이버 API는 검색어 하이라이트를 <b> 태그로 반환하므로 제거
    return data.items.map(item => ({
      ...item,
      title: item.title.replace(/<[^>]*>?/gm, ''),
      description: item.description.replace(/<[^>]*>?/gm, '')
    }));
  } catch (error) {
    console.error("Failed to fetch Naver News:", error);
    return [];
  }
}

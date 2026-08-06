import fs from "fs";

const SUPABASE_URL = "https://vwbmaulavgjwezffbxgi.supabase.co";
const envContent = fs.readFileSync(".env.local", "utf-8");
const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
const key = match[1].trim();

const headers = {
  "apikey": key,
  "Authorization": `Bearer ${key}`,
  "Content-Type": "application/json",
  "Prefer": "return=representation"
};

async function main() {
  const targetUserId = "75690b54-7407-48c5-86b4-fa11b760df74"; // hong-gildong-demo
  const targetSlug = "hong-gildong-demo";

  console.log(`Setting up Vibe Card for user: ${targetUserId} with slug: ${targetSlug}`);

  // 1. Update Profile
  console.log("\n📝 Updating profile...");
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${targetUserId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      role: "broker",
      display_name: "testuser",
      company: "한국상업부동산중개",
      phone: "010-1234-5678",
      tagline: "성공적인 빌딩 매매를 위한 최적의 파트너",
      photo_url: "https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/broker-avatars/demo/hong-gildong.png"
    }),
  });

  // 2. Delete existing broker_profiles to avoid conflicts
  console.log("\n🗑️ Deleting existing broker_profile...");
  await fetch(`${SUPABASE_URL}/rest/v1/broker_profiles?user_id=eq.${targetUserId}`, {
    method: "DELETE",
    headers
  });

  // 3. Insert new broker_profiles (Hong Gildong's data)
  console.log("\n🎨 Inserting full vibe card data...");
  const vibeData = {
    user_id: targetUserId,
    specialty_regions: ["강남구 GBD", "서초구 GBD"],
    specialty_assets: ["오피스 빌딩", "중소형 빌딩"],
    bio: "testuser 중개사는 15년 경력의 상업용 부동산 전문가로, 테헤란로 일대의 대형 오피스 빌딩 매매 및 기업 사옥 이전을 성공적으로 조율해 왔습니다.",
    is_verified: true,
    vibe_vector: { warmth: 0.85, energy: 0.35, polish: 0.70, authentic: 0.90, heritage: 0.80, futuristic: 0.20, playful: 0.30 },
    vibe_vti: "Calm-Care",
    vibe_complement: { warmth: 0.20, energy: 0.80, polish: 0.75, authentic: 0.25, heritage: 0.30, futuristic: 0.85, playful: 0.70 },
    vibe_template_id: "CC-01",
    vibe_valence: 0.88,
    vibe_trust: 0.94,
    vibe_analyzed_at: new Date().toISOString(),
    license_number: "11680-2024-00123",
    career_start_year: 2011,
    total_deal_count_self: 45,
    deal_size_range: "100억 ~ 500억",
    deal_specialty: ["오피스 매매", "사옥 매입", "토지 개발"],
    buyer_types: ["일반 기업", "자산운용사", "고액 자산가"],
    fee_policy: "법정수수료 준수 (협의 가능)",
    consult_methods: ["전화", "대면 미팅", "카카오톡"],
    response_time_hours: 2,
    kakao_channel: "hong_broker_cre",
    naver_blog_url: "https://blog.naver.com/hong_cre_deal",
    youtube_url: "https://youtube.com/@hong_cre_tv",
    linkedin_url: "https://linkedin.com/in/hong-gildong-cre",
    seo_summary: "testuser 공인중개사는 GBD(강남 권역)를 기반으로 오피스 빌딩 매매 및 사옥 매입 신뢰도 높은 컨설팅을 제공합니다.",
    slug: targetSlug,
    is_public: true
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/broker_profiles`, {
    method: "POST",
    headers,
    body: JSON.stringify(vibeData)
  });
  
  if (res.ok) {
    console.log("✅ Successfully inserted broker profile");
  } else {
    console.error("❌ Failed to insert:", await res.text());
  }
}

main().catch(console.error);

/**
 * POST /api/broker/my-card/generate
 *
 * 브로커 딜카드 콘텐츠를 생성합니다.
 * Body: { type: BrokerCardType, brokerName: string }
 * Auth: Required (broker or admin).
 */
import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { requireBroker } from "@/lib/auth-guard";
import { toApiError } from "@/lib/api-error";
import { aggregateBrokerStats } from "@/domain/broker-card/broker-stats-aggregator";
import { generateBrokerCard } from "@/domain/broker-card/broker-card-generator";
import { createServiceClient } from "@/lib/supabase/service";

const GenerateCardRequest = z.object({
  type: z.enum(["seller", "buyer", "tenant", "network", "owner"]),
  brokerName: z.string().min(1).max(50),
});

/** 한국어 이름 → URL-safe slug */
function nameToSlug(name: string): string {
  // 한글 이름을 로마자로 간이 변환
  const romanMap: Record<string, string> = {
    '가':'ga','나':'na','다':'da','라':'ra','마':'ma','바':'ba','사':'sa','아':'a','자':'ja','차':'cha','카':'ka','타':'ta','파':'pa','하':'ha',
    '김':'kim','이':'lee','박':'park','최':'choi','정':'jung','강':'kang','조':'cho','윤':'yoon','장':'jang','임':'lim',
    '한':'han','오':'oh','서':'seo','신':'shin','권':'kwon','황':'hwang','안':'an','송':'song','전':'jeon','홍':'hong',
    '유':'yoo','고':'ko','문':'moon','양':'yang','손':'son','배':'bae','백':'baek','허':'heo','노':'noh',
  };
  
  // Simple fallback: use the name as-is if it's already ASCII, otherwise generate from user ID
  if (/^[a-zA-Z0-9-]+$/.test(name)) return name.toLowerCase().replace(/\s+/g, '-');
  
  // For Korean names, try surname + given name romanization
  const chars = name.split('');
  const parts: string[] = [];
  for (const ch of chars) {
    if (romanMap[ch]) {
      parts.push(romanMap[ch]);
    }
  }
  
  if (parts.length >= 2) {
    return `${parts[0]}-${parts.slice(1).join('')}`;
  }
  
  // Fallback: use timestamp-based
  return `broker-${Date.now().toString(36)}`;
}

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  try {
    const json = await req.json();
    const input = GenerateCardRequest.parse(json);

    const stats = await aggregateBrokerStats(user!.id);
    const card = generateBrokerCard(stats, input.type, input.brokerName);

    // broker_profiles에서 slug 조회, 없으면 자동 생성
    const supabase = createServiceClient();
    const { data: bp } = await supabase
      .from("broker_profiles")
      .select("slug, user_id")
      .eq("user_id", user!.id)
      .maybeSingle();

    let slug = bp?.slug || null;

    // slug가 없으면 자동 생성
    if (!slug) {
      const autoSlug = nameToSlug(input.brokerName);
      
      if (bp) {
        // broker_profiles 행이 존재하지만 slug가 없는 경우 → UPDATE
        await supabase
          .from("broker_profiles")
          .update({ slug: autoSlug, is_public: true })
          .eq("user_id", user!.id);
      } else {
        // broker_profiles 행 자체가 없는 경우 → INSERT
        await supabase
          .from("broker_profiles")
          .insert({ user_id: user!.id, slug: autoSlug, is_public: true });
      }
      slug = autoSlug;
    }

    return Response.json({
      ok: true,
      data: card,
      slug,
      vibeCardUrl: slug ? `/vibe-card/${slug}` : null,
    });
  } catch (error) {
    console.error("Broker Card Generate Route Error:", error);
    return toApiError(error);
  }
}

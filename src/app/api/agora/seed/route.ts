/**
 * POST /api/agora/seed
 * QIS 시드 질문 배치 생성 (admin 전용)
 *
 * 헤더: x-admin-key 필요
 * 25개 시드 질문을 agora_threads에 upsert합니다.
 * 작성자는 페르소나 이름으로 자동 설정됩니다.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateSeedQuestions } from "@/domain/agora/qis-seed-generator";
import { generateAIAnswer } from "@/domain/agora/ai-answer-generator";

export async function POST(req: NextRequest) {
  // admin 보안 검증
  const adminKey = req.headers.get("x-admin-key");
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const seeds = generateSeedQuestions();

  const rows = seeds.map((seed) => {
    const aiResult = generateAIAnswer({
      questionTitle:   seed.title,
      questionContent: seed.content,
      category:        seed.category,
      region:          seed.region,
    });

    return {
      title:                seed.title,
      content:              seed.content,
      category:             seed.category,
      region:               seed.region,
      author_id:            null,
      author_name:          seed.authorName, // 페르소나 이름
      is_seed:              true,
      tags:                 seed.tags,
      is_hot:               false,
      ai_answer:            `${aiResult.content}\n\n${aiResult.disclaimer}`,
      matched_deal_ids:     [],
      market_report_region: aiResult.marketReportRegion,
      status:               "published",
    };
  });

  const { data, error } = await supabase
    .from("agora_threads")
    .upsert(rows, { onConflict: "title" })
    .select("id, title, author_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    message: `${data?.length ?? 0}개 시드 질문이 생성되었습니다.`,
    seeded:  data?.map((d: { id: string; title: string; author_name: string }) => ({
      id:         d.id,
      title:      d.title,
      authorName: d.author_name,
    })),
  });
}

export const runtime = "nodejs";

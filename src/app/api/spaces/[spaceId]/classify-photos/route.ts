/**
 * API: POST /api/spaces/[spaceId]/classify-photos
 * 사진 분류 에이전트 호출
 */
import { NextRequest, NextResponse } from "next/server";
import { runVisualClassificationAgent } from "@/ai/agents/visual-classification-agent";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const { spaceId } = await params;
    const body = await req.json();

    const result = await runVisualClassificationAgent({
      space_context: {
        space_id: spaceId,
        target_tenant_types: body.target_tenant_types,
      },
      visual_assets: body.visual_assets || [],
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "사진 분류에 실패했습니다.", detail: String(error) },
      { status: 500 },
    );
  }
}

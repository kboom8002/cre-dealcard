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

const GenerateCardRequest = z.object({
  type: z.enum(["seller", "buyer", "tenant", "network", "owner"]),
  brokerName: z.string().min(1).max(50),
});

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  try {
    const json = await req.json();
    const input = GenerateCardRequest.parse(json);

    const stats = await aggregateBrokerStats(user!.id);
    const card = generateBrokerCard(stats, input.type, input.brokerName);

    return Response.json({
      ok: true,
      data: card,
    });
  } catch (error) {
    console.error("Broker Card Generate Route Error:", error);
    return toApiError(error);
  }
}

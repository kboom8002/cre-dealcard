/**
 * POST /api/gate-requests
 *
 * Create a Gate Request Lite for a building.
 * Auth: Optional (anonymous requests permitted for G1).
 *
 * Source: docs/08-api-contracts.md section 12
 */
import { z } from "zod/v4";
import { createGateRequest } from "@/domain/gate/gate-request";
import { toApiError } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/magazine/public-guard";

const MAX_BODY_BYTES = 16 * 1024;

const GateRequestCreateSchema = z.object({
  buildingId: z.string().min(1).max(120).optional(),
  building_id: z.string().min(1).max(120).optional(),
  requestedLevel: z.enum(["G1", "G2", "G3"]).default("G1"),
  requestedFields: z.array(z.string().max(64)).max(20).default([]),
  reason: z.string().max(2000).optional(),
  name: z.string().max(60).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().trim().max(120).optional(),
  company: z.string().max(100).optional(),
  message: z.string().max(1000).optional(),
});

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req) ?? "unknown";
    const allowed = await checkRateLimit(ip, "public_gate_requests", 20, 10 * 60 * 1000);
    if (!allowed) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
          },
        },
        { status: 429 },
      );
    }

    const declaredLen = Number(req.headers.get("content-length"));
    if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "요청 본문이 너무 큽니다.",
          },
        },
        { status: 413 },
      );
    }

    const rawText = await req.text();
    if (Buffer.byteLength(rawText, "utf8") > MAX_BODY_BYTES) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "요청 본문이 너무 큽니다.",
          },
        },
        { status: 413 },
      );
    }

    let json: unknown;
    try {
      json = rawText ? JSON.parse(rawText) : {};
    } catch {
      return Response.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "요청 형식이 올바르지 않습니다.",
          },
        },
        { status: 400 },
      );
    }

    const input = GateRequestCreateSchema.parse(json);
    const effectiveBuildingId = (input.buildingId || input.building_id || "").trim();
    if (!effectiveBuildingId) {
      return Response.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "buildingId is required" } },
        { status: 400 },
      );
    }

    const effectiveReason =
      input.reason ||
      (input.name || input.phone || input.email
        ? JSON.stringify({
            type: "anonymous_lead",
            name: input.name?.trim(),
            phone: input.phone?.trim(),
            email: input.email?.trim() || undefined,
            company: input.company?.trim() || undefined,
            message: input.message?.trim() || "상세 IM 열람을 요청합니다.",
          })
        : undefined);

    const result = await createGateRequest(
      {
        buildingId: effectiveBuildingId,
        requestedLevel: input.requestedLevel,
        requestedFields: input.requestedFields,
        reason: effectiveReason,
      },
      null, // anonymous in MVP
    );

    return Response.json({ ok: true, id: result.gateRequestId, data: result });
  } catch (error) {
    return toApiError(error);
  }
}

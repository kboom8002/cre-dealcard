/**
 * POST /api/public/building-radar/generate
 *
 * Public Deal Curiosity Report generation endpoint.
 * Guarded with strict IP rate limiting (5 req/hr per IP), body size cap,
 * input length bounds, and sanitized error responses.
 *
 * Source: docs/08-api-contracts.md section 5
 */
import { PublicBuildingRadarGenerateRequest } from "@/ai/schemas/api-building-radar";
import { generateBuildingRadar } from "@/domain/building/building-radar";
import { toApiError } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/magazine/public-guard";

const MAX_BODY_BYTES = 8 * 1024;
const MAX_INPUT_CHARS = 1000;

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req) ?? "unknown";
    const allowed = await checkRateLimit(
      ip,
      "public_building_radar_generate",
      5,
      60 * 60 * 1000,
    );
    if (!allowed) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: "요청이 너무 많습니다. 1시간 후 다시 시도해 주세요.",
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

    const input = PublicBuildingRadarGenerateRequest.parse(json);
    const trimmedInput = input.input.trim();
    if (trimmedInput.length < 2 || input.input.length > MAX_INPUT_CHARS) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "입력값은 2자 이상 1,000자 이내여야 합니다.",
          },
        },
        { status: 400 },
      );
    }

    const result = await generateBuildingRadar({
      ...input,
      input: trimmedInput,
    });

    return Response.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return toApiError(error);
  }
}

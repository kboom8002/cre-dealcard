import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin, verifyAuth } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/magazine/public-guard";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("route");

const MAX_SURVEY_BODY_BYTES = 16 * 1024;
const MAX_ANSWER_DEPTH = 4;
const MAX_ANSWER_KEYS = 50;
const MAX_ANSWER_ARRAY_ITEMS = 50;
const MAX_ANSWER_KEY_LENGTH = 100;
const MAX_ANSWER_STRING_LENGTH = 1000;
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeSurveyValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    return value.slice(0, MAX_ANSWER_STRING_LENGTH);
  }
  if (depth >= MAX_ANSWER_DEPTH) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value.slice(0, MAX_ANSWER_ARRAY_ITEMS)) {
      const sanitized = sanitizeSurveyValue(item, depth + 1);
      if (sanitized !== undefined) {
        out.push(sanitized);
      }
    }
    return out;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [rawKey, rawVal] of Object.entries(value as Record<string, unknown>)) {
      if (count >= MAX_ANSWER_KEYS) break;
      if (!rawKey || FORBIDDEN_OBJECT_KEYS.has(rawKey)) continue;
      const safeKey = rawKey.slice(0, MAX_ANSWER_KEY_LENGTH);
      if (FORBIDDEN_OBJECT_KEYS.has(safeKey)) continue;
      const sanitized = sanitizeSurveyValue(rawVal, depth + 1);
      if (sanitized !== undefined) {
        out[safeKey] = sanitized;
        count += 1;
      }
    }
    return out;
  }
  return undefined;
}

async function resolveVerifiedSessionUserId(
  request: NextRequest,
): Promise<string | null> {
  const hasAuthHeader = Boolean(request.headers.get("authorization")?.trim());
  const hasCookies = request.cookies.getAll().length > 0;
  if (!hasAuthHeader && !hasCookies) {
    return null;
  }

  try {
    const authRes = await verifyAuth(request);
    if (!authRes.error && authRes.user?.id && UUID_RE.test(authRes.user.id)) {
      return authRes.user.id;
    }
  } catch {
    // Unverified or offline auth context defaults to anonymous (null)
  }
  return null;
}

/**
 * POST /api/public/surveys
 * Public survey telemetry submission (IP rate-limited, 16KB body cap, session-only user_id).
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request) ?? "anonymous";
    const allowed = await checkRateLimit(ip, "public_surveys_post", 20, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429 },
      );
    }

    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_SURVEY_BODY_BYTES) {
      return NextResponse.json(
        { error: "요청 본문 크기가 허용 한도(16KB)를 초과했습니다." },
        { status: 413 },
      );
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_SURVEY_BODY_BYTES) {
      return NextResponse.json(
        { error: "요청 본문 크기가 허용 한도(16KB)를 초과했습니다." },
        { status: 413 },
      );
    }

    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json(
          { error: "올바른 요청 형식이 아닙니다." },
          { status: 400 },
        );
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "올바른 JSON 형식이 아닙니다." },
        { status: 400 },
      );
    }

    const { stepIndex, answers } = body;
    if (
      typeof stepIndex !== "number" ||
      !Number.isInteger(stepIndex) ||
      stepIndex < 0 ||
      stepIndex > 100 ||
      !answers ||
      typeof answers !== "object" ||
      Array.isArray(answers)
    ) {
      return NextResponse.json(
        { error: "stepIndex와 answers가 필요합니다." },
        { status: 400 },
      );
    }

    const sanitizedAnswers = sanitizeSurveyValue(answers, 0) as Record<
      string,
      unknown
    >;
    const verifiedUserId = await resolveVerifiedSessionUserId(request);

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("poc_surveys")
      .insert({
        user_id: verifiedUserId,
        step_index: stepIndex,
        answers: sanitizedAnswers,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    log.error("[api/public/surveys] POST Error:", err);
    return NextResponse.json(
      { error: "설문 저장 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

/**
 * GET /api/public/surveys
 * Admin-only endpoint for inspecting PoC survey submissions.
 */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("poc_surveys")
      .select("*")
      .order("completed_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (err: unknown) {
    log.error("[api/public/surveys] GET Error:", err);
    return NextResponse.json(
      { error: "설문 목록을 불러오는 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

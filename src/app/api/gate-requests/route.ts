/**
 * POST /api/gate-requests
 *
 * Create a Gate Request Lite for a building.
 * Auth: Optional (anonymous requests permitted for G1).
 *
 * Source: docs/08-api-contracts.md section 12
 */
import crypto from "node:crypto";
import { z } from "zod/v4";
import { createGateRequest } from "@/domain/gate/gate-request";
import { toApiError } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limiter";
import { isRealProductionRuntime } from "@/lib/env";
import { getClientIp } from "@/lib/magazine/public-guard";

const MAX_BODY_BYTES = 16 * 1024;
export const GATE_VERIFIED_COOKIE_NAME = "cre_gate_verified";

function getGateCookieSecret(): string {
  const s =
    (process.env.SHARE_LINK_SECRET || "").trim() ||
    (process.env.UNSUBSCRIBE_SECRET || "").trim() ||
    (process.env.NEXTAUTH_SECRET || "").trim();
  if (s) return s;
  if (!isRealProductionRuntime()) return "credeal-dev-gate-cookie-v1";
  return "";
}

export function signGateVerifiedCookie(buildingIds: string[]): string | null {
  const secret = getGateCookieSecret();
  if (!secret) return null;
  const cleanIds = Array.from(new Set(buildingIds.map((b) => b.trim()).filter(Boolean))).slice(-20);
  const exp = Math.floor(Date.now() / 1000) + 30 * 86400;
  const payload = Buffer.from(JSON.stringify({ ids: cleanIds, exp }), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyGateCookieIds(rawCookie: string | undefined | null): Set<string> {
  const empty = new Set<string>();
  const secret = getGateCookieSecret();
  if (!rawCookie || !secret) return empty;
  const parts = rawCookie.split(".");
  if (parts.length !== 2) return empty;
  const [payload, sig] = parts;
  if (!payload || !sig) return empty;
  const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expectedSig, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return empty;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      ids?: unknown;
      exp?: unknown;
    };
    if (typeof decoded.exp !== "number" || decoded.exp < Math.floor(Date.now() / 1000)) return empty;
    if (!Array.isArray(decoded.ids)) return empty;
    return new Set(decoded.ids.filter((v): v is string => typeof v === "string" && v.trim().length > 0));
  } catch {
    return empty;
  }
}

function parseCookiesFromHeader(cookieHeader: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out.set(k, v);
  }
  return out;
}

function reasonHasPii(reason?: string): boolean {
  if (!reason) return false;
  try {
    const parsed = JSON.parse(reason) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      return Boolean(
        String(parsed.name || "").trim() ||
          String(parsed.phone || "").trim() ||
          String(parsed.email || "").trim(),
      );
    }
  } catch {
    // Plain text reason without structured JSON PII fields
  }
  return false;
}

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
  privacyConsent: z.boolean().optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const buildingId = (url.searchParams.get("buildingId") || "").trim();
  if (!buildingId) {
    return Response.json({ ok: true, verified: false });
  }
  const cookies = parseCookiesFromHeader(req.headers.get("cookie"));
  const verifiedIds = verifyGateCookieIds(cookies.get(GATE_VERIFIED_COOKIE_NAME));
  return Response.json({ ok: true, verified: verifiedIds.has(buildingId) });
}

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

    const submitsPii = Boolean(
      input.name?.trim() ||
        input.phone?.trim() ||
        input.email?.trim() ||
        reasonHasPii(input.reason),
    );
    if (submitsPii && input.privacyConsent !== true) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "PRIVACY_CONSENT_REQUIRED",
            message: "개인정보 수집·이용에 동의해 주셔야 상세 자료 요청이 가능합니다.",
          },
        },
        { status: 400 },
      );
    }

    const consentMeta =
      input.privacyConsent === true
        ? { privacyConsentedAt: new Date().toISOString(), privacyConsentVersion: "v1" }
        : {};

    let effectiveReason: string | undefined = input.reason;
    if (effectiveReason && input.privacyConsent === true) {
      try {
        const parsedReason = JSON.parse(effectiveReason) as Record<string, unknown>;
        if (parsedReason && typeof parsedReason === "object" && !Array.isArray(parsedReason)) {
          effectiveReason = JSON.stringify({ ...parsedReason, ...consentMeta });
        }
      } catch {
        // leave plain string reason intact
      }
    } else if (!effectiveReason && (input.name || input.phone || input.email)) {
      effectiveReason = JSON.stringify({
        type: "anonymous_lead",
        name: input.name?.trim(),
        phone: input.phone?.trim(),
        email: input.email?.trim() || undefined,
        company: input.company?.trim() || undefined,
        message: input.message?.trim() || "상세 IM 열람을 요청합니다.",
        ...consentMeta,
      });
    }

    const result = await createGateRequest(
      {
        buildingId: effectiveBuildingId,
        requestedLevel: input.requestedLevel,
        requestedFields: input.requestedFields,
        reason: effectiveReason,
      },
      null, // anonymous in MVP
    );

    const existingCookies = parseCookiesFromHeader(req.headers.get("cookie"));
    const verifiedIds = Array.from(verifyGateCookieIds(existingCookies.get(GATE_VERIFIED_COOKIE_NAME)));
    verifiedIds.push(effectiveBuildingId);
    const cookieVal = signGateVerifiedCookie(verifiedIds);

    const res = Response.json({ ok: true, id: result.gateRequestId, data: result });
    if (cookieVal) {
      const secureFlag = isRealProductionRuntime() ? "; Secure" : "";
      res.headers.set(
        "Set-Cookie",
        `${GATE_VERIFIED_COOKIE_NAME}=${cookieVal}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secureFlag}`,
      );
    }
    return res;
  } catch (error) {
    return toApiError(error);
  }
}

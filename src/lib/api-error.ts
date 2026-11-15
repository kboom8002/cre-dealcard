/**
 * API error helper — maps errors to safe user-facing responses.
 * Source: docs/08-api-contracts.md sections 3-4
 */
import { ZodError } from "zod/v4";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api-error");

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "AI_GENERATION_FAILED"
  | "DISCLOSURE_VIOLATION"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class BaseApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public status = 500
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class AiGenerationError extends BaseApiError {
  constructor(message = "AI 처리 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.") {
    super("AI_GENERATION_FAILED", message, 500);
  }
}

export class UnauthorizedError extends BaseApiError {
  constructor(message = "인증이 필요합니다.") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends BaseApiError {
  constructor(message = "권한이 없습니다.") {
    super("FORBIDDEN", message, 403);
  }
}

export class NotFoundError extends BaseApiError {
  constructor(message = "요청한 리소스를 찾을 수 없습니다.") {
    super("NOT_FOUND", message, 404);
  }
}

export class ValidationError extends BaseApiError {
  constructor(message = "입력값을 확인해주세요.") {
    super("VALIDATION_ERROR", message, 400);
  }
}

interface ApiError {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

const INTERNAL_LEAK_RE =
  /\b(?:SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM|PGRST\d{3}|SQLSTATE|42P01|42703|23505|23503|relation\s+"[^"]+"\s+does\s+not\s+exist|column\s+"?[^"]+"?\s+does\s+not\s+exist|syntax\s+error\s+at\s+or\s+near|violates\s+(?:foreign\s+key|unique|check|not-null)\s+constraint|sk-[a-zA-Z0-9_-]{12,}|eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b|(?:^\s*at\s+\S+\s*\()/im;

export function safeErrorMessage(
  err: unknown,
  fallback = "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
): string {
  if (err instanceof BaseApiError) {
    if (INTERNAL_LEAK_RE.test(err.message)) {
      return fallback;
    }
    return err.message;
  }
  if (err instanceof ZodError) {
    return "입력값을 확인해주세요.";
  }
  if (process.env.NODE_ENV === "production") {
    return fallback;
  }
  if (err instanceof Error && err.message && !INTERNAL_LEAK_RE.test(err.message)) {
    return err.message;
  }
  return fallback;
}

export function toApiError(err: unknown): Response {
  if (err instanceof BaseApiError) {
    if (err.status >= 500) {
      log.error(`[API BaseApiError] ${err.code}: ${err.message}`, err, { code: err.code, status: err.status });
    } else {
      log.warn(`[API BaseApiError] ${err.code}: ${err.message}`, { code: err.code, status: err.status });
    }
    const safeMsg = INTERNAL_LEAK_RE.test(err.message)
      ? "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
      : err.message;
    return Response.json(
      {
        ok: false,
        error: {
          code: err.code,
          message: safeMsg,
        },
      } satisfies ApiError,
      { status: err.status },
    );
  }

  if (err instanceof ZodError) {
    log.warn("[API ZodError] Input validation failed", { issues: err.issues });
    return Response.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "입력값을 확인해주세요.",
        },
      } satisfies ApiError,
      { status: 400 },
    );
  }

  if (err instanceof Error) {
    // AI-specific errors fallback — never expose raw upstream/SDK error messages
    if (
      err.message.includes("AI") ||
      err.message.includes("openai") ||
      err.name === "APIConnectionError" ||
      err.name === "APIStatusError" ||
      err.name === "RateLimitError"
    ) {
      log.error(`[API AI Error] ${err.message}`, err);
      return Response.json(
        {
          ok: false,
          error: {
            code: "AI_GENERATION_FAILED",
            message: "AI 처리 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
          },
        } satisfies ApiError,
        { status: 500 },
      );
    }
  }

  log.error("[API Unhandled Error] Internal server error", err);
  return Response.json(
    {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      },
    } satisfies ApiError,
    { status: 500 },
  );
}

/**
 * API error helper — maps errors to safe user-facing responses.
 * Source: docs/08-api-contracts.md sections 3-4
 */
import { ZodError } from "zod/v4";

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

export function toApiError(err: unknown): Response {
  if (err instanceof BaseApiError) {
    console.error(`[API BaseApiError] ${err.code}: ${err.message}`);
    return Response.json(
      {
        ok: false,
        error: {
          code: err.code,
          message: err.message,
        },
      } satisfies ApiError,
      { status: err.status },
    );
  }

  if (err instanceof ZodError) {
    console.error("[API ZodError]", JSON.stringify(err.issues, null, 2));
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
    // AI-specific errors fallback
    if (
      err.message.includes("AI") ||
      err.message.includes("openai") ||
      err.name === "APIConnectionError" ||
      err.name === "APIStatusError" ||
      err.name === "RateLimitError"
    ) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "AI_GENERATION_FAILED",
            message:
              `AI 처리 중 오류가 발생했습니다: ${err.message}`,
          },
        } satisfies ApiError,
        { status: 500 },
      );
    }
  }

  console.error("[API Error]", err);
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

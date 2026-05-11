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

interface ApiError {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

export function toApiError(err: unknown): Response {
  if (err instanceof ZodError) {
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
    // AI-specific errors
    if (
      err.message.includes("AI") ||
      err.message.includes("openai") ||
      err.message.includes("parse")
    ) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "AI_GENERATION_FAILED",
            message:
              "이번 생성은 완료하지 못했습니다. 입력 내용을 조금 더 추가해 다시 시도해주세요.",
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

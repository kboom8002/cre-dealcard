/**
 * AI Model Abstraction Layer
 *
 * Provides a unified interface for AI structured generation.
 * Supports OpenAI, Claude, Gemini, or gateway routing without
 * changing domain logic.
 *
 * Implementation will be completed in Slice 2 (Public Building Radar).
 */
import { z } from "zod/v4";

export interface AiRunResult<T> {
  output: T;
  usage?: unknown;
  model: string;
  promptVersion: string;
}

export interface AiModelClient {
  generateObject<T>(args: {
    schemaName: string;
    promptVersion: string;
    input: unknown;
    schema: z.ZodType<T>;
  }): Promise<AiRunResult<T>>;
}

import { callLLM } from "./llm-client";

// 실재하는 AI 클라이언트 구현
export const aiClient: AiModelClient = {
  async generateObject<T>(args: {
    schemaName: string;
    promptVersion: string;
    input: unknown; // system + user prompt 등
    schema: z.ZodType<T>;
  }): Promise<AiRunResult<T>> {
    const { schemaName, promptVersion, input, schema } = args;
    const model = process.env.AI_DEFAULT_MODEL || "gpt-5.4";

    // input 타입에 따라 프롬프트 추출
    let systemPrompt = "You are a helpful CRE assistant. Respond only in valid JSON.";
    let userPrompt = "";

    if (typeof input === "object" && input !== null) {
      const inp = input as any;
      systemPrompt = inp.systemPrompt || systemPrompt;
      userPrompt = inp.userPrompt || JSON.stringify(inp);
    } else {
      userPrompt = String(input);
    }

    try {
      const response = await callLLM({
        systemPrompt,
        userPrompt,
        model,
        responseFormat: "json_object",
        temperature: 0.7,
      }, {
        cacheKey: `${schemaName}_${promptVersion}_${Buffer.from(userPrompt).toString("base64").substring(0, 32)}`,
      });

      const parsedJson = JSON.parse(response.content);
      const output = schema.parse(parsedJson);

      return {
        output,
        usage: { tokens: response.tokens, latencyMs: response.latencyMs, provider: response.provider },
        model: response.model,
        promptVersion,
      };
    } catch (error: any) {
      console.error(`[aiClient.generateObject] Failure in schema '${schemaName}':`, error);
      throw error;
    }
  },
};

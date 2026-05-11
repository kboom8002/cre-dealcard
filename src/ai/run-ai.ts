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

// Placeholder — will be implemented with actual AI SDK in Slice 2
export const aiClient: AiModelClient = {
  async generateObject() {
    throw new Error(
      "AI client not yet configured. Set OPENAI_API_KEY and implement in Slice 2.",
    );
  },
};

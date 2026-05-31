import OpenAI from "openai";
import type { LLMProvider, LLMChatParams, LLMChatResult } from "./types";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private openai: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("[OpenAIProvider] process.env.OPENAI_API_KEY is not defined");
    }
    this.openai = new OpenAI({ apiKey });
  }

  async chat(params: LLMChatParams): Promise<LLMChatResult> {
    const startTime = Date.now();
    const model = params.model || "gpt-4o";

    try {
      const response = await this.openai.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: params.systemPrompt },
            { role: "user", content: params.userPrompt },
          ],
          response_format: params.responseFormat === "json_object" ? { type: "json_object" } : undefined,
          temperature: params.temperature ?? 0.7,
          max_tokens: params.maxTokens ?? 4096,
        },
        {
          signal: params.signal,
        }
      );

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("OpenAI returned an empty response");
      }

      return {
        content,
        tokens: response.usage?.total_tokens ?? 0,
        model: response.model || model,
        provider: this.name,
        latencyMs: Date.now() - startTime,
      };
    } catch (error: any) {
      console.error("[OpenAIProvider] Chat completion error:", error);
      throw error;
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text.slice(0, 8000),
      });
      const embedding = response.data[0]?.embedding;
      if (!embedding) {
        throw new Error("OpenAI returned an empty embedding response");
      }
      return embedding;
    } catch (error: any) {
      console.error("[OpenAIProvider] Embedding error:", error);
      throw error;
    }
  }
}

export interface LLMChatParams {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  responseFormat?: 'json_object' | 'text';
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface LLMChatResult {
  content: string;
  tokens: number;
  model: string;
  provider: string;
  latencyMs: number;
}

export interface LLMProvider {
  name: string;
  chat(params: LLMChatParams): Promise<LLMChatResult>;
  embed?(text: string): Promise<number[]>;
}


export interface AIEngineRequest {
  module: string;
  action: string;
  profile?: string;
  context?: Record<string, string>;
  language?: string;
}

export interface AIEngineResponse {
  execution_id: string;
  data: Record<string, unknown>;
  model_used: string;
  tokens_input: number;
  tokens_output: number;
  latency_ms: number;
}

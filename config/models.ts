/**
 * Model IDs for various AI providers
 * These IDs are used when making requests to OpenRouter or other AI services
 */

export const MODEL_IDS = {
  ANTHROPIC_CLAUDE_SONNET_4_5: 'anthropic/claude-sonnet-4.5',
  XAI_GROK_4: 'x-ai/grok-4',
  OPENAI_GPT_5_PRO: 'openai/gpt-5-pro',
  OPENAI_GPT_5: 'openai/gpt-5',
} as const;

/**
 * Type for valid model IDs
 */
export type ModelId = typeof MODEL_IDS[keyof typeof MODEL_IDS];

/**
 * Get all available model IDs as an array
 */
export function getAvailableModels(): ModelId[] {
  return Object.values(MODEL_IDS);
}

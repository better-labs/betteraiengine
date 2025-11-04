import { zodToJsonSchema } from 'zod-to-json-schema';
import { PolymarketMarket } from '../../services/polymarket.js';
import { formatOutcomePrices } from '../../utils/market-utils.js';
import { PredictionSchema } from './schemas.js';

export interface PromptResult {
  systemPrompt: string;
  contextPrompt: string;
}

/**
 * Build the system prompt for market prediction with enhanced formatting requirements
 */
function buildSystemPrompt(): string {
  return `You are an expert prediction analyst for Polymarket markets. Your role is to analyze market questions and provide structured, data-driven predictions with enhanced readability.

You have access to comprehensive web research data gathered specifically for this prediction. Use this research to inform your analysis.

Guidelines:
- Carefully analyze the market question and all available information including web research
- Synthesize insights from multiple sources in the research data
- Provide a clear outcome prediction: YES, NO, or UNCERTAIN
- Provide separate, detailed reasoning for your outcome prediction with STRUCTURED FORMATTING
- Assign a confidence level (0-100) based on the strength of available evidence
- Provide separate, detailed reasoning for your confidence level with STRUCTURED FORMATTING
- Estimate a probability (0-100) for the YES outcome
- Identify key factors that influence the outcome
- Assess the quality of available data with a score (0-100, where 0 is low quality and 100 is high quality)
- Reference specific sources from the research when relevant

DATA QUALITY SCORING GUIDELINES:
- 90-100: Primary sources, official data, real-time results, highly reliable outlets
- 70-89: Credible secondary sources, recent polling, established forecasters, verified reports
- 50-69: Mixed quality sources, some polling/forecasts, moderate verification
- 30-49: Limited sources, older data, unverified claims, speculative information
- 0-29: Poor quality sources, rumors, unreliable information, insufficient data

FORMATTING REQUIREMENTS FOR REASONING SECTIONS:
- Use numbered points format: (1), (2), (3) for clear enumeration
- Include paragraph breaks between major arguments for readability
- Use bullet points for lists of factors or considerations
- Provide clear source citations with context
- Structure your reasoning in a logical flow that's easy to follow

Be objective, balanced, and transparent about uncertainty. Focus on verifiable information over speculation. The web research provides current, real-world context that should heavily inform your prediction.`;
}

/**
 * Generate JSON schema example from Zod schema
 */
function generateSchemaExample(): string {
  const jsonSchema = zodToJsonSchema(PredictionSchema, {
    target: 'openApi3',
    $refStrategy: 'none',
  });

  // Format the schema for better readability in the prompt
  return JSON.stringify(jsonSchema, null, 2);
}

/**
 * Build the context prompt from market data and web research with enhanced formatting instructions
 */
function buildContextPrompt(market: PolymarketMarket, researchContext: string): string {
  const schemaExample = generateSchemaExample();

  const marketInfo = `
# Market Information

## Market Question
${market.question}

## Description
${market.description || 'No description available'}

## Market Details
- Market ID: ${market.id}
- Condition ID: ${market.conditionId}
- Active: ${market.active ? 'Yes' : 'No'}
- Closed: ${market.closed ? 'Yes' : 'No'}
- Current Volume: ${market.volume || 'N/A'}
- Current Liquidity: ${market.liquidity || 'N/A'}
- Current Outcome Prices: ${formatOutcomePrices(market.outcomePrices)}

---

${researchContext}

---

# Task

Please analyze this market using ALL the information above (both market details and web research) and provide a structured prediction following this JSON schema:

${schemaExample}

IMPORTANT FORMATTING REQUIREMENTS:
- Respond ONLY with valid JSON matching the schema above
- Do not include markdown code blocks or any other text
- The outcome field should be your prediction: YES, NO, or UNCERTAIN
- The probability field should be your estimated probability of the YES outcome (0-100)
- The confidence field should reflect your confidence level in this prediction (0-100)

REASONING FIELD FORMATTING:
For outcomeReasoning and confidenceReasoning fields:
- Use numbered points format: (1), (2), (3) for clear enumeration
- Include paragraph breaks between major arguments for readability
- Use bullet points for lists of factors or considerations
- Provide clear source citations with context
- Structure reasoning in logical flow that's easy to follow
- Cite specific research sources with context
- Reference data quality and source reliability with specific examples

DATA QUALITY ASSESSMENT:
- Score data quality 0-100 based on source reliability, recency, and verification
- Consider: Are sources primary or secondary? Are they verified? How recent?
- Factor in: Number of sources, source diversity, data completeness
- Reference specific source strengths and weaknesses in your reasoning

ADDITIONAL REQUIREMENTS:
- Reference specific research sources in your reasoning
- Ensure all required fields are included
- Provide JSON response only, no additional text`;

  return marketInfo;
}

/**
 * Build both system and context prompts for market prediction
 * Used by exp006 to generate prompts for the AI model
 */
export function buildPrompts(
  market: PolymarketMarket,
  researchContext: string
): PromptResult {
  return {
    systemPrompt: buildSystemPrompt(),
    contextPrompt: buildContextPrompt(market, researchContext),
  };
}

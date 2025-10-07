import { logger } from '../../utils/logger.js';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { PolymarketMarket } from '../../services/polymarket.js';
import { savePrediction, saveFailedPrediction } from '../../services/prediction-storage.js';
import {
  calculatePredictionDelta,
  formatOutcomePrices,
} from '../../utils/market-utils.js';

export interface ExperimentResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Zod schema for structured prediction output
 */
const PredictionSchema = z.object({
  marketId: z.string().describe('Polymarket market identifier'),
  question: z.string().describe('Market question being analyzed'),
  prediction: z.object({
    outcome: z.enum(['YES', 'NO', 'UNCERTAIN']).describe('Predicted outcome'),
    confidence: z.number().min(0).max(100).describe('Confidence level in prediction (0-100)'),
    probability: z.number().min(0).max(100).describe('Estimated probability of YES outcome (0-100)'),
    reasoning: z.string().min(10).describe('Detailed explanation for the prediction'),
  }),
  keyFactors: z.array(z.string()).min(1).describe('Key factors influencing the prediction'),
  dataQuality: z.enum(['HIGH', 'MEDIUM', 'LOW']).describe('Quality of available data for analysis'),
  lastUpdated: z.string().datetime().describe('ISO timestamp of prediction'),
});

export type PredictionOutput = z.infer<typeof PredictionSchema>;

/**
 * Build the system prompt for market prediction
 */
function buildSystemPrompt(): string {
  return `You are an expert prediction analyst for Polymarket markets. Your role is to analyze market questions and provide structured, data-driven predictions.

Guidelines:
- Analyze the question carefully and consider all available information
- Provide a clear outcome prediction: YES, NO, or UNCERTAIN
- Assign a confidence level (0-100) based on the strength of available evidence
- Estimate a probability (0-100) for the YES outcome
- Provide detailed reasoning for your prediction
- Identify key factors that influence the outcome
- Assess the quality of available data

Be objective, balanced, and transparent about uncertainty. Focus on verifiable information over speculation.`;
}

/**
 * Build the context prompt from market data
 */
function buildContextPrompt(market: PolymarketMarket): string {
  const marketInfo = `
Market Question: ${market.question}

Description: ${market.description || 'No description available'}

Market Details:
- Market ID: ${market.id}
- Condition ID: ${market.conditionId}
- Active: ${market.active ? 'Yes' : 'No'}
- Closed: ${market.closed ? 'Yes' : 'No'}
- Current Volume: ${market.volume || 'N/A'}
- Current Liquidity: ${market.liquidity || 'N/A'}
- Current Outcome Prices: ${formatOutcomePrices(market.outcomePrices)}

Please analyze this market and provide a structured prediction following this EXACT JSON format:
{
  "marketId": "${market.id}",
  "question": "${market.question}",
  "prediction": {
    "outcome": "YES" | "NO" | "UNCERTAIN",
    "confidence": <number 0-100>,
    "probability": <number 0-100>,
    "reasoning": "<detailed explanation>"
  },
  "keyFactors": ["<factor 1>", "<factor 2>", ...],
  "dataQuality": "HIGH" | "MEDIUM" | "LOW",
  "lastUpdated": "<ISO 8601 timestamp>"
}

IMPORTANT:
- Respond ONLY with valid JSON
- Do not include markdown code blocks or any other text
- The probability field should be your estimated probability of the YES outcome (0-100)
- Ensure all required fields are included`;

  return marketInfo;
}

/**
 * Experiment 002: Claude Sonnet 4.5 with structured output
 * Entry point for running this experiment
 */
export async function run(market: PolymarketMarket): Promise<ExperimentResult> {
  try {
    // Initialize LangChain with OpenRouter (Claude Sonnet 4.5)
    const model = new ChatOpenAI({
      model: 'anthropic/claude-sonnet-4.5',
      temperature: 0.7,
      apiKey: process.env.OPENROUTER_API_KEY,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://betterai.tools',
          'X-Title': 'BetterAI Engine',
        },
      },
    });

    // Build prompts
    const systemPrompt = buildSystemPrompt();
    const contextPrompt = buildContextPrompt(market);

    // Prepare messages
    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(contextPrompt),
    ];

    // Invoke the model
    const response = await model.invoke(messages);

    // Parse the response - extract JSON and validate with Zod
    let predictionData: PredictionOutput;
    try {
      let content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

      // Remove markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        content = jsonMatch[1].trim();
      }

      // Try to parse as JSON
      const parsed = JSON.parse(content);

      // Validate with Zod schema
      predictionData = PredictionSchema.parse(parsed);
    } catch (parseError) {
      const parseErrorMessage = parseError instanceof Error ? parseError.message : String(parseError);
      logger.error(
        {
          experimentId: '002',
          marketId: market.id,
          error: parseErrorMessage,
          responseContent: response.content,
        },
        'Failed to parse or validate prediction response'
      );
      throw new Error(`Failed to parse prediction: ${parseErrorMessage}`);
    }

    logger.info(
      {
        experimentId: '002',
        marketId: market.id,
        outcome: predictionData.prediction.outcome,
        confidence: predictionData.prediction.confidence,
        probability: predictionData.prediction.probability,
      },
      'Structured prediction generated and validated'
    );

    // Calculate prediction delta
    const deltaResult = calculatePredictionDelta(
      market.outcomePrices,
      predictionData.prediction.probability
    );

    let predictionDelta: number | undefined;
    if (deltaResult.success && deltaResult.value !== undefined) {
      predictionDelta = deltaResult.value;
      logger.info(
        {
          experimentId: '002',
          marketId: market.id,
          delta: predictionDelta,
          marketPrice: market.outcomePrices,
          predictedProbability: predictionData.prediction.probability,
        },
        'Prediction delta calculated'
      );
    } else {
      logger.warn(
        {
          experimentId: '002',
          marketId: market.id,
          error: deltaResult.error,
        },
        'Failed to calculate prediction delta - will save prediction without delta'
      );
    }

    // Save prediction to database
    await savePrediction({
      marketId: market.id,
      prediction: predictionData,
      rawRequest: {
        messages: messages.map(msg => ({
          role: msg._getType(),
          content: msg.content,
        })),
        model: 'anthropic/claude-sonnet-4.5',
        temperature: 0.7,
      },
      rawResponse: response,
      model: 'anthropic/claude-sonnet-4.5',
      predictionDelta,
      promptTokens: response.response_metadata?.tokenUsage?.promptTokens,
      completionTokens: response.response_metadata?.tokenUsage?.completionTokens,
    });

    return {
      success: true,
      data: {
        marketId: market.id,
        prediction: predictionData,
        predictionDelta,
        model: 'anthropic/claude-sonnet-4.5',
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      { experimentId: '002', marketId: market.id, error: errorMessage },
      'Experiment 002 failed'
    );

    // Save failed prediction job
    await saveFailedPrediction(market.id, errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

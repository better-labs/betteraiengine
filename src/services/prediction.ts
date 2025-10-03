import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { db } from '../db/index.js';
import { predictionJobs, predictions, markets } from '../db/schema.js';
import type { PolymarketMarket } from './polymarket.js';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Prediction output schema
export const PredictionOutputSchema = z.object({
  marketId: z.string(),
  question: z.string(),
  prediction: z.object({
    outcome: z.enum(['YES', 'NO', 'UNCERTAIN']),
    confidence: z.number().min(0).max(100),
    probability: z.number().min(0).max(100),
    reasoning: z.string(),
  }),
  keyFactors: z.array(z.string()),
  dataQuality: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  lastUpdated: z.string(),
});

export type PredictionOutput = z.infer<typeof PredictionOutputSchema>;

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

Please analyze this market and provide a structured prediction following this JSON format:
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
  "lastUpdated": "<ISO timestamp>"
}`;

  return marketInfo;
}

/**
 * Run prediction for a market using LangChain + OpenRouter
 */
export async function runPrediction(
  marketId: string,
  jobId?: string
): Promise<PredictionOutput> {
  const contextLogger = logger.child({ marketId, jobId });
  contextLogger.info('Starting prediction job');

  // Create or use existing job
  let finalJobId = jobId;
  if (!finalJobId) {
    const [job] = await db
      .insert(predictionJobs)
      .values({
        marketId,
        status: 'running',
        startedAt: new Date(),
      })
      .returning();
    finalJobId = job.id;
    contextLogger.info({ jobId: finalJobId }, 'Created prediction job');
  } else {
    // Update existing job to running
    await db
      .update(predictionJobs)
      .set({ status: 'running', startedAt: new Date() })
      .where(eq(predictionJobs.id, finalJobId));
  }

  try {
    // Fetch market data
    const [market] = await db
      .select()
      .from(markets)
      .where(eq(markets.marketId, marketId))
      .limit(1);

    if (!market) {
      throw new Error(`Market ${marketId} not found in database`);
    }

    contextLogger.info({ question: market.question }, 'Fetched market data');

    // Initialize OpenRouter via LangChain
    const model = new ChatOpenAI({
      model: 'anthropic/claude-3.5-sonnet', // Using Claude 3.5 Sonnet via OpenRouter
      temperature: 0.7,
      apiKey: env.OPENROUTER_API_KEY,
      configuration: {
        baseURL: OPENROUTER_BASE_URL,
        defaultHeaders: {
          'HTTP-Referer': 'https://github.com/betteraiengine',
          'X-Title': 'BetterAI Engine',
        },
      },
    });

    // Build prompts
    const systemPrompt = buildSystemPrompt();
    const contextPrompt = buildContextPrompt(market as unknown as PolymarketMarket);

    contextLogger.info('Sending request to LLM');

    // Invoke the model
    const response = await model.invoke([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contextPrompt },
    ]);

    const rawResponse = response.content;
    contextLogger.info({ rawResponse }, 'Received LLM response');

    // Parse the response
    let predictionOutput: PredictionOutput;
    try {
      // Extract JSON from response (it might be wrapped in markdown code blocks)
      const content = typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse);
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;

      const parsed = JSON.parse(jsonStr);

      // Add lastUpdated if not present
      if (!parsed.lastUpdated) {
        parsed.lastUpdated = new Date().toISOString();
      }

      predictionOutput = PredictionOutputSchema.parse(parsed);
    } catch (parseError) {
      contextLogger.error({ parseError, rawResponse }, 'Failed to parse LLM response');
      throw new Error(`Failed to parse prediction output: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    // Save prediction to database
    const [savedPrediction] = await db
      .insert(predictions)
      .values({
        jobId: finalJobId,
        marketId,
        prediction: predictionOutput,
        rawResponse: { content: rawResponse },
        model: 'anthropic/claude-3.5-sonnet',
        promptTokens: response.response_metadata?.tokenUsage?.promptTokens,
        completionTokens: response.response_metadata?.tokenUsage?.completionTokens,
      })
      .returning();

    contextLogger.info(
      { predictionId: savedPrediction.id, outcome: predictionOutput.prediction.outcome },
      'Saved prediction to database'
    );

    // Update job status to completed
    await db
      .update(predictionJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(predictionJobs.id, finalJobId));

    contextLogger.info('Prediction job completed successfully');

    return predictionOutput;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    contextLogger.error({ error: errorMessage }, 'Prediction job failed');

    // Update job status to failed
    await db
      .update(predictionJobs)
      .set({
        status: 'failed',
        error: errorMessage,
        completedAt: new Date(),
      })
      .where(eq(predictionJobs.id, finalJobId));

    throw error;
  }
}

/**
 * Get prediction by job ID
 */
export async function getPredictionByJobId(jobId: string) {
  const [prediction] = await db
    .select()
    .from(predictions)
    .where(eq(predictions.jobId, jobId))
    .limit(1);

  return prediction;
}

/**
 * Get all predictions for a market
 */
export async function getPredictionsByMarketId(marketId: string) {
  const results = await db
    .select()
    .from(predictions)
    .where(eq(predictions.marketId, marketId))
    .orderBy(predictions.createdAt);

  return results;
}

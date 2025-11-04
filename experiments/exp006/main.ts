import { logger } from '../../utils/logger.js';
import { z } from 'zod';
import { PolymarketMarket } from '../../services/polymarket.js';
import { savePrediction, saveFailedPrediction } from '../../services/prediction-storage.js';
import { calculatePredictionDelta } from '../../utils/market-utils.js';
import { MODEL_IDS } from '../../config/models.js';
import { fetchTrendingMarkets } from './fetch.js';
import { performMarketResearch } from './research.js';
import { buildPrompts } from './build-prompts.js';

export interface ExperimentResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Zod schema for structured prediction output with enhanced formatting requirements
 */
const PredictionSchema = z.object({
  marketId: z.string().describe('Polymarket market identifier'),
  question: z.string().describe('Market question being analyzed'),
  prediction: z.object({
    outcome: z.enum(['YES', 'NO', 'UNCERTAIN']).describe('Predicted outcome'),
    outcomeReasoning: z.string().min(10).describe('Detailed reasoning for the predicted outcome with structured formatting'),
    confidence: z.number().min(0).max(100).describe('Confidence level in prediction (0-100)'),
    confidenceReasoning: z.string().min(10).describe('Detailed reasoning for the confidence level with structured formatting'),
    probability: z.number().min(0).max(100).describe('Estimated probability of YES outcome (0-100)'),
  }),
  keyFactors: z.array(z.string()).min(1).describe('Key factors influencing the prediction'),
  dataQuality: z.enum(['HIGH', 'MEDIUM', 'LOW']).describe('Quality of available data for analysis'),
  lastUpdated: z.string().datetime().describe('ISO timestamp of prediction'),
});

export type PredictionOutput = z.infer<typeof PredictionSchema>;

/**
 * Experiment 006: Trending Markets Auto-Analysis
 * Fetches trending markets and runs predictions automatically on the first market
 */
export async function run(market?: PolymarketMarket): Promise<ExperimentResult> {
  try {
    // Step 0: Fetch trending markets if no market provided
    let targetMarket: PolymarketMarket;

    if (!market) {
      logger.info({ experimentId: '006' }, 'No market provided - fetching trending markets');

      const fetchResult = await fetchTrendingMarkets({
        limit: 100,
        maxSpreadPercent: 25,
        excludeTags: ['Crypto', 'Hide From New', 'Weekly', 'Recurring'],
      });

      if (!fetchResult.success || !fetchResult.markets || fetchResult.markets.length === 0) {
        const error = fetchResult.error || 'No trending markets found';
        logger.error({ experimentId: '006', error }, 'Failed to fetch trending markets');
        throw new Error(error);
      }

      targetMarket = fetchResult.markets[0];
      logger.info(
        {
          experimentId: '006',
          marketId: targetMarket.id,
          question: targetMarket.question,
          totalMarkets: fetchResult.markets.length
        },
        'Using first trending market for analysis'
      );
    } else {
      targetMarket = market;
      logger.info({ experimentId: '006', marketId: targetMarket.id }, 'Using provided market');
    }

    logger.info({ experimentId: '006', marketId: targetMarket.id }, 'Starting experiment 006 with enhanced formatting');

    // Step 1: Perform parallel web research using Exa AI and Grok
    const researchResult = await performMarketResearch(targetMarket);
    const researchContext = researchResult.researchContext;
    const researchMetadata = researchResult.metadata;

    // Step 2: Build prompts for AI model
    const { systemPrompt, contextPrompt } = buildPrompts(targetMarket, researchContext);

    logger.info({ experimentId: '006', marketId: targetMarket.id }, 'Invoking AI model with enhanced formatting requirements');

    const apiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://betterai.tools',
        'X-Title': 'BetterAI Engine',
      },
      body: JSON.stringify({
        model: MODEL_IDS.OPENAI_GPT_5,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`OpenRouter API error: ${apiResponse.status} - ${errorText}`);
    }

    const response: any = await apiResponse.json();
    const messageContent = response.choices?.[0]?.message?.content || '';

    // Parse the response - extract JSON and validate with Zod
    let predictionData: PredictionOutput;
    try {
      let content = messageContent;

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
          experimentId: '006',
          marketId: targetMarket.id,
          error: parseErrorMessage,
          responseContent: messageContent,
        },
        'Failed to parse or validate prediction response'
      );
      throw new Error(`Failed to parse prediction: ${parseErrorMessage}`);
    }

    logger.info(
      {
        experimentId: '006',
        marketId: targetMarket.id,
        outcome: predictionData.prediction.outcome,
        confidence: predictionData.prediction.confidence,
        probability: predictionData.prediction.probability,
      },
      'Structured prediction generated and validated with enhanced formatting'
    );

    // Calculate prediction delta
    const deltaResult = calculatePredictionDelta(
      targetMarket.outcomePrices,
      predictionData.prediction.probability
    );

    let predictionDelta: number | undefined;
    if (deltaResult.success && deltaResult.value !== undefined) {
      predictionDelta = deltaResult.value;
      logger.info(
        {
          experimentId: '006',
          marketId: targetMarket.id,
          delta: predictionDelta,
          marketPrice: targetMarket.outcomePrices,
          predictedProbability: predictionData.prediction.probability,
        },
        'Prediction delta calculated'
      );
    } else {
      logger.warn(
        {
          experimentId: '006',
          marketId: targetMarket.id,
          error: deltaResult.error,
        },
        'Failed to calculate prediction delta - will save prediction without delta'
      );
    }

    // Save prediction to database with enrichment metadata
    await savePrediction({
      marketId: targetMarket.id,
      experimentId: '006',
      prediction: {
        ...predictionData,
        enrichmentMetadata: {
          exaResearchSuccess: researchMetadata.exaSuccess,
          grokResearchSuccess: researchMetadata.grokSuccess,
          exaSources: researchMetadata.exaSources,
          grokSources: researchMetadata.grokSources,
          exaCharacters: researchMetadata.exaCharacters,
          grokCharacters: researchMetadata.grokCharacters,
          exaTruncated: false,
          grokTruncated: false,
          enhancedFormatting: true,
        },
      },
      rawRequest: {
        experimentId: '006',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextPrompt },
        ],
        model: MODEL_IDS.OPENAI_GPT_5,
        temperature: 0.7,
        enrichment: 'exa-ai-and-grok-research',
        formatting: 'enhanced-structured',
      },
      rawResponse: response,
      model: MODEL_IDS.OPENAI_GPT_5,
      predictionDelta,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      researchContext,
    });

    return {
      success: true,
      data: {
        marketId: targetMarket.id,
        prediction: predictionData,
        predictionDelta,
        model: MODEL_IDS.OPENAI_GPT_5,
        rawRequest: {
          experimentId: '006',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: contextPrompt },
          ],
          model: MODEL_IDS.OPENAI_GPT_5,
          temperature: 0.7,
          enrichment: 'exa-ai-and-grok-research',
          formatting: 'enhanced-structured',
        },
        rawResponse: response,
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
        researchContext,
        enrichment: {
          sources: ['exa-ai', 'grok-ai'],
          exaSources: researchMetadata.exaSources,
          grokSources: researchMetadata.grokSources,
          exaCharacters: researchMetadata.exaCharacters,
          grokCharacters: researchMetadata.grokCharacters,
        },
        formatting: 'enhanced-structured',
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Use market or targetMarket depending on what's available
    const marketId = market?.id || 'unknown';

    logger.error(
      { experimentId: '006', marketId, error: errorMessage },
      'Experiment 006 failed'
    );

    // Save failed prediction job if we have a market ID
    if (marketId !== 'unknown') {
      await saveFailedPrediction(marketId, errorMessage);
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

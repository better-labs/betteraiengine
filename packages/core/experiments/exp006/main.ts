import { logger } from '../../utils/logger.js';
import { PolymarketMarket } from '../../services/polymarket.js';
import { savePrediction, saveFailedPrediction } from '../../services/prediction-storage.js';
import { calculatePredictionDelta } from '../../utils/market-utils.js';
import { MODEL_IDS } from '../../config/models.js';
import { fetchTrendingMarkets } from './fetch-markets.js';
import { performMarketResearch } from './research-market.js';
import { buildPrompts } from './prepare-prompts.js';
import { generatePrediction } from './generate-prediction.js';
import type { PredictionOutput } from './schemas.js';

export interface ExperimentResult {
  success: boolean;
  data?: any;
  error?: string;
}

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

    // Step 3: Generate prediction using AI model
    const predictionResult = await generatePrediction({
      marketId: targetMarket.id,
      systemPrompt,
      contextPrompt,
      model: MODEL_IDS.OPENAI_GPT_5,
      temperature: 0.7,
    });

    if (!predictionResult.success || !predictionResult.prediction) {
      throw new Error(predictionResult.error || 'Failed to generate prediction');
    }

    const predictionData = predictionResult.prediction;
    const response = predictionResult.rawResponse;

    // Calculate prediction delta
    const deltaResult = calculatePredictionDelta(
      targetMarket.outcomePrices,
      predictionData.probability
    );

    // Log Delta Results
    let predictionDelta: number | undefined;
    if (deltaResult.success && deltaResult.value !== undefined) {
      predictionDelta = deltaResult.value;
      logger.info(
        {
          experimentId: '006',
          marketId: targetMarket.id,
          delta: predictionDelta,
          marketPrice: targetMarket.outcomePrices,
          predictedProbability: predictionData.probability,
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
        marketId: targetMarket.id,
        question: targetMarket.question,
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

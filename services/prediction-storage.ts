import { db, predictionJobs, predictions, markets, rawMarkets } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger.js';

export interface PredictionData {
  marketId: string;
  experimentId: string;
  prediction: any;
  rawRequest?: any;
  rawResponse?: any;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  predictionDelta?: number;
}

/**
 * Create a prediction job and save prediction
 */
export async function savePrediction(data: PredictionData) {
  try {
    // Create prediction job
    const job = await db
      .insert(predictionJobs)
      .values({
        marketId: data.marketId,
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
      })
      .returning();

    logger.info({ jobId: job[0].id, marketId: data.marketId }, 'Created prediction job');

    // Save prediction
    const prediction = await db
      .insert(predictions)
      .values({
        jobId: job[0].id,
        marketId: data.marketId,
        experimentId: data.experimentId,
        prediction: data.prediction,
        rawRequest: data.rawRequest,
        rawResponse: data.rawResponse,
        model: data.model,
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
        predictionDelta: data.predictionDelta,
      })
      .returning();

    logger.info(
      { predictionId: prediction[0].id, jobId: job[0].id, marketId: data.marketId },
      'Saved prediction to database'
    );

    return {
      job: job[0],
      prediction: prediction[0],
    };
  } catch (error) {
    logger.error(
      { marketId: data.marketId, error: error instanceof Error ? error.message : String(error) },
      'Failed to save prediction'
    );
    throw error;
  }
}

/**
 * Create a failed prediction job
 */
export async function saveFailedPrediction(marketId: string, error: string) {
  try {
    const job = await db
      .insert(predictionJobs)
      .values({
        marketId,
        status: 'failed',
        startedAt: new Date(),
        completedAt: new Date(),
        error,
      })
      .returning();

    logger.info({ jobId: job[0].id, marketId, error }, 'Created failed prediction job');

    return job[0];
  } catch (err) {
    logger.error(
      { marketId, error: err instanceof Error ? err.message : String(err) },
      'Failed to save failed prediction job'
    );
    throw err;
  }
}

/**
 * Get a prediction by ID with associated market data and event data
 */
export async function getPredictionById(predictionId: string) {
  try {
    logger.info({ predictionId }, 'Fetching prediction from database');

    const result = await db
      .select({
        prediction: predictions,
        market: markets,
        rawMarket: rawMarkets,
      })
      .from(predictions)
      .leftJoin(markets, eq(predictions.marketId, markets.marketId))
      .leftJoin(rawMarkets, eq(predictions.marketId, rawMarkets.marketId))
      .where(eq(predictions.id, predictionId))
      .limit(1);

    if (result.length === 0) {
      throw new Error(`Prediction ${predictionId} not found`);
    }

    const data = result[0];

    // Extract event slug from rawMarket data if available
    let eventSlug: string | undefined;
    if (data.rawMarket?.data) {
      const marketData = data.rawMarket.data as any;
      if (marketData.events && Array.isArray(marketData.events) && marketData.events.length > 0) {
        eventSlug = marketData.events[0].slug;
      }
    }

    logger.info({ predictionId, eventSlug }, 'Successfully fetched prediction');
    return {
      ...data,
      eventSlug,
    };
  } catch (error) {
    logger.error(
      { predictionId, error: error instanceof Error ? error.message : String(error) },
      'Failed to fetch prediction'
    );
    throw error;
  }
}

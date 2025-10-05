import { db, predictionJobs, predictions } from '../db/index.js';
import { logger } from '../utils/logger.js';

export interface PredictionData {
  marketId: string;
  prediction: any;
  rawRequest?: any;
  rawResponse?: any;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
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
        prediction: data.prediction,
        rawRequest: data.rawRequest,
        rawResponse: data.rawResponse,
        model: data.model,
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
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

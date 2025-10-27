import { logger } from '../utils/logger.js';
import { db } from '../db/index.js';
import { predictions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { fetchMarketById, extractTokenIdForOutcome, type PolymarketMarket } from './polymarket.js';
import {
  calculateTradeStrategy,
  validateTradeOpportunity,
  type StrategyInput,
  type StrategyOutput,
} from './trade-strategies.js';

/**
 * Trade Plan Schema v0.0.6
 * Based on: https://github.com/better-labs/betteroms/blob/main/docs/schemas/trade-plan-v0.0.6.schema.json
 *
 * Key changes in v0.0.6:
 * - Added 'notes' field at the TradePlan level (not per-trade)
 * - Changed 'marketId' to 'marketTokenId' (ERC1155 token ID for specific outcome)
 * - marketTokenId is the CLOB token ID used by Polymarket's order book
 */
export interface TradePlan {
  planId: string;
  mode: 'paper' | 'live';
  notes?: string; // Optional plan-level notes about rationale, strategy, or context
  trades: Array<{
    marketTokenId: string; // CLOB token ID (not market ID)
    outcome: 'YES' | 'NO';
    side: 'BUY' | 'SELL';
    orderType: 'MARKET' | 'LIMIT';
    size: number;
    price?: number;
  }>;
}

export interface GenerateTradeInput {
  predictionId: string;
  strategyName?: string;
  minDeltaPercent?: number;
}

export interface GenerateTradeResult {
  success: boolean;
  tradePlan?: TradePlan;
  error?: string;
  metadata?: {
    predictionId: string;
    marketId: string;
    predictionProbability: number;
    currentMarketPrice: number;
    delta: number;
    confidence: number;
    outcome: string;
    strategyUsed: string;
  };
}

/**
 * Extract current market price from Polymarket market data
 * outcomePrices is a stringified JSON array like '["0.6234", "0.3766"]'
 * Index 0 = YES price, Index 1 = NO price
 */
function extractMarketPrice(market: PolymarketMarket, outcome: 'YES' | 'NO'): number {
  if (!market.outcomePrices) {
    throw new Error('Market does not have outcomePrices data');
  }

  try {
    const prices = JSON.parse(market.outcomePrices);
    if (!Array.isArray(prices) || prices.length < 2) {
      throw new Error('Invalid outcomePrices format');
    }

    const yesPrice = parseFloat(prices[0]);
    const noPrice = parseFloat(prices[1]);

    if (isNaN(yesPrice) || isNaN(noPrice)) {
      throw new Error('Invalid price values in outcomePrices');
    }

    return outcome === 'YES' ? yesPrice : noPrice;
  } catch (error) {
    throw new Error(
      `Failed to parse market prices: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Generate a trade plan based on a prediction
 */
export async function generateTrade(input: GenerateTradeInput): Promise<GenerateTradeResult> {
  const { predictionId, strategyName = 'takeProfit', minDeltaPercent = 2.5 } = input;

  const contextLogger = logger.child({ predictionId, strategyName });
  contextLogger.info('Starting trade generation');

  try {
    // 1. Fetch prediction from database
    const [prediction] = await db
      .select()
      .from(predictions)
      .where(eq(predictions.id, predictionId))
      .limit(1);

    if (!prediction) {
      return {
        success: false,
        error: `Prediction ${predictionId} not found`,
      };
    }

    contextLogger.info({ marketId: prediction.marketId }, 'Fetched prediction from database');

    // 2. Extract prediction data
    const predictionData = prediction.prediction as any;
    const outcome = predictionData.prediction?.outcome;
    const probability = predictionData.prediction?.probability;
    const confidence = predictionData.prediction?.confidence;

    if (!outcome || typeof probability !== 'number' || typeof confidence !== 'number') {
      return {
        success: false,
        error: 'Invalid prediction data format',
      };
    }

    // 3. Check for UNCERTAIN predictions
    if (outcome === 'UNCERTAIN') {
      return {
        success: false,
        error: 'Cannot generate trade for UNCERTAIN prediction. The AI model was not confident enough to make a directional prediction.',
      };
    }

    // 4. Fetch fresh market data from Polymarket
    if (!prediction.marketId) {
      return {
        success: false,
        error: 'Prediction does not have associated marketId',
      };
    }

    contextLogger.info({ marketId: prediction.marketId }, 'Fetching fresh market data');
    const market = await fetchMarketById(prediction.marketId);
    contextLogger.info('Successfully fetched market data');

    // 5. Extract current market price
    const currentMarketPrice = extractMarketPrice(market, outcome);
    contextLogger.info({ currentMarketPrice, outcome }, 'Extracted current market price');

    // 6. Validate trade opportunity
    const strategyInput: StrategyInput = {
      predictionProbability: probability,
      currentMarketPrice,
      confidence,
      outcome,
    };

    const validation = validateTradeOpportunity(strategyInput, minDeltaPercent);

    if (!validation.valid) {
      return {
        success: false,
        error: validation.reason,
        metadata: {
          predictionId,
          marketId: prediction.marketId,
          predictionProbability: probability,
          currentMarketPrice,
          delta: validation.delta || 0,
          confidence,
          outcome,
          strategyUsed: strategyName,
        },
      };
    }

    contextLogger.info(
      { delta: validation.delta, minDeltaPercent },
      'Trade opportunity validated'
    );

    // 7. Calculate trade strategy
    const strategy: StrategyOutput = calculateTradeStrategy(strategyName, strategyInput);
    contextLogger.info({ strategy: strategy.strategyName }, 'Calculated trade strategy');

    // 8. Build trade plan with v0.0.6 schema
    const tradePlan: TradePlan = {
      planId: `prediction-${predictionId}-${Date.now()}`,
      mode: 'paper',
      notes: strategy.reasoning, // Plan-level notes with strategy reasoning
      trades: strategy.trades.map((trade) => {
        // Extract the correct token ID for this outcome
        const marketTokenId = extractTokenIdForOutcome(market.clobTokenIds, trade.outcome);

        return {
          marketTokenId,
          outcome: trade.outcome,
          side: trade.side,
          orderType: trade.orderType,
          size: trade.size,
          price: trade.price,
        };
      }),
    };

    contextLogger.info({ planId: tradePlan.planId }, 'Generated trade plan successfully');

    return {
      success: true,
      tradePlan,
      metadata: {
        predictionId,
        marketId: prediction.marketId,
        predictionProbability: probability,
        currentMarketPrice,
        delta: validation.delta!,
        confidence,
        outcome,
        strategyUsed: strategy.strategyName,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    contextLogger.error({ error: errorMessage }, 'Trade generation failed');

    return {
      success: false,
      error: errorMessage,
    };
  }
}

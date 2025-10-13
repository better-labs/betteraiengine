import { logger } from '../utils/logger.js';

/**
 * Trade strategy configuration and calculation utilities
 */

export interface StrategyInput {
  predictionProbability: number; // 0-100
  currentMarketPrice: number; // 0-1
  confidence: number; // 0-100
  outcome: 'YES' | 'NO';
}

export interface StrategyOutput {
  trades: Array<{
    outcome: 'YES' | 'NO';
    side: 'BUY' | 'SELL';
    orderType: 'MARKET' | 'LIMIT';
    size: number;
    price?: number;
    notes: string;
  }>;
  strategyName: string;
  reasoning: string;
}

/**
 * Take Profit Strategy
 *
 * Executes two orders:
 * 1. Market BUY at current price (immediate entry)
 * 2. Limit SELL at AI prediction target (take profit)
 *
 * This strategy captures the full predicted edge immediately and sets
 * a profit target at the AI's predicted price level.
 */
export function takeProfitStrategy(input: StrategyInput): StrategyOutput {
  const { predictionProbability, currentMarketPrice, confidence, outcome } = input;

  logger.info(
    {
      predictionProbability,
      currentMarketPrice,
      confidence,
      outcome,
    },
    'Calculating take profit strategy'
  );

  // Convert prediction probability to price (0-1 scale)
  const predictionPrice = predictionProbability / 100;

  // For paper trading, use fixed size of 1 USDC
  const tradeSize = 1;

  // Determine if we're buying YES or NO based on prediction
  const buyOutcome = outcome;

  const trades = [
    {
      outcome: buyOutcome,
      side: 'BUY' as const,
      orderType: 'MARKET' as const,
      size: tradeSize,
      notes: `Entry at market price ${currentMarketPrice.toFixed(3)} based on AI prediction ${predictionPrice.toFixed(3)} (confidence: ${confidence}%)`,
    },
    {
      outcome: buyOutcome,
      side: 'SELL' as const,
      orderType: 'LIMIT' as const,
      size: tradeSize,
      price: predictionPrice,
      notes: `Take profit at AI prediction target ${predictionPrice.toFixed(3)}`,
    },
  ];

  const reasoning = `Take profit strategy: Buy ${buyOutcome} at market (${currentMarketPrice.toFixed(3)}), sell at AI target (${predictionPrice.toFixed(3)}). Expected edge: ${((predictionPrice - currentMarketPrice) * 100).toFixed(1)}%`;

  return {
    trades,
    strategyName: 'takeProfit',
    reasoning,
  };
}

/**
 * Calculate trade strategy based on strategy name
 */
export function calculateTradeStrategy(
  strategyName: string,
  input: StrategyInput
): StrategyOutput {
  switch (strategyName) {
    case 'takeProfit':
      return takeProfitStrategy(input);
    // Future strategies can be added here:
    // case 'limitOnly':
    //   return limitOnlyStrategy(input);
    // case 'scaledEntry':
    //   return scaledEntryStrategy(input);
    default:
      throw new Error(`Unknown strategy: ${strategyName}`);
  }
}

/**
 * Validate that the trade meets minimum requirements
 */
export function validateTradeOpportunity(input: StrategyInput, minDeltaPercent: number = 2.5): {
  valid: boolean;
  reason?: string;
  delta?: number;
} {
  const { predictionProbability, currentMarketPrice, outcome } = input;

  const predictionPrice = predictionProbability / 100;

  // Calculate delta (difference between prediction and market)
  const delta = Math.abs(predictionPrice - currentMarketPrice) * 100;

  // Check if delta meets minimum threshold
  if (delta < minDeltaPercent) {
    return {
      valid: false,
      reason: `Delta ${delta.toFixed(2)}% is below minimum threshold ${minDeltaPercent}%`,
      delta,
    };
  }

  // For YES outcomes, prediction should be higher than market
  // For NO outcomes, we're buying NO, so YES probability should be lower than market
  const isValidDirection =
    (outcome === 'YES' && predictionPrice > currentMarketPrice) ||
    (outcome === 'NO' && predictionPrice < currentMarketPrice);

  if (!isValidDirection) {
    return {
      valid: false,
      reason: `Market price ${currentMarketPrice.toFixed(3)} does not support ${outcome} trade (prediction: ${predictionPrice.toFixed(3)})`,
      delta,
    };
  }

  return {
    valid: true,
    delta,
  };
}

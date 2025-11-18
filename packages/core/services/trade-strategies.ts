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
  }>;
  strategyName: string;
  reasoning: string;
  // Notes are stored separately for logging/display but not in the trade plan schema
  tradeNotes?: string[];
}

/**
 * Take Profit Strategy
 *
 * Handles both underpriced and overpriced scenarios with confidence-based profit targets:
 *
 * UNDERPRICED (Market < AI Prediction):
 * - Buy the predicted outcome at market price
 * - Sell at confidence-based target (profitFraction = confidence / 200)
 *
 * OVERPRICED (Market > AI Prediction):
 * - Buy the OPPOSITE outcome at market price
 * - Sell at confidence-based target toward inverse AI target
 *
 * PROFIT TARGET FORMULA: profitFraction = confidence / 200
 * - 100% confidence → 50% of edge (max target)
 * - 80% confidence → 40% of edge
 * - 60% confidence → 30% of edge
 * - 50% confidence → 25% of edge (min target)
 *
 * Higher AI confidence = more aggressive profit target (captures more of predicted edge)
 * Lower AI confidence = more conservative target (captures less, exits earlier)
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

  // Determine the market price for the predicted outcome
  // If outcome is YES, marketPrice is for YES
  // If outcome is NO, we need to calculate based on YES price
  const outcomeMarketPrice = outcome === 'YES' ? currentMarketPrice : (1 - currentMarketPrice);

  // Determine if market is underpriced or overpriced relative to prediction
  const isUnderpriced = outcomeMarketPrice < predictionPrice;
  const isOverpriced = outcomeMarketPrice > predictionPrice;

  let buyOutcome: 'YES' | 'NO';
  let targetPrice: number;
  let reasoning: string;

  if (isUnderpriced) {
    // UNDERPRICED: Buy the predicted outcome
    buyOutcome = outcome;

    // Calculate profit target based on confidence
    // profitFraction = confidence / 200 (max 50% at 100% confidence, scales down from there)
    const profitFraction = confidence / 200;
    const fullDistance = predictionPrice - outcomeMarketPrice;
    const targetDistance = fullDistance * profitFraction;
    targetPrice = outcomeMarketPrice + targetDistance;

    const trades = [
      {
        outcome: buyOutcome,
        side: 'BUY' as const,
        orderType: 'MARKET' as const,
        size: tradeSize,
      },
      {
        outcome: buyOutcome,
        side: 'SELL' as const,
        orderType: 'LIMIT' as const,
        size: tradeSize,
        price: targetPrice,
      },
    ];

    const tradeNotes = [
      `Entry: Buy ${buyOutcome} at market ${outcomeMarketPrice.toFixed(3)} (underpriced vs AI prediction ${predictionPrice.toFixed(3)}, confidence: ${confidence}%)`,
      `Take profit: Sell ${buyOutcome} at target ${targetPrice.toFixed(3)} (${(profitFraction * 100).toFixed(1)}% toward AI prediction ${predictionPrice.toFixed(3)}, confidence: ${confidence}%)`,
    ];

    reasoning = `Take profit (underpriced): Buy ${buyOutcome} at market ${outcomeMarketPrice.toFixed(3)}, sell at ${targetPrice.toFixed(3)} (${(profitFraction * 100).toFixed(1)}% toward AI target ${predictionPrice.toFixed(3)}, confidence-based). Expected edge: ${((targetPrice - outcomeMarketPrice) * 100).toFixed(1)}%`;

    return {
      trades,
      strategyName: 'takeProfit',
      reasoning,
      tradeNotes,
    };
  } else if (isOverpriced) {
    // OVERPRICED: Buy the OPPOSITE outcome
    buyOutcome = outcome === 'YES' ? 'NO' : 'YES';

    // Current price of opposite outcome
    const oppositeMarketPrice = 1 - outcomeMarketPrice;

    // Full AI target for opposite outcome (inverse of prediction)
    const fullTargetPrice = 1 - predictionPrice;

    // Calculate profit target based on confidence
    // profitFraction = confidence / 200 (max 50% at 100% confidence, scales down from there)
    const profitFraction = confidence / 200;
    const fullDistance = fullTargetPrice - oppositeMarketPrice;
    const targetDistance = fullDistance * profitFraction;
    targetPrice = oppositeMarketPrice + targetDistance;

    const trades = [
      {
        outcome: buyOutcome,
        side: 'BUY' as const,
        orderType: 'MARKET' as const,
        size: tradeSize,
      },
      {
        outcome: buyOutcome,
        side: 'SELL' as const,
        orderType: 'LIMIT' as const,
        size: tradeSize,
        price: targetPrice,
      },
    ];

    const tradeNotes = [
      `Entry: Buy ${buyOutcome} at market ${oppositeMarketPrice.toFixed(3)} (AI predicts ${outcome} overpriced at ${outcomeMarketPrice.toFixed(3)} vs ${predictionPrice.toFixed(3)}, confidence: ${confidence}%)`,
      `Take profit: Sell ${buyOutcome} at target ${targetPrice.toFixed(3)} (${(profitFraction * 100).toFixed(1)}% toward inverse AI target ${fullTargetPrice.toFixed(3)}, confidence: ${confidence}%)`,
    ];

    reasoning = `Take profit (overpriced): AI predicts ${outcome} at ${predictionPrice.toFixed(3)} but market is ${outcomeMarketPrice.toFixed(3)}. Buy opposite outcome ${buyOutcome} at ${oppositeMarketPrice.toFixed(3)}, sell at ${targetPrice.toFixed(3)} (${(profitFraction * 100).toFixed(1)}% toward AI target ${fullTargetPrice.toFixed(3)}, confidence-based). Expected edge: ${((targetPrice - oppositeMarketPrice) * 100).toFixed(1)}%`;

    return {
      trades,
      strategyName: 'takeProfit',
      reasoning,
      tradeNotes,
    };
  } else {
    // Should not happen if validation passed, but handle edge case
    throw new Error('Market price equals prediction price - no trade opportunity');
  }
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
 *
 * Now accepts both underpriced and overpriced scenarios:
 * - Underpriced: Market < Prediction (buy predicted outcome)
 * - Overpriced: Market > Prediction (buy opposite outcome)
 *
 * Only requirement is that delta exceeds minimum threshold.
 */
export function validateTradeOpportunity(input: StrategyInput, minDeltaPercent: number = 2.5): {
  valid: boolean;
  reason?: string;
  delta?: number;
} {
  const { predictionProbability, currentMarketPrice, outcome } = input;

  const predictionPrice = predictionProbability / 100;

  // Determine the market price for the predicted outcome
  const outcomeMarketPrice = outcome === 'YES' ? currentMarketPrice : (1 - currentMarketPrice);

  // Calculate delta (difference between prediction and market for the predicted outcome)
  const delta = Math.abs(predictionPrice - outcomeMarketPrice) * 100;

  // Check if delta meets minimum threshold
  if (delta < minDeltaPercent) {
    return {
      valid: false,
      reason: `Delta ${delta.toFixed(2)}% is below minimum threshold ${minDeltaPercent}%`,
      delta,
    };
  }

  // Both underpriced and overpriced are now valid
  // No direction check needed - strategy will handle the direction
  return {
    valid: true,
    delta,
  };
}

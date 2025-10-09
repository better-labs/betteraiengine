import { logger } from './logger.js';

/**
 * Result type for parsing operations that may fail
 */
export interface ParseResult<T> {
  success: boolean;
  value?: T;
  error?: string;
}

/**
 * Parse Polymarket outcomePrices string to array of numbers
 * Expected format: JSON string like '["0.45", "0.55"]' or "[0.45, 0.55]"
 *
 * @param outcomePrices - Raw outcomePrices string from Polymarket API
 * @returns ParseResult with array of prices or error
 */
export function parseOutcomePrices(outcomePrices?: string): ParseResult<number[]> {
  if (!outcomePrices) {
    return {
      success: false,
      error: 'outcomePrices is undefined or empty',
    };
  }

  try {
    const parsed = JSON.parse(outcomePrices);

    if (!Array.isArray(parsed)) {
      return {
        success: false,
        error: 'outcomePrices is not an array',
      };
    }

    const prices = parsed.map((price, index) => {
      const num = typeof price === 'string' ? parseFloat(price) : Number(price);
      if (isNaN(num)) {
        throw new Error(`Invalid price at index ${index}: ${price}`);
      }
      return num;
    });

    return {
      success: true,
      value: prices,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to parse outcomePrices: ${errorMessage}`,
    };
  }
}

/**
 * Extract YES outcome price (first element) from outcomePrices string
 *
 * @param outcomePrices - Raw outcomePrices string from Polymarket API
 * @returns ParseResult with YES price (0-1 range) or error
 */
export function getYesOutcomePrice(outcomePrices?: string): ParseResult<number> {
  const parseResult = parseOutcomePrices(outcomePrices);

  if (!parseResult.success || !parseResult.value) {
    return {
      success: false,
      error: parseResult.error,
    };
  }

  if (parseResult.value.length === 0) {
    return {
      success: false,
      error: 'outcomePrices array is empty',
    };
  }

  return {
    success: true,
    value: parseResult.value[0],
  };
}

/**
 * Calculate prediction delta between market price and AI prediction
 * Delta = Market YES Price - Predicted YES Probability (both as decimals 0-1)
 *
 * Positive delta = AI more bullish than market (predicts higher than market price)
 * Negative delta = AI more bearish than market (predicts lower than market price)
 *
 * @param marketOutcomePrices - Raw outcomePrices string from Polymarket API
 * @param predictedProbability - AI predicted probability for YES outcome (0-100 scale)
 * @returns ParseResult with delta value or error
 */
export function calculatePredictionDelta(
  marketOutcomePrices?: string,
  predictedProbability?: number
): ParseResult<number> {
  // Validate predicted probability
  if (predictedProbability === undefined || predictedProbability === null) {
    return {
      success: false,
      error: 'predictedProbability is undefined or null',
    };
  }

  if (predictedProbability < 0 || predictedProbability > 100) {
    return {
      success: false,
      error: `predictedProbability out of range (0-100): ${predictedProbability}`,
    };
  }

  // Get market YES price
  const marketPriceResult = getYesOutcomePrice(marketOutcomePrices);
  if (!marketPriceResult.success || marketPriceResult.value === undefined) {
    return {
      success: false,
      error: `Failed to get market price: ${marketPriceResult.error}`,
    };
  }

  // Convert predicted probability from 0-100 scale to 0-1 scale
  const predictedProbabilityDecimal = predictedProbability / 100;

  // Calculate delta: market price - predicted probability
  const rawDelta = marketPriceResult.value - predictedProbabilityDecimal;
  
  // Return absolute value to always be positive
  const delta = Math.abs(rawDelta);

  logger.debug(
    {
      marketPrice: marketPriceResult.value,
      predictedProbability,
      predictedProbabilityDecimal,
      rawDelta,
      delta,
    },
    'Calculated prediction delta'
  );

  return {
    success: true,
    value: delta,
  };
}

/**
 * Format outcome prices for display in prompts
 *
 * @param outcomePrices - Raw outcomePrices string from Polymarket API
 * @returns Formatted string for display, or error message
 */
export function formatOutcomePrices(outcomePrices?: string): string {
  const parseResult = parseOutcomePrices(outcomePrices);

  if (!parseResult.success || !parseResult.value) {
    return 'N/A';
  }

  const [yesPrice, noPrice] = parseResult.value;
  return `YES: ${(yesPrice * 100).toFixed(1)}%, NO: ${(noPrice * 100).toFixed(1)}%`;
}

/**
 * Determines if a market is open for betting
 * @param market - Market with status and date fields (compatible with PolymarketMarket interface)
 * @returns true if market is accepting bets, false otherwise
 */
export function isMarketOpenForBetting(market: {
  closed?: boolean;
  closedTime?: string;
  endDate?: string;
}): boolean {
  const now = new Date();

  // If market is explicitly marked as closed, it's not open for betting
  if (market.closed) return false;

  // If closedTime exists and is in the past, market is closed
  if (market.closedTime) {
    const closedTime = new Date(market.closedTime);
    if (closedTime <= now) return false;
  }

  // Fallback to endDate if closedTime not available
  const endDate = market.endDate ? new Date(market.endDate) : null;
  if (endDate && endDate <= now) return false;

  return true;
}

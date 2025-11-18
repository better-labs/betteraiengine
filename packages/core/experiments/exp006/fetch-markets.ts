import { logger } from '../../utils/logger.js';
import { fetchFilteredTrendingMarkets, PolymarketMarket } from '../../services/polymarket.js';

export interface FetchTrendingMarketsOptions {
  limit?: number;
  maxSpreadPercent?: number;
  excludeTags?: string[];
}

export interface FetchTrendingMarketsResult {
  success: boolean;
  markets?: PolymarketMarket[];
  error?: string;
}

/**
 * Fetch trending markets with filtering options
 * Used by exp006 to get a list of markets to analyze
 */
export async function fetchTrendingMarkets(
  options: FetchTrendingMarketsOptions = {}
): Promise<FetchTrendingMarketsResult> {
  try {
    const {
      limit = 100,
      maxSpreadPercent = 25,
      excludeTags = ['Crypto', 'Hide From New', 'Weekly', 'Recurring'],
    } = options;

    const maxSpread = maxSpreadPercent / 100; // Convert to decimal

    logger.info(
      {
        experimentId: '006',
        limit,
        maxSpreadPercent,
        excludeTags,
      },
      'Fetching filtered trending markets'
    );

    const results = await fetchFilteredTrendingMarkets({
      limit,
      excludeTags,
      maxSpread,
    });

    const markets = results.map(({ market }) => market);

    logger.info(
      {
        experimentId: '006',
        totalMarkets: markets.length,
      },
      'Trending markets fetched successfully'
    );

    return {
      success: true,
      markets,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        experimentId: '006',
        error: errorMessage,
      },
      'Failed to fetch trending markets'
    );

    return {
      success: false,
      error: errorMessage,
    };
  }
}

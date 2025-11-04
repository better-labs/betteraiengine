import { logger } from '../../utils/logger.js';
import { PolymarketMarket, PolymarketTag } from '../../services/polymarket.js';

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

interface CategoryVolumeStats {
  category: string;
  totalVolume24hr: number;
  marketCount: number;
  averageVolume: number;
  markets: Array<{
    id: string;
    question: string;
    volume24hr: number;
    slug: string;
    eventTitle?: string;
  }>;
}

/**
 * Fetch markets in batches to get top 1000 trending markets
 * The API limits us to ~100 per request, so we'll make multiple calls
 */
async function fetchTop1000Markets(): Promise<PolymarketMarket[]> {
  const batchSize = 100;
  const totalToFetch = 1000;
  const batches = Math.ceil(totalToFetch / batchSize);

  logger.info({ batches, batchSize, totalToFetch }, 'Fetching markets in batches');

  const allMarkets: PolymarketMarket[] = [];

  for (let i = 0; i < batches; i++) {
    const offset = i * batchSize;
    const url = `${GAMMA_API_BASE}/markets?order=volume24hr&ascending=false&limit=${batchSize}&offset=${offset}&active=true&closed=false`;

    logger.info({ batch: i + 1, offset, url }, 'Fetching batch');

    try {
      const response = await fetch(url);

      if (!response.ok) {
        logger.error({ status: response.status, statusText: response.statusText }, 'Failed to fetch batch');
        break;
      }

      const data = await response.json();
      const markets = Array.isArray(data) ? data : [];

      if (markets.length === 0) {
        logger.info({ batch: i + 1 }, 'No more markets available');
        break;
      }

      allMarkets.push(...markets);
      logger.info({ batch: i + 1, batchCount: markets.length, totalCount: allMarkets.length }, 'Batch fetched');

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      logger.error({ batch: i + 1, error }, 'Error fetching batch');
      break;
    }
  }

  logger.info({ totalMarkets: allMarkets.length }, 'Finished fetching markets');
  return allMarkets;
}

/**
 * Calculate aggregate volume by category/event type
 * Since tags aren't reliably available, we'll use event titles and categories
 */
function calculateCategoryVolumes(markets: PolymarketMarket[]): Map<string, CategoryVolumeStats> {
  const categoryStats = new Map<string, CategoryVolumeStats>();

  for (const market of markets) {
    // Parse volume24hr from the market
    const volume24hr = parseFloat((market as any).volume24hr || market.volume || '0');

    // Get event information for categorization
    const events = (market as any).events;
    let category = 'Uncategorized';
    let eventTitle = market.groupItemTitle || undefined;

    if (events && Array.isArray(events) && events.length > 0) {
      const event = events[0];
      eventTitle = event.title || eventTitle;

      // Try to categorize based on event title and market question
      const text = `${eventTitle || ''} ${market.question}`.toLowerCase();

      if (text.match(/election|political|president|mayor|congress|senate|governor/)) {
        category = 'Politics';
      } else if (text.match(/nfl|nba|nhl|mlb|sports|football|basketball|baseball|soccer|f1|formula|ufc|boxing/)) {
        category = 'Sports';
      } else if (text.match(/crypto|bitcoin|eth|blockchain|token|defi/)) {
        category = 'Crypto';
      } else if (text.match(/tech|ai|apple|google|tesla|microsoft|amazon/)) {
        category = 'Technology';
      } else if (text.match(/entertainment|movie|oscar|emmy|music|celebrity|taylor swift/)) {
        category = 'Entertainment';
      } else if (text.match(/weather|temperature|climate/)) {
        category = 'Weather';
      } else if (text.match(/economy|gdp|inflation|recession|market|stock/)) {
        category = 'Economics';
      } else if (text.match(/science|space|nasa|research/)) {
        category = 'Science';
      } else if (text.match(/war|military|conflict|ukraine|israel/)) {
        category = 'Geopolitics';
      } else {
        category = 'Other';
      }
    }

    if (!categoryStats.has(category)) {
      categoryStats.set(category, {
        category,
        totalVolume24hr: 0,
        marketCount: 0,
        averageVolume: 0,
        markets: [],
      });
    }

    const stats = categoryStats.get(category)!;
    stats.totalVolume24hr += volume24hr;
    stats.marketCount += 1;
    stats.markets.push({
      id: market.id,
      question: market.question,
      volume24hr,
      slug: market.slug,
      eventTitle: typeof eventTitle === 'string' ? eventTitle : undefined,
    });
  }

  // Calculate averages and sort markets within each category
  for (const stats of categoryStats.values()) {
    stats.averageVolume = stats.marketCount > 0 ? stats.totalVolume24hr / stats.marketCount : 0;
    // Sort markets by volume descending
    stats.markets.sort((a, b) => b.volume24hr - a.volume24hr);
    // Keep only top 10 markets per category for readability
    stats.markets = stats.markets.slice(0, 10);
  }

  return categoryStats;
}

/**
 * Main analysis function
 */
export async function analyzeTagsByVolume() {
  logger.info('Starting category volume analysis');

  // Step 1: Fetch top 1000 markets
  const markets = await fetchTop1000Markets();

  if (markets.length === 0) {
    logger.error('No markets fetched, aborting analysis');
    return;
  }

  // Step 2: Calculate category volumes
  const categoryStats = calculateCategoryVolumes(markets);

  // Step 3: Sort by total volume
  const sortedCategories = Array.from(categoryStats.values()).sort(
    (a, b) => b.totalVolume24hr - a.totalVolume24hr
  );

  // Step 4: Log results
  logger.info({ totalCategories: sortedCategories.length, totalMarkets: markets.length }, 'Analysis complete');

  console.log('\n=== TOP CATEGORIES BY 24HR VOLUME ===\n');

  for (let i = 0; i < sortedCategories.length; i++) {
    const cat = sortedCategories[i];
    console.log(`${i + 1}. ${cat.category}`);
    console.log(`   Total 24hr Volume: $${cat.totalVolume24hr.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
    console.log(`   Market Count: ${cat.marketCount}`);
    console.log(`   Avg Volume/Market: $${cat.averageVolume.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
    console.log(`   Top Markets:`);
    for (let j = 0; j < Math.min(5, cat.markets.length); j++) {
      const m = cat.markets[j];
      console.log(`     - ${m.question.substring(0, 100)}...`);
      console.log(`       Volume: $${m.volume24hr.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
    }
    console.log('');
  }

  // Return data for further analysis
  return {
    markets,
    categoryStats: sortedCategories,
  };
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  analyzeTagsByVolume()
    .then(() => {
      logger.info('Analysis complete');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Analysis failed');
      process.exit(1);
    });
}

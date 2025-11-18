import { logger } from '../utils/logger.js';
import { parseOutcomePrices } from '../utils/market-utils.js';

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  active?: boolean;
  closed?: boolean;
  icon?: string;
  image?: string;
  [key: string]: unknown;
}

export interface PolymarketMarket {
  id: string;
  slug: string;
  conditionId: string;
  question: string;
  description?: string;
  eventSlug?: string;
  active?: boolean;
  closed?: boolean;
  volume?: string;
  liquidity?: string;
  outcomes?: string;
  outcomePrices?: string;
  clobTokenIds?: string; // JSON array: ["<yes_token_id>", "<no_token_id>"]
  icon?: string;
  image?: string;
  tags?: PolymarketTag[];
  [key: string]: unknown;
}

export interface PolymarketTag {
  id: string;
  label: string | null; // API uses 'label' not 'name'
  slug: string | null;
  forceShow?: boolean | null;
  publishedAt?: string | null;
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  forceHide?: boolean | null;
  isCarousel?: boolean | null;
  [key: string]: unknown;
}

/**
 * Fetch event by slug from Polymarket Gamma API
 */
export async function fetchEventBySlug(slug: string): Promise<PolymarketEvent> {
  const url = `${GAMMA_API_BASE}/events?slug=${slug}`;
  logger.info({ slug, url }, 'Fetching event from Polymarket');

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch event ${slug}: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // API returns an array, get the first result
  const event = Array.isArray(data) ? data[0] : data;

  if (!event) {
    throw new Error(`Event with slug ${slug} not found`);
  }

  logger.info({ slug, eventId: event.id }, 'Successfully fetched event');

  return event as PolymarketEvent;
}

/**
 * Fetch market by ID from Polymarket Gamma API
 */
export async function fetchMarketById(id: string): Promise<PolymarketMarket> {
  const url = `${GAMMA_API_BASE}/markets/${id}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch market ${id}: ${response.status} ${response.statusText}`);
  }

  const market = await response.json();

  if (!market) {
    throw new Error(`Market with ID ${id} not found`);
  }

  return market as PolymarketMarket;
}

/**
 * Fetch market by slug from Polymarket Gamma API
 */
export async function fetchMarketBySlug(slug: string): Promise<PolymarketMarket> {
  const url = `${GAMMA_API_BASE}/markets?slug=${slug}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch market ${slug}: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // API returns an array, get the first result
  const market = Array.isArray(data) ? data[0] : data;

  if (!market) {
    throw new Error(`Market with slug ${slug} not found`);
  }

  return market as PolymarketMarket;
}

/**
 * Fetch top markets by volume/liquidity
 */
export async function fetchTopMarkets(limit: number = 10): Promise<PolymarketMarket[]> {
  const url = `${GAMMA_API_BASE}/markets?limit=${limit}&active=true&closed=false`;
  logger.info({ limit, url }, 'Fetching top markets from Polymarket');

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch top markets: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const markets = Array.isArray(data) ? data : [];
  logger.info({ count: markets.length }, 'Successfully fetched top markets');

  return markets as PolymarketMarket[];
}

/**
 * Extract the correct token ID for a given outcome from clobTokenIds
 * @param clobTokenIds - JSON array string like '["<yes_token_id>", "<no_token_id>"]'
 * @param outcome - 'YES' or 'NO'
 * @returns The token ID for the specified outcome
 */
export function extractTokenIdForOutcome(clobTokenIds: string | undefined, outcome: 'YES' | 'NO'): string {
  if (!clobTokenIds) {
    throw new Error('clobTokenIds is not available for this market');
  }

  try {
    const tokenIds = JSON.parse(clobTokenIds);
    if (!Array.isArray(tokenIds) || tokenIds.length < 2) {
      throw new Error('Invalid clobTokenIds format - expected array with 2 elements');
    }

    // Index 0 = YES, Index 1 = NO
    const tokenId = outcome === 'YES' ? tokenIds[0] : tokenIds[1];

    if (!tokenId || typeof tokenId !== 'string') {
      throw new Error(`Invalid token ID for outcome ${outcome}`);
    }

    return tokenId;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to extract token ID for outcome ${outcome}: ${errorMessage}`);
  }
}

/**
 * Get Polymarket URL for an event
 * Format: https://polymarket.com/event/{eventSlug}
 */
export function getPolymarketEventUrl(eventSlug: string): string {
  return `https://polymarket.com/event/${eventSlug}`;
}

/**
 * Get Polymarket URL for a market
 * Format: https://polymarket.com/event/{eventSlug}/{marketSlug}
 */
export function getPolymarketMarketUrl(market: PolymarketMarket): string {
  if (market.eventSlug) {
    return `https://polymarket.com/event/${market.eventSlug}/${market.slug}`;
  }
  // Fallback to old format if eventSlug is not available
  return `https://polymarket.com/event/${market.slug}`;
}

/**
 * Fetch all tags from Polymarket Gamma API
 */
export async function fetchTags(): Promise<PolymarketTag[]> {
  const url = `${GAMMA_API_BASE}/tags`;
  logger.info({ url }, 'Fetching tags from Polymarket');

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch tags: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const tags = Array.isArray(data) ? data : [];
  logger.info({ count: tags.length }, 'Successfully fetched tags');

  return tags as PolymarketTag[];
}

/**
 * Get tag IDs for given tag names (matches by label or slug)
 * According to Polymarket API docs: https://docs.polymarket.com/api-reference/tags/list-tags
 */
export async function getTagIds(tagNames: string[]): Promise<string[]> {
  const tags = await fetchTags();
  const tagIds: string[] = [];

  for (const tagName of tagNames) {
    const tag = tags.find(
      (t) =>
        (t.label && t.label.toLowerCase() === tagName.toLowerCase()) ||
        (t.slug && t.slug.toLowerCase() === tagName.toLowerCase())
    );
    if (tag) {
      tagIds.push(tag.id);
    } else {
      logger.warn({ tagName }, 'Tag not found, skipping exclusion');
    }
  }

  logger.info({ tagNames, tagIds }, 'Resolved tag IDs');
  return tagIds;
}

/**
 * Fetch trending markets by 24-hour volume from Polymarket Gamma API
 * According to Polymarket API docs: https://docs.polymarket.com/api-reference/markets/list-markets
 * @param limit - Maximum number of markets to fetch
 * @param excludedTagIds - Optional array of tag IDs to exclude (will be added to query params if API supports it)
 */
export async function fetchTrendingMarkets(
  limit: number = 100,
  excludedTagIds?: string[]
): Promise<PolymarketMarket[]> {
  // Use volume24hr for ordering (API uses this format per docs)
  let url = `${GAMMA_API_BASE}/markets?order=volume24hr&ascending=false&limit=${limit}&active=true&closed=false`;
  
  // Add tag exclusion if provided (API supports exclude_tag_id as comma-separated string or array)
  if (excludedTagIds && excludedTagIds.length > 0) {
    url += `&exclude_tag_id=${excludedTagIds.join(',')}`;
  }
  
  logger.info({ limit, excludedTagIds, url }, 'Fetching trending markets from Polymarket');

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch trending markets: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const markets = Array.isArray(data) ? data : [];
  logger.info({ count: markets.length }, 'Successfully fetched trending markets');

  return markets as PolymarketMarket[];
}

/**
 * Check if market has outcome price spread within the specified threshold (as decimal, e.g., 0.5 for 50%)
 * For yes/no markets: spread = |YES price - NO price|
 */
export function hasSpreadWithinThreshold(market: PolymarketMarket, maxSpread: number = 0.5): boolean {
  if (!market.outcomePrices) {
    return false;
  }

  const parseResult = parseOutcomePrices(market.outcomePrices);
  if (!parseResult.success || !parseResult.value || parseResult.value.length < 2) {
    return false;
  }

  const [yesPrice, noPrice] = parseResult.value;
  const spread = Math.abs(yesPrice - noPrice);

  return spread <= maxSpread;
}

/**
 * Check if market has any of the excluded tag IDs
 */
export function hasExcludedTags(market: PolymarketMarket, excludedTagIds: string[]): boolean {
  if (!market.tags || !Array.isArray(market.tags) || excludedTagIds.length === 0) {
    return false;
  }

  const marketTagIds = market.tags.map((tag) => (typeof tag === 'object' && tag.id ? tag.id : String(tag)));
  return marketTagIds.some((tagId) => excludedTagIds.includes(tagId));
}

/**
 * Fetch and filter trending markets based on criteria:
 * - Trending by 24-hour volume
 * - Exclude markets with specified tags
 * - Only include markets with yes/no outcome price spreads within threshold (default: 25%)
 *
 * @param options - Filtering options
 * @returns Array of filtered market IDs and slugs
 */
export async function fetchFilteredTrendingMarkets(options: {
  limit?: number;
  excludeTags?: string[];
  maxSpread?: number;
}): Promise<{ id: string; slug: string; market: PolymarketMarket }[]> {
  const { limit = 100, excludeTags = ['Crypto', 'Hide From New', 'Weekly', 'Recurring'], maxSpread = 0.25 } = options;

  logger.info({ limit, excludeTags, maxSpread }, 'Fetching filtered trending markets');

  // Get excluded tag IDs first (needed for both API filtering and client-side fallback)
  const excludedTagIds = excludeTags.length > 0 ? await getTagIds(excludeTags) : [];

  // Fetch trending markets with tag exclusion via API (if supported)
  const markets = await fetchTrendingMarkets(limit, excludedTagIds);

  // Filter markets
  const filteredMarkets = markets.filter((market) => {
    // Exclude markets with filtered tags
    if (hasExcludedTags(market, excludedTagIds)) {
      return false;
    }

    // Only include markets with spread within threshold
    if (!hasSpreadWithinThreshold(market, maxSpread)) {
      return false;
    }

    // Only include active, non-closed markets
    if (!market.active || market.closed) {
      return false;
    }

    return true;
  });

  logger.info(
    { initialCount: markets.length, filteredCount: filteredMarkets.length },
    'Filtered trending markets'
  );

  return filteredMarkets.map((market) => ({
    id: market.id,
    slug: market.slug,
    market,
  }));
}

import { logger } from '../utils/logger.js';

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
  [key: string]: unknown;
}

/**
 * Fetch event by slug from Polymarket Gamma API
 */
export async function fetchEventBySlug(slug: string): Promise<PolymarketEvent> {
  const url = `${GAMMA_API_BASE}/events/${slug}`;
  logger.info({ slug, url }, 'Fetching event from Polymarket');

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch event ${slug}: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  logger.info({ slug, eventId: data.id }, 'Successfully fetched event');

  return data as PolymarketEvent;
}

/**
 * Fetch market by slug from Polymarket Gamma API
 */
export async function fetchMarketBySlug(slug: string): Promise<PolymarketMarket> {
  const url = `${GAMMA_API_BASE}/markets/${slug}`;
  logger.info({ slug, url }, 'Fetching market from Polymarket');

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch market ${slug}: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  logger.info({ slug, marketId: data.id }, 'Successfully fetched market');

  return data as PolymarketMarket;
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

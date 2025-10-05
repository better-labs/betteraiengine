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

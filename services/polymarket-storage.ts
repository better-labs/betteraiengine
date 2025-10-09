import { db, rawEvents, rawMarkets, events, markets } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger.js';
import { PolymarketEvent, PolymarketMarket } from './polymarket.js';

/**
 * Save raw event JSON to database
 */
export async function saveRawEvent(eventData: PolymarketEvent) {
  logger.info({ eventId: eventData.id }, 'Saving raw event to database');

  const result = await db
    .insert(rawEvents)
    .values({
      data: eventData,
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: rawEvents.eventId,
      set: {
        data: eventData,
        fetchedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  logger.info({ eventId: eventData.id, dbId: result[0].id }, 'Raw event saved');
  return result[0];
}

/**
 * Save raw market JSON to database
 */
export async function saveRawMarket(marketData: PolymarketMarket) {
  const result = await db
    .insert(rawMarkets)
    .values({
      data: marketData,
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: rawMarkets.marketId,
      set: {
        data: marketData,
        fetchedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  return result[0];
}

/**
 * Save structured event to database
 */
export async function saveEvent(eventData: PolymarketEvent) {
  logger.info({ eventId: eventData.id }, 'Saving structured event to database');

  const result = await db
    .insert(events)
    .values({
      eventId: eventData.id,
      slug: eventData.slug,
      title: eventData.title,
      description: eventData.description || null,
      startDate: eventData.startDate ? new Date(eventData.startDate) : null,
      endDate: eventData.endDate ? new Date(eventData.endDate) : null,
      active: eventData.active ?? true,
      closed: eventData.closed ?? false,
      icon: eventData.icon || null,
      image: eventData.image || null,
    })
    .onConflictDoUpdate({
      target: events.eventId,
      set: {
        slug: eventData.slug,
        title: eventData.title,
        description: eventData.description || null,
        startDate: eventData.startDate ? new Date(eventData.startDate) : null,
        endDate: eventData.endDate ? new Date(eventData.endDate) : null,
        active: eventData.active ?? true,
        closed: eventData.closed ?? false,
        icon: eventData.icon || null,
        image: eventData.image || null,
        updatedAt: new Date(),
      },
    })
    .returning();

  logger.info({ eventId: eventData.id, dbId: result[0].id }, 'Structured event saved');
  return result[0];
}

/**
 * Save structured market to database
 */
export async function saveMarket(marketData: PolymarketMarket) {
  const result = await db
    .insert(markets)
    .values({
      marketId: marketData.id,
      conditionId: marketData.conditionId,
      slug: marketData.slug,
      question: marketData.question,
      description: marketData.description || null,
      eventId: marketData.eventSlug || null,
      active: marketData.active ?? true,
      closed: marketData.closed ?? false,
      volume: marketData.volume || null,
      liquidity: marketData.liquidity || null,
      icon: marketData.icon || null,
      image: marketData.image || null,
    })
    .onConflictDoUpdate({
      target: markets.marketId,
      set: {
        slug: marketData.slug,
        question: marketData.question,
        description: marketData.description || null,
        eventId: marketData.eventSlug || null,
        active: marketData.active ?? true,
        closed: marketData.closed ?? false,
        volume: marketData.volume || null,
        liquidity: marketData.liquidity || null,
        icon: marketData.icon || null,
        image: marketData.image || null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return result[0];
}

/**
 * Ingest event: fetch from API and save both raw and structured data
 */
export async function ingestEvent(eventData: PolymarketEvent) {
  await saveRawEvent(eventData);
  await saveEvent(eventData);
  logger.info({ eventId: eventData.id }, 'Event ingestion complete');
}

/**
 * Ingest market: fetch from API and save both raw and structured data
 */
export async function ingestMarket(marketData: PolymarketMarket) {
  await saveRawMarket(marketData);
  await saveMarket(marketData);
}

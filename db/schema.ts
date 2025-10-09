import { pgTable, text, timestamp, jsonb, serial, uuid, integer, boolean, real } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Raw Event table - stores pure JSONB from Polymarket API
export const rawEvents = pgTable('raw_events', {
  id: serial('id').primaryKey(),
  // Generated columns from JSONB payload
  eventId: text('event_id').notNull().unique()
    .generatedAlwaysAs(sql`(data->>'id')::text`),
  slug: text('slug')
    .generatedAlwaysAs(sql`(data->>'slug')::text`),

  // Raw API response
  data: jsonb('data').notNull(),

  // Metadata
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Raw Market table - stores pure JSONB from Polymarket API
export const rawMarkets = pgTable('raw_markets', {
  id: serial('id').primaryKey(),
  // Generated columns from JSONB payload
  marketId: text('market_id').notNull().unique()
    .generatedAlwaysAs(sql`(data->>'id')::text`),
  slug: text('slug')
    .generatedAlwaysAs(sql`(data->>'slug')::text`),
  conditionId: text('condition_id')
    .generatedAlwaysAs(sql`(data->>'conditionId')::text`),

  // Raw API response
  data: jsonb('data').notNull(),

  // Metadata
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Structured Events table
export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  eventId: text('event_id').notNull().unique(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  active: boolean('active').default(true),
  closed: boolean('closed').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Structured Markets table
export const markets = pgTable('markets', {
  id: serial('id').primaryKey(),
  marketId: text('market_id').notNull().unique(),
  conditionId: text('condition_id').notNull(),
  slug: text('slug').notNull().unique(),
  question: text('question').notNull(),
  description: text('description'),
  eventId: text('event_id').references(() => events.eventId),

  // Market state
  active: boolean('active').default(true),
  closed: boolean('closed').default(false),

  // Market metrics (can be updated on each fetch)
  volume: text('volume'), // Using text for big numbers
  liquidity: text('liquidity'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Prediction Jobs table
export const predictionJobs = pgTable('prediction_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  marketId: text('market_id').references(() => markets.marketId),
  eventId: text('event_id').references(() => events.eventId),

  status: text('status').notNull().default('pending'), // pending, running, completed, failed

  // Job metadata
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  error: text('error'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Predictions table - stores final prediction outputs
export const predictions = pgTable('predictions', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: uuid('job_id').references(() => predictionJobs.id).notNull(),
  marketId: text('market_id').references(() => markets.marketId),
  experimentId: text('experiment_id').notNull().default('unknown'),

  // Prediction output
  prediction: jsonb('prediction').notNull(), // Structured prediction output
  rawRequest: jsonb('raw_request'), // Raw LLM request (system + user prompts) for debugging
  rawResponse: jsonb('raw_response'), // Raw LLM response for debugging
  researchContext: text('research_context'), // Web research context used for prediction

  // Model info
  model: text('model'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),

  // Prediction metrics
  predictionDelta: real('prediction_delta'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type RawEvent = typeof rawEvents.$inferSelect;
export type NewRawEvent = typeof rawEvents.$inferInsert;
export type RawMarket = typeof rawMarkets.$inferSelect;
export type NewRawMarket = typeof rawMarkets.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Market = typeof markets.$inferSelect;
export type NewMarket = typeof markets.$inferInsert;
export type PredictionJob = typeof predictionJobs.$inferSelect;
export type NewPredictionJob = typeof predictionJobs.$inferInsert;
export type Prediction = typeof predictions.$inferSelect;
export type NewPrediction = typeof predictions.$inferInsert;

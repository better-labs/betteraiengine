# Hourly Prediction Benchmark Service Design

**Version:** 2.0.0
**Date:** 2025-11-10
**Status:** Draft - Serverless Edition

---

## Table of Contents

1. [Overview](#overview)
2. [Requirements](#requirements)
3. [Architecture](#architecture)
4. [Serverless Architecture with Vercel & Inngest](#serverless-architecture-with-vercel--inngest)
5. [Benchmark Methodology](#benchmark-methodology)
6. [Database Schema](#database-schema)
7. [Service Components](#service-components)
8. [Vercel Deployment Architecture](#vercel-deployment-architecture)
9. [Inngest Batch Job Orchestration](#inngest-batch-job-orchestration)
10. [Code Organization for Serverless](#code-organization-for-serverless)
11. [Metrics & Reporting](#metrics--reporting)
12. [Implementation Roadmap](#implementation-roadmap)
13. [Future Enhancements](#future-enhancements)

---

## Overview

The Hourly Prediction Benchmark Service is a batch processing system that continuously evaluates the performance of AI predictions by tracking market movement toward predicted outcomes. Unlike traditional approaches that wait for market closure, this service measures **directional accuracy** and **convergence velocity** in real-time.

### Key Objectives

- **Continuous Monitoring**: Check market prices hourly for all active predictions
- **Directional Accuracy**: Measure if markets move toward AI predictions over time
- **Performance Metrics**: Track convergence rate, prediction accuracy, and confidence calibration
- **API Exposure**: Enable future web dashboard and external integrations
- **Scalability**: Support growing prediction volume without performance degradation

---

## Requirements

### Functional Requirements

1. **Hourly Price Checks**: Automated batch job runs every hour to fetch latest market prices
2. **Benchmark Recording**: Store timestamped snapshots of prediction vs. market delta
3. **Movement Detection**: Determine if market is converging toward or diverging from prediction
4. **Active Markets Only**: Only benchmark predictions for markets still open for betting
5. **Historical Tracking**: Maintain complete time-series data for analysis
6. **API Access**: Expose benchmark data via RESTful API for future web interface

### Non-Functional Requirements

1. **Performance**: Process 1000+ predictions per hour within 5-minute window
2. **Reliability**: Retry logic for API failures with exponential backoff
3. **Observability**: Structured logging and error tracking
4. **Extensibility**: Support multiple benchmark metrics and strategies
5. **Cost Efficiency**: Batch API requests to minimize rate limiting

---

## Architecture

### Serverless System Overview

```
                    ┌─────────────────────────────────┐
                    │      Vercel Edge Network        │
                    │  (Global CDN + Edge Functions)  │
                    └─────────────────────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
        ▼                          ▼                          ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   Next.js App    │    │  tRPC API Routes │    │  Inngest Events  │
│  (SSR/RSC/ISR)   │    │  /api/trpc/*     │    │  /api/inngest    │
└──────────────────┘    └──────────────────┘    └──────────────────┘
                                   │                          │
                                   ▼                          ▼
                        ┌──────────────────┐    ┌──────────────────┐
                        │   Core Services  │    │  Inngest Cloud   │
                        │  (@core package) │    │  Orchestration   │
                        └──────────────────┘    └──────────────────┘
                                   │                          │
        ┌──────────────────────────┼──────────────────────────┤
        │                          │                          │
        ▼                          ▼                          ▼
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│  Vercel      │         │   Neon DB    │         │  Polymarket  │
│  Postgres    │         │  (Postgres)  │         │  Gamma API   │
│  or Neon     │         │  Serverless  │         │              │
└──────────────┘         └──────────────┘         └──────────────┘
```

### Serverless Component Flow

```
┌────────────────────────────────────────────────────────────────┐
│                    Hourly Benchmark Flow                        │
└────────────────────────────────────────────────────────────────┘

1. Inngest Cron Trigger (Every Hour)
   │
   ▼
2. Inngest invokes: /api/inngest (Vercel Serverless Function)
   │
   ▼
3. Inngest Function "benchmark.hourly" executes
   │
   ├─▶ Step 1: Fetch active predictions from DB
   │   └─▶ Neon Postgres (serverless, auto-scales)
   │
   ├─▶ Step 2: Fan-out to parallel prediction workers
   │   └─▶ Inngest sends events: "benchmark.process-prediction"
   │
   ├─▶ Step 3: Each worker processes one prediction
   │   ├─▶ Fetch market price (Polymarket API)
   │   ├─▶ Calculate metrics
   │   └─▶ Save snapshot to DB
   │
   └─▶ Step 4: Aggregate results & update summary
       └─▶ Update benchmark_summary table
```

### Key Architectural Benefits

**Serverless Advantages:**
- ✅ **Zero Infrastructure Management**: No servers to provision or maintain
- ✅ **Auto-Scaling**: Handles 10 or 10,000 predictions seamlessly
- ✅ **Pay-per-Use**: Only pay for actual execution time
- ✅ **Global Edge**: Low-latency API responses worldwide
- ✅ **Built-in Reliability**: Automatic retries and error handling
- ✅ **Instant Deploys**: Git push → Production in <1 minute

**Inngest Advantages:**
- ✅ **Durable Execution**: Functions resume after failures
- ✅ **Visual Debugging**: See every step of every execution
- ✅ **Automatic Retries**: Exponential backoff built-in
- ✅ **Fan-out/Fan-in**: Process 1000s of predictions in parallel
- ✅ **Rate Limiting**: Respect API limits automatically
- ✅ **Scheduling**: Cron expressions for hourly jobs

---

## Benchmark Methodology

### Core Concept: Directional Movement Tracking

Instead of waiting for market resolution, we measure **convergence** toward AI predictions:

#### Metrics Tracked

1. **Absolute Delta** (`abs_delta`)
   - `|current_market_price - predicted_probability|`
   - Measures distance between market and prediction

2. **Directional Movement** (`movement_direction`)
   - `CONVERGING`: Market moving closer to prediction
   - `DIVERGING`: Market moving away from prediction
   - `STABLE`: No significant change (< 0.5% threshold)

3. **Convergence Velocity** (`convergence_rate`)
   - Rate of change toward prediction per hour
   - `(previous_delta - current_delta) / hours_elapsed`

4. **Cumulative Movement** (`cumulative_convergence`)
   - Total movement toward prediction since creation
   - `initial_delta - current_delta`

5. **Confidence Calibration** (`confidence_score`)
   - How well AI confidence matches actual convergence
   - Higher confidence predictions should converge faster

### Example Calculation

```javascript
// Initial State (T0)
AI Prediction: YES at 75% (confidence: 85%)
Market Price: YES at 60%
Initial Delta: 15%

// Hour 1 (T1)
Market Price: YES at 63%
Current Delta: 12%
Movement: CONVERGING (delta decreased by 3%)
Convergence Rate: +3% per hour
Cumulative Convergence: +3%

// Hour 2 (T2)
Market Price: YES at 66%
Current Delta: 9%
Movement: CONVERGING (delta decreased by 3%)
Convergence Rate: +3% per hour
Cumulative Convergence: +6%

// Hour 24 (T24)
Market Price: YES at 73%
Current Delta: 2%
Movement: CONVERGING
Cumulative Convergence: +13% (86% of predicted edge)
Status: Strong directional accuracy ✓
```

---

## Database Schema

### New Tables

#### `benchmark_snapshots`

Stores hourly snapshots of prediction performance.

```sql
CREATE TABLE benchmark_snapshots (
  id SERIAL PRIMARY KEY,
  prediction_id UUID NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
  market_id TEXT NOT NULL REFERENCES markets(market_id),

  -- Timestamp
  snapshot_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Market State
  market_price_yes REAL NOT NULL,           -- Current YES outcome price (0-1)
  market_price_no REAL NOT NULL,            -- Current NO outcome price (0-1)
  market_closed BOOLEAN NOT NULL DEFAULT false,
  market_resolved BOOLEAN NOT NULL DEFAULT false,

  -- Prediction State
  predicted_probability REAL NOT NULL,      -- AI prediction (0-1 scale)
  predicted_confidence REAL,                -- AI confidence (0-100 scale)

  -- Benchmark Metrics
  abs_delta REAL NOT NULL,                  -- |market_price - predicted_prob|
  movement_direction TEXT,                  -- CONVERGING, DIVERGING, STABLE
  convergence_rate REAL,                    -- Change in delta per hour
  cumulative_convergence REAL,              -- Total movement since prediction
  hours_since_prediction INTEGER,           -- Time elapsed since prediction

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Indexes for performance
  INDEX idx_prediction_id (prediction_id),
  INDEX idx_snapshot_at (snapshot_at),
  INDEX idx_market_id (market_id),
  INDEX idx_movement_direction (movement_direction)
);
```

#### `benchmark_summary`

Aggregated view of prediction performance (updated hourly).

```sql
CREATE TABLE benchmark_summary (
  id SERIAL PRIMARY KEY,
  prediction_id UUID NOT NULL UNIQUE REFERENCES predictions(id) ON DELETE CASCADE,
  market_id TEXT NOT NULL REFERENCES markets(market_id),

  -- Prediction Metadata
  experiment_id TEXT NOT NULL,
  predicted_at TIMESTAMP NOT NULL,
  predicted_probability REAL NOT NULL,
  predicted_confidence REAL,
  initial_market_price REAL NOT NULL,
  initial_delta REAL NOT NULL,

  -- Current State
  latest_market_price REAL,
  latest_delta REAL,
  market_closed BOOLEAN NOT NULL DEFAULT false,
  market_resolved BOOLEAN NOT NULL DEFAULT false,

  -- Performance Metrics
  total_snapshots INTEGER NOT NULL DEFAULT 0,
  hours_tracked INTEGER NOT NULL DEFAULT 0,
  converging_snapshots INTEGER NOT NULL DEFAULT 0,
  diverging_snapshots INTEGER NOT NULL DEFAULT 0,
  stable_snapshots INTEGER NOT NULL DEFAULT 0,

  -- Aggregate Metrics
  avg_convergence_rate REAL,
  max_convergence_rate REAL,
  cumulative_convergence REAL,
  convergence_percentage REAL,              -- (cumulative / initial_delta) * 100

  -- Status
  benchmark_status TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, PAUSED, COMPLETED
  last_benchmarked_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Schema Migration

```sql
-- Migration: Add benchmark tables
-- File: drizzle/migrations/0004_add_benchmark_tables.sql

CREATE TABLE benchmark_snapshots (
  id SERIAL PRIMARY KEY,
  prediction_id UUID NOT NULL,
  market_id TEXT NOT NULL,
  snapshot_at TIMESTAMP NOT NULL DEFAULT NOW(),
  market_price_yes REAL NOT NULL,
  market_price_no REAL NOT NULL,
  market_closed BOOLEAN NOT NULL DEFAULT false,
  market_resolved BOOLEAN NOT NULL DEFAULT false,
  predicted_probability REAL NOT NULL,
  predicted_confidence REAL,
  abs_delta REAL NOT NULL,
  movement_direction TEXT,
  convergence_rate REAL,
  cumulative_convergence REAL,
  hours_since_prediction INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_benchmark_snapshots_prediction_id ON benchmark_snapshots(prediction_id);
CREATE INDEX idx_benchmark_snapshots_snapshot_at ON benchmark_snapshots(snapshot_at);
CREATE INDEX idx_benchmark_snapshots_market_id ON benchmark_snapshots(market_id);
CREATE INDEX idx_benchmark_snapshots_movement_direction ON benchmark_snapshots(movement_direction);

CREATE TABLE benchmark_summary (
  id SERIAL PRIMARY KEY,
  prediction_id UUID NOT NULL UNIQUE,
  market_id TEXT NOT NULL,
  experiment_id TEXT NOT NULL,
  predicted_at TIMESTAMP NOT NULL,
  predicted_probability REAL NOT NULL,
  predicted_confidence REAL,
  initial_market_price REAL NOT NULL,
  initial_delta REAL NOT NULL,
  latest_market_price REAL,
  latest_delta REAL,
  market_closed BOOLEAN NOT NULL DEFAULT false,
  market_resolved BOOLEAN NOT NULL DEFAULT false,
  total_snapshots INTEGER NOT NULL DEFAULT 0,
  hours_tracked INTEGER NOT NULL DEFAULT 0,
  converging_snapshots INTEGER NOT NULL DEFAULT 0,
  diverging_snapshots INTEGER NOT NULL DEFAULT 0,
  stable_snapshots INTEGER NOT NULL DEFAULT 0,
  avg_convergence_rate REAL,
  max_convergence_rate REAL,
  cumulative_convergence REAL,
  convergence_percentage REAL,
  benchmark_status TEXT NOT NULL DEFAULT 'ACTIVE',
  last_benchmarked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_benchmark_summary_prediction_id ON benchmark_summary(prediction_id);
CREATE INDEX idx_benchmark_summary_market_id ON benchmark_summary(market_id);
CREATE INDEX idx_benchmark_summary_experiment_id ON benchmark_summary(experiment_id);
CREATE INDEX idx_benchmark_summary_status ON benchmark_summary(benchmark_status);
```

---

## Service Components

### 1. Benchmark Service (`services/benchmark-service.ts`)

Core service responsible for benchmarking logic.

```typescript
interface BenchmarkServiceOptions {
  batchSize?: number;          // Number of predictions to process per batch
  maxRetries?: number;          // API retry attempts
  retryDelayMs?: number;        // Delay between retries
  convergenceThreshold?: number; // Threshold for STABLE detection (default: 0.005)
}

class BenchmarkService {
  /**
   * Fetch all active predictions that need benchmarking
   */
  async getActivePredictions(): Promise<Prediction[]>

  /**
   * Check if market is still open for betting
   */
  async isMarketOpen(marketId: string): Promise<boolean>

  /**
   * Fetch current market price from Polymarket API
   */
  async fetchCurrentMarketPrice(marketId: string): Promise<number>

  /**
   * Calculate benchmark metrics for a prediction
   */
  async calculateBenchmarkMetrics(
    prediction: Prediction,
    currentMarketPrice: number,
    previousSnapshot?: BenchmarkSnapshot
  ): Promise<BenchmarkMetrics>

  /**
   * Store benchmark snapshot
   */
  async saveBenchmarkSnapshot(snapshot: BenchmarkSnapshot): Promise<void>

  /**
   * Update benchmark summary with latest metrics
   */
  async updateBenchmarkSummary(
    predictionId: string,
    metrics: BenchmarkMetrics
  ): Promise<void>
}
```

### 2. Batch Job Runner (`services/benchmark-batch-job.ts`)

Orchestrates the hourly benchmark process.

```typescript
interface BatchJobResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: Array<{ predictionId: string; error: string }>;
  durationMs: number;
}

class BenchmarkBatchJob {
  /**
   * Main entry point - runs hourly benchmark
   */
  async run(): Promise<BatchJobResult>

  /**
   * Process predictions in batches
   */
  private async processBatch(predictions: Prediction[]): Promise<void>

  /**
   * Handle individual prediction benchmarking
   */
  private async benchmarkPrediction(prediction: Prediction): Promise<void>

  /**
   * Error handling and retry logic
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number
  ): Promise<T>
}
```

### 3. Market Data Fetcher (`services/market-data-fetcher.ts`)

Optimized batch fetching from Polymarket API.

```typescript
interface MarketPriceData {
  marketId: string;
  priceYes: number;
  priceNo: number;
  closed: boolean;
  closedTime?: string;
  fetchedAt: Date;
}

class MarketDataFetcher {
  /**
   * Fetch market prices in batches to optimize API usage
   */
  async fetchMarketPricesBatch(
    marketIds: string[]
  ): Promise<Map<string, MarketPriceData>>

  /**
   * Fetch single market with caching
   */
  async fetchMarketPrice(marketId: string): Promise<MarketPriceData>

  /**
   * Check if market is open for betting
   */
  async isMarketOpen(marketId: string): Promise<boolean>
}
```

### 4. Benchmark Analytics (`services/benchmark-analytics.ts`)

Advanced analytics and reporting.

```typescript
interface AnalyticsReport {
  experimentId: string;
  totalPredictions: number;
  avgConvergenceRate: number;
  avgConfidenceCalibration: number;
  topPerformers: Prediction[];
  poorPerformers: Prediction[];
  convergenceDistribution: ConvergenceDistribution;
}

class BenchmarkAnalytics {
  /**
   * Generate analytics report for experiment
   */
  async generateExperimentReport(experimentId: string): Promise<AnalyticsReport>

  /**
   * Calculate confidence calibration
   */
  async calculateConfidenceCalibration(
    predictions: Prediction[]
  ): Promise<number>

  /**
   * Get convergence distribution
   */
  async getConvergenceDistribution(
    experimentId: string
  ): Promise<ConvergenceDistribution>
}
```

---

## Serverless Architecture with Vercel & Inngest

### Technology Stack

**Vercel**: Serverless hosting platform for Next.js with zero-config deployment, automatic scaling, and global CDN. Provides serverless functions for API routes with built-in monitoring.

**Architecture Pattern:**
```typescript
// packages/web/app/api/trpc/[trpc]/route.ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@betteraiengine/api';

export const runtime = 'edge'; // Run on Vercel Edge Network

const handler = (req: Request) => {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => ({}),
  });
};

export { handler as GET, handler as POST };
```

**Database**: Neon serverless Postgres with automatic connection pooling, database branching for preview environments, and auto-pause when inactive.

```typescript
// packages/core/db/index.ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

export const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql);
```

**Inngest**: Durable workflow orchestration platform for batch jobs. Handles cron scheduling, automatic retries with exponential backoff, fan-out/fan-in parallel processing, and built-in rate limiting. Provides visual debugging dashboard for all executions.

**Basic Inngest Pattern:**

```typescript
// packages/web/inngest/functions/benchmark-hourly.ts
import { inngest } from '../client';
import { BenchmarkService } from '@betteraiengine/core';

export const benchmarkHourly = inngest.createFunction(
  {
    id: 'benchmark-hourly',
    name: 'Hourly Benchmark Job'
  },
  { cron: '0 * * * *' }, // Every hour at minute 0
  async ({ event, step }) => {
    // Step 1: Fetch active predictions (durable step)
    const predictions = await step.run('fetch-predictions', async () => {
      const service = new BenchmarkService();
      return await service.getActivePredictions();
    });

    // Step 2: Fan-out to parallel workers
    const events = predictions.map(prediction => ({
      name: 'benchmark/process-prediction',
      data: { predictionId: prediction.id }
    }));

    await step.sendEvent('fan-out-predictions', events);

    // Step 3: Wait for all to complete and aggregate
    const results = await step.waitForEvent('benchmark/predictions-complete', {
      timeout: '5m',
      match: 'data.batchId'
    });

    return {
      processed: predictions.length,
      successful: results.successful,
      failed: results.failed
    };
  }
);
```

**Individual Prediction Worker:**

```typescript
// packages/web/inngest/functions/benchmark-prediction.ts
export const benchmarkPrediction = inngest.createFunction(
  {
    id: 'benchmark-prediction',
    name: 'Process Single Prediction Benchmark',
    concurrency: 50 // Process 50 predictions in parallel
  },
  { event: 'benchmark/process-prediction' },
  async ({ event, step }) => {
    const { predictionId } = event.data;

    // Step 1: Fetch market price with retry
    const marketPrice = await step.run('fetch-market-price', async () => {
      const fetcher = new MarketDataFetcher();
      return await fetcher.fetchCurrentMarketPrice(event.data.marketId);
    });

    // Step 2: Calculate metrics
    const metrics = await step.run('calculate-metrics', async () => {
      const service = new BenchmarkService();
      return await service.calculateBenchmarkMetrics(
        event.data.prediction,
        marketPrice
      );
    });

    // Step 3: Save to database
    await step.run('save-snapshot', async () => {
      const service = new BenchmarkService();
      await service.saveBenchmarkSnapshot(metrics);
      await service.updateBenchmarkSummary(predictionId, metrics);
    });

    return { predictionId, success: true };
  }
);
```

**Error Handling & Retries:**

```typescript
export const benchmarkPrediction = inngest.createFunction(
  {
    id: 'benchmark-prediction',
    retries: 3, // Retry failed executions
    rateLimit: {
      limit: 100,
      period: '1m' // Max 100 requests per minute
    }
  },
  { event: 'benchmark/process-prediction' },
  async ({ event, step, logger }) => {
    try {
      // Processing logic...
    } catch (error) {
      logger.error('Prediction benchmark failed', {
        predictionId: event.data.predictionId,
        error
      });

      // Inngest will automatically retry with exponential backoff
      throw error;
    }
  }
);
```

### Inngest Dashboard

Inngest provides a powerful dashboard to monitor all executions:

```
https://app.inngest.com/env/production/functions

┌─────────────────────────────────────────────────────────┐
│  Functions                                               │
├─────────────────────────────────────────────────────────┤
│  benchmark-hourly                                        │
│  ✓ Last run: 2 minutes ago                              │
│  ✓ Success rate: 98.5%                                   │
│  ⏱ Avg duration: 45s                                     │
│  📊 Processed: 156 predictions                           │
│                                                          │
│  Recent Runs:                                            │
│  [✓] 14:00 - 156 predictions (45s)                      │
│  [✓] 13:00 - 152 predictions (42s)                      │
│  [✓] 12:00 - 148 predictions (38s)                      │
└─────────────────────────────────────────────────────────┘

Click any run to see:
- Step-by-step execution timeline
- Input/output for each step
- Error messages and stack traces
- Retry attempts
- Performance metrics
```

---

## Vercel Deployment Architecture

### Project Structure for Vercel

```
betteraiengine/
├── packages/
│   ├── core/                    # Shared services (imported by all)
│   │   ├── services/
│   │   ├── db/
│   │   └── package.json
│   │
│   └── web/                     # Next.js app (deployed to Vercel)
│       ├── app/
│       │   ├── api/
│       │   │   ├── trpc/        # tRPC endpoints
│       │   │   │   └── [trpc]/route.ts
│       │   │   └── inngest/     # Inngest webhook
│       │   │       └── route.ts
│       │   ├── benchmarks/      # Web pages
│       │   └── predictions/
│       ├── inngest/             # Inngest functions
│       │   ├── client.ts
│       │   └── functions/
│       │       ├── benchmark-hourly.ts
│       │       └── benchmark-prediction.ts
│       ├── vercel.json          # Vercel config
│       └── package.json
│
├── pnpm-workspace.yaml
└── package.json
```

### Vercel Configuration

**vercel.json:**
```json
{
  "buildCommand": "pnpm build",
  "devCommand": "pnpm dev",
  "installCommand": "pnpm install",
  "framework": "nextjs",
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 300
    }
  },
  "env": {
    "DATABASE_URL": "@database-url",
    "INNGEST_EVENT_KEY": "@inngest-event-key",
    "INNGEST_SIGNING_KEY": "@inngest-signing-key"
  }
}
```

### Environment Variables

**Required Environment Variables:**
```bash
# Database (Neon or Vercel Postgres)
DATABASE_URL="postgresql://..."

# Inngest
INNGEST_EVENT_KEY="..."
INNGEST_SIGNING_KEY="..."

# Polymarket API (if needed)
POLYMARKET_API_KEY="..."

# OpenRouter / OpenAI (for predictions)
OPENROUTER_API_KEY="..."
```

**Setting up in Vercel:**
```bash
# Install Vercel CLI
pnpm add -g vercel

# Link project
vercel link

# Add environment variables
vercel env add DATABASE_URL production
vercel env add INNGEST_EVENT_KEY production
vercel env add INNGEST_SIGNING_KEY production

# Deploy
vercel --prod
```

### Database Setup (Neon)

**Why Neon:**
- Serverless Postgres (no connection management)
- Branching (preview environments get their own DB)
- Auto-pause when inactive (cost savings)
- Native Vercel integration
- Fast cold starts (<100ms)

**Setup:**
```bash
# 1. Create Neon project at https://neon.tech
# 2. Get connection string
# 3. Add to Vercel

# Run migrations
pnpm drizzle-kit push:pg
```

**Connection Pooling:**
```typescript
// packages/core/db/index.ts
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

// Enable connection pooling
neonConfig.fetchConnectionCache = true;

export const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql);
```

---

## Inngest Batch Job Orchestration

### Complete Inngest Setup

**1. Install Inngest:**
```bash
cd packages/web
pnpm add inngest
```

**2. Create Inngest Client:**
```typescript
// packages/web/inngest/client.ts
import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'betteraiengine',
  name: 'BetterAI Engine'
});
```

**3. Create Inngest API Route:**
```typescript
// packages/web/app/api/inngest/route.ts
import { serve } from 'inngest/next';
import { inngest } from '../../../inngest/client';
import { benchmarkHourly } from '../../../inngest/functions/benchmark-hourly';
import { benchmarkPrediction } from '../../../inngest/functions/benchmark-prediction';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    benchmarkHourly,
    benchmarkPrediction,
  ],
});
```

### Inngest Function Examples

**Hourly Benchmark (Main Orchestrator):**

```typescript
// packages/web/inngest/functions/benchmark-hourly.ts
import { inngest } from '../client';
import { db, predictions, benchmarkSummary } from '@betteraiengine/core/db';
import { eq } from 'drizzle-orm';

export const benchmarkHourly = inngest.createFunction(
  {
    id: 'benchmark-hourly',
    name: 'Hourly Benchmark Orchestrator',
    retries: 2
  },
  { cron: '0 * * * *' }, // Every hour
  async ({ event, step, logger }) => {
    const startTime = Date.now();

    // Step 1: Fetch active predictions
    const activePredictions = await step.run('fetch-active-predictions', async () => {
      logger.info('Fetching active predictions');

      return await db
        .select({
          prediction: predictions,
          summary: benchmarkSummary
        })
        .from(predictions)
        .leftJoin(benchmarkSummary, eq(predictions.id, benchmarkSummary.predictionId))
        .where(eq(benchmarkSummary.benchmarkStatus, 'ACTIVE'));
    });

    logger.info(`Found ${activePredictions.length} active predictions to benchmark`);

    // Step 2: Fan-out to process each prediction
    const batchId = `batch-${Date.now()}`;

    await step.run('fan-out-predictions', async () => {
      const events = activePredictions.map(({ prediction, summary }) => ({
        name: 'benchmark/process-prediction' as const,
        data: {
          batchId,
          predictionId: prediction.id,
          marketId: prediction.marketId,
          prediction: prediction.prediction,
          summary
        }
      }));

      // Send all events in parallel
      await inngest.send(events);

      return events.length;
    });

    // Step 3: Wait for completion signal (optional)
    // You could implement a completion tracker here

    const duration = Date.now() - startTime;
    logger.info(`Benchmark orchestration completed in ${duration}ms`);

    return {
      batchId,
      totalPredictions: activePredictions.length,
      durationMs: duration,
      timestamp: new Date().toISOString()
    };
  }
);
```

**Individual Prediction Processor:**

```typescript
// packages/web/inngest/functions/benchmark-prediction.ts
import { inngest } from '../client';
import {
  db,
  benchmarkSnapshots,
  benchmarkSummary
} from '@betteraiengine/core/db';
import { fetchMarketById } from '@betteraiengine/core/services/polymarket';
import { getYesOutcomePrice } from '@betteraiengine/core/utils/market-utils';

export const benchmarkPrediction = inngest.createFunction(
  {
    id: 'benchmark-prediction',
    name: 'Process Single Prediction',
    concurrency: {
      limit: 50, // Process 50 at a time
      key: 'event.data.batchId' // Per batch
    },
    retries: 3,
    rateLimit: {
      limit: 100,
      period: '1m',
      key: 'event.data.marketId' // Per market
    }
  },
  { event: 'benchmark/process-prediction' },
  async ({ event, step, logger }) => {
    const { predictionId, marketId, prediction, summary } = event.data;

    logger.info('Processing prediction', { predictionId, marketId });

    // Step 1: Fetch current market data
    const market = await step.run('fetch-market-data', async () => {
      try {
        return await fetchMarketById(marketId);
      } catch (error) {
        logger.error('Failed to fetch market', { marketId, error });
        throw error;
      }
    });

    // Step 2: Parse market prices
    const prices = await step.run('parse-market-prices', async () => {
      const yesPrice = getYesOutcomePrice(market.outcomePrices);

      if (!yesPrice.success) {
        throw new Error(`Failed to parse prices: ${yesPrice.error}`);
      }

      return {
        yesPrice: yesPrice.value,
        noPrice: 1 - yesPrice.value
      };
    });

    // Step 3: Calculate benchmark metrics
    const metrics = await step.run('calculate-metrics', async () => {
      const predictedProb = prediction.probability / 100; // Convert to 0-1
      const absDelta = Math.abs(prices.yesPrice - predictedProb);

      // Get previous snapshot for convergence rate
      const previousSnapshot = await db
        .select()
        .from(benchmarkSnapshots)
        .where(eq(benchmarkSnapshots.predictionId, predictionId))
        .orderBy(benchmarkSnapshots.snapshotAt, 'desc')
        .limit(1);

      let convergenceRate = 0;
      let movementDirection = 'STABLE';

      if (previousSnapshot.length > 0) {
        const prev = previousSnapshot[0];
        const deltaChange = prev.absDelta - absDelta;
        const hoursElapsed = 1; // Assuming hourly runs

        convergenceRate = deltaChange / hoursElapsed;

        if (Math.abs(deltaChange) < 0.005) {
          movementDirection = 'STABLE';
        } else if (deltaChange > 0) {
          movementDirection = 'CONVERGING';
        } else {
          movementDirection = 'DIVERGING';
        }
      }

      return {
        absDelta,
        convergenceRate,
        movementDirection,
        marketPriceYes: prices.yesPrice,
        marketPriceNo: prices.noPrice,
        marketClosed: market.closed || false
      };
    });

    // Step 4: Save snapshot to database
    await step.run('save-snapshot', async () => {
      const hoursSincePrediction = Math.floor(
        (Date.now() - new Date(prediction.createdAt).getTime()) / (1000 * 60 * 60)
      );

      await db.insert(benchmarkSnapshots).values({
        predictionId,
        marketId,
        snapshotAt: new Date(),
        marketPriceYes: metrics.marketPriceYes,
        marketPriceNo: metrics.marketPriceNo,
        marketClosed: metrics.marketClosed,
        marketResolved: false,
        predictedProbability: prediction.probability / 100,
        predictedConfidence: prediction.confidence,
        absDelta: metrics.absDelta,
        movementDirection: metrics.movementDirection,
        convergenceRate: metrics.convergenceRate,
        cumulativeConvergence: summary.initialDelta - metrics.absDelta,
        hoursSincePrediction
      });
    });

    // Step 5: Update benchmark summary
    await step.run('update-summary', async () => {
      await db
        .update(benchmarkSummary)
        .set({
          latestMarketPrice: metrics.marketPriceYes,
          latestDelta: metrics.absDelta,
          marketClosed: metrics.marketClosed,
          totalSnapshots: summary.totalSnapshots + 1,
          hoursTracked: summary.hoursTracked + 1,
          convergingSnapshots:
            metrics.movementDirection === 'CONVERGING'
              ? summary.convergingSnapshots + 1
              : summary.convergingSnapshots,
          divergingSnapshots:
            metrics.movementDirection === 'DIVERGING'
              ? summary.divergingSnapshots + 1
              : summary.divergingSnapshots,
          stableSnapshots:
            metrics.movementDirection === 'STABLE'
              ? summary.stableSnapshots + 1
              : summary.stableSnapshots,
          lastBenchmarkedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(benchmarkSummary.predictionId, predictionId));
    });

    logger.info('Prediction benchmark complete', {
      predictionId,
      direction: metrics.movementDirection,
      delta: metrics.absDelta
    });

    return {
      predictionId,
      success: true,
      metrics
    };
  }
);
```

### Manual Trigger Function

```typescript
// packages/web/inngest/functions/benchmark-manual.ts
export const benchmarkManual = inngest.createFunction(
  { id: 'benchmark-manual' },
  { event: 'benchmark/trigger-manual' },
  async ({ event, step }) => {
    const { predictionIds } = event.data;

    // Fan-out to process specific predictions
    const events = predictionIds.map(id => ({
      name: 'benchmark/process-prediction',
      data: {
        batchId: `manual-${Date.now()}`,
        predictionId: id
      }
    }));

    await step.sendEvent('trigger-manual-benchmarks', events);

    return { triggered: predictionIds.length };
  }
);
```

**CLI to trigger manual benchmark:**
```bash
# CLI command triggers this
pnpm dev run:benchmark --prediction-id abc-123
```

```typescript
// cli.ts
import { inngest } from './packages/web/inngest/client';

await inngest.send({
  name: 'benchmark/trigger-manual',
  data: { predictionIds: [predictionId] }
});
```

---

## Code Organization for Serverless

### Recommended Structure: Monorepo with Vercel

```
betteraiengine/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json                   # Turborepo config (optional)
│
├── packages/
│   ├── core/                    # @betteraiengine/core
│   │   ├── package.json
│   │   ├── services/
│   │   │   ├── benchmark-service.ts
│   │   │   ├── prediction-service.ts
│   │   │   ├── polymarket.ts
│   │   │   └── market-data-fetcher.ts
│   │   ├── db/
│   │   │   ├── schema.ts
│   │   │   └── index.ts
│   │   └── utils/
│   │       └── market-utils.ts
│   │
│   ├── web/                     # Next.js app (Vercel deployment)
│   │   ├── package.json
│   │   ├── next.config.js
│   │   ├── vercel.json
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── trpc/
│   │   │   │   │   └── [trpc]/route.ts
│   │   │   │   └── inngest/
│   │   │   │       └── route.ts
│   │   │   ├── benchmarks/
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── predictions/
│   │   │   └── layout.tsx
│   │   ├── inngest/
│   │   │   ├── client.ts
│   │   │   └── functions/
│   │   │       ├── benchmark-hourly.ts
│   │   │       ├── benchmark-prediction.ts
│   │   │       └── benchmark-manual.ts
│   │   ├── lib/
│   │   │   └── trpc.ts
│   │   └── components/
│   │
│   └── cli/                     # CLI (optional - runs locally)
│       ├── package.json
│       ├── cli.ts
│       └── commands/
│
├── drizzle/
│   └── migrations/
│
└── docs/
    └── design/
```

**Key Differences from Traditional Structure:**
- No separate `/apps/workers` - Inngest functions live in `/packages/web/inngest`
- No cron job container - Inngest handles scheduling
- CLI can trigger Inngest functions via events
- Everything deploys to Vercel as one Next.js app

---

## Client/Server API Architecture

### Option A: Integrated Next.js API (Recommended)

**Architecture**: Monorepo with Next.js App Router + tRPC

```
betteraiengine/
├── packages/
│   ├── core/                    # Shared core services
│   │   ├── services/            # Benchmark, prediction, polymarket services
│   │   ├── db/                  # Database schema and clients
│   │   └── utils/               # Shared utilities
│   │
│   ├── api/                     # API server (can be Next.js or standalone)
│   │   ├── routers/             # tRPC routers
│   │   │   ├── predictions.ts
│   │   │   ├── benchmarks.ts
│   │   │   └── markets.ts
│   │   └── server.ts
│   │
│   ├── web/                     # Next.js web app (future)
│   │   ├── app/                 # App router pages
│   │   │   ├── predictions/
│   │   │   ├── benchmarks/
│   │   │   └── api/             # Next.js API routes
│   │   └── components/
│   │
│   └── cli/                     # CLI tools (current experiments)
│       ├── cli.ts
│       └── commands/
│
├── services/                    # Batch jobs & workers
│   ├── benchmark-worker.ts      # Hourly benchmark job
│   └── ingest-worker.ts         # Market data ingestion
│
└── experiments/                 # Experimental prediction models
    ├── exp001/
    └── exp006/
```

**Benefits:**
- Single TypeScript codebase
- Type-safe API with tRPC
- Next.js App Router for modern web UI
- Built-in API routes
- Easy deployment (Vercel, Railway)
- Shared types between client/server

**API Endpoints (tRPC):**

```typescript
// packages/api/routers/benchmarks.ts
export const benchmarkRouter = router({
  // Get benchmark summary for a prediction
  getByPredictionId: publicProcedure
    .input(z.object({ predictionId: z.string().uuid() }))
    .query(async ({ input }) => {
      return await getBenchmarkSummary(input.predictionId);
    }),

  // Get benchmark snapshots (time series)
  getSnapshots: publicProcedure
    .input(z.object({
      predictionId: z.string().uuid(),
      limit: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return await getBenchmarkSnapshots(input.predictionId, input.limit);
    }),

  // Get experiment performance
  getExperimentReport: publicProcedure
    .input(z.object({ experimentId: z.string() }))
    .query(async ({ input }) => {
      return await generateExperimentReport(input.experimentId);
    }),

  // Get leaderboard
  getLeaderboard: publicProcedure
    .input(z.object({
      sortBy: z.enum(['convergence', 'confidence', 'recent']),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      return await getTopPredictions(input.sortBy, input.limit);
    }),
});
```

---

## Code Organization

### Monorepo with `/packages`

**Structure:**

```
betteraiengine/
├── package.json                 # Root package (workspaces)
├── pnpm-workspace.yaml          # PNPM workspace config
│
├── packages/
│   ├── core/                    # @betteraiengine/core
│   │   ├── package.json
│   │   ├── services/
│   │   │   ├── benchmark-service.ts
│   │   │   ├── prediction-service.ts
│   │   │   ├── polymarket.ts
│   │   │   └── trade-generator.ts
│   │   ├── db/
│   │   │   ├── schema.ts
│   │   │   └── index.ts
│   │   ├── utils/
│   │   └── types/
│   │
│   ├── api/                     # @betteraiengine/api
│   │   ├── package.json
│   │   ├── routers/
│   │   ├── middleware/
│   │   └── server.ts
│   │
│   ├── cli/                     # @betteraiengine/cli
│   │   ├── package.json
│   │   ├── cli.ts
│   │   └── commands/
│   │
│   └── web/                     # @betteraiengine/web (future)
│       ├── package.json
│       ├── app/
│       └── components/
│
├── apps/
│   ├── experiments/             # Experiments (isolated from core)
│   │   ├── exp001/
│   │   ├── exp006/
│   │   └── config.ts
│   │
│   └── workers/                 # Background jobs
│       ├── benchmark-worker.ts
│       └── ingest-worker.ts
│
├── drizzle/                     # Database migrations (root level)
│   └── migrations/
│
└── docs/
    └── design/
```

**Benefits:**
- Clear package boundaries
- Independent versioning per package
- Shared code via `@betteraiengine/core`
- Experiments isolated in `/apps`
- Easy to extract packages later
- Better IDE support and imports

**Package Dependencies:**

```json
// packages/cli/package.json
{
  "dependencies": {
    "@betteraiengine/core": "workspace:*"
  }
}

// packages/api/package.json
{
  "dependencies": {
    "@betteraiengine/core": "workspace:*"
  }
}

// packages/web/package.json
{
  "dependencies": {
    "@betteraiengine/core": "workspace:*",
    "@betteraiengine/api": "workspace:*"
  }
}

---

## Metrics & Reporting

### Key Performance Indicators (KPIs)

1. **Directional Accuracy**
   - % of predictions where market moves toward AI prediction
   - Target: >60% for successful model

2. **Convergence Rate**
   - Average hourly movement toward prediction
   - Faster convergence = stronger signal

3. **Confidence Calibration**
   - Correlation between AI confidence and convergence
   - Well-calibrated model: high confidence → high convergence

4. **Time to Convergence**
   - How long before market reaches predicted price
   - Useful for trade timing strategies

### Dashboard Views (Future Web Interface)

#### 1. Prediction Performance View

```
┌─────────────────────────────────────────────────────────┐
│  Prediction: Will Team X win championship?              │
│  Predicted: YES 75% (Confidence: 85%)                   │
│  Created: 2025-11-10 10:00                              │
├─────────────────────────────────────────────────────────┤
│  Initial Market Price: 60%                              │
│  Current Market Price: 68% ↑                            │
│  Delta: 7% (converging)                                 │
│  Convergence: 53% of predicted edge                     │
├─────────────────────────────────────────────────────────┤
│  📈 Price Movement Chart (24h)                          │
│  [Line chart showing market price vs prediction]        │
│                                                          │
│  🎯 Convergence Metrics                                 │
│  - Avg Rate: +1.2% per hour                             │
│  - Total Hours: 8                                       │
│  - Status: CONVERGING ✓                                 │
└─────────────────────────────────────────────────────────┘
```

#### 2. Experiment Leaderboard

```
┌──────────────────────────────────────────────────────────┐
│  Experiment 006 Performance                              │
├──────────────────────────────────────────────────────────┤
│  Total Predictions: 47                                   │
│  Directional Accuracy: 68% ✓                             │
│  Avg Convergence Rate: +0.8% per hour                    │
│  Confidence Calibration: 0.82                            │
├──────────────────────────────────────────────────────────┤
│  Top Performers                                          │
│  1. Market A: +12% convergence (85% confidence)          │
│  2. Market B: +9% convergence (78% confidence)           │
│  3. Market C: +7% convergence (82% confidence)           │
└──────────────────────────────────────────────────────────┘
```

#### 3. Real-Time Monitoring Dashboard

```
┌──────────────────────────────────────────────────────────┐
│  Live Benchmark Monitor                                  │
├──────────────────────────────────────────────────────────┤
│  Active Predictions: 156                                 │
│  Markets Tracked: 94                                     │
│  Last Updated: 2 minutes ago                             │
├──────────────────────────────────────────────────────────┤
│  📊 Movement Distribution (Last Hour)                    │
│  Converging: 62 (66%)  ████████████░░░░                  │
│  Diverging:  24 (26%)  █████░░░░░░░░░░░                  │
│  Stable:      8 (8%)   ██░░░░░░░░░░░░░░                  │
├──────────────────────────────────────────────────────────┤
│  🔥 Trending Now                                         │
│  - Market X: +5% convergence in 1 hour                   │
│  - Market Y: -3% divergence (watch)                      │
└──────────────────────────────────────────────────────────┘
```

---

## Implementation Roadmap

### Phase 1: Database & Core Services (Week 1)

**Tasks:**
- [ ] Create benchmark database schema and migrations
- [ ] Set up Neon serverless Postgres
- [ ] Implement `BenchmarkService` core logic in `/packages/core`
- [ ] Implement `MarketDataFetcher` with batch support
- [ ] Update Drizzle schema with new tables
- [ ] Unit tests for benchmark calculations

**Deliverables:**
- Database tables: `benchmark_snapshots`, `benchmark_summary`
- Services: `benchmark-service.ts`, `market-data-fetcher.ts`
- Neon database with migrations applied

### Phase 2: Next.js + Vercel Setup (Week 2)

**Tasks:**
- [ ] Create monorepo structure with `/packages/core` and `/packages/web`
- [ ] Set up Next.js 14+ with App Router
- [ ] Configure Vercel project and environment variables
- [ ] Set up tRPC with basic benchmark endpoints
- [ ] Deploy to Vercel (initial deployment)

**Deliverables:**
- Next.js app deployed to Vercel
- tRPC API routes: `/api/trpc/benchmarks.*`
- Vercel environment variables configured

### Phase 3: Inngest Integration (Week 3)

**Tasks:**
- [ ] Install and configure Inngest SDK
- [ ] Create Inngest API route: `/app/api/inngest/route.ts`
- [ ] Implement hourly benchmark orchestrator function
- [ ] Implement individual prediction processor function
- [ ] Set up Inngest cron schedule
- [ ] Test end-to-end batch processing

**Deliverables:**
- Inngest functions: `benchmark-hourly.ts`, `benchmark-prediction.ts`
- Hourly automation via Inngest cron
- Inngest dashboard showing successful runs

### Phase 4: Analytics & CLI (Week 4)

**Tasks:**
- [ ] Implement `BenchmarkAnalytics` service
- [ ] Add tRPC endpoints for analytics queries
- [ ] Create CLI package to trigger manual benchmarks
- [ ] Add experiment performance reports
- [ ] Generate initial reports for existing predictions

**Deliverables:**
- Service: `benchmark-analytics.ts`
- CLI: `pnpm dev run:benchmark --prediction-id <id>`
- tRPC analytics endpoints

### Phase 5: Web Dashboard MVP (Week 5-6)

**Tasks:**
- [ ] Build prediction detail page with time-series chart
- [ ] Build experiment leaderboard
- [ ] Add real-time updates (React Query polling)
- [ ] Add filtering and sorting
- [ ] Performance optimization (ISR, caching)

**Deliverables:**
- Web dashboard at `betteraiengine.vercel.app`
- Public prediction tracking
- Experiment performance reports
- Responsive mobile design

### Phase 6: Monitoring & Optimization (Week 7)

**Tasks:**
- [ ] Set up Vercel Analytics
- [ ] Configure Inngest alerts for failures
- [ ] Add error tracking (Sentry)
- [ ] Optimize database queries
- [ ] Add database indexes for performance
- [ ] Load testing

**Deliverables:**
- Monitoring dashboards
- Performance metrics baseline
- Optimization documentation

---

## Future Enhancements

### Advanced Features

1. **Multi-Timeframe Analysis**
   - Track benchmarks at 1h, 6h, 24h, 7d intervals
   - Identify optimal holding periods

2. **Prediction Ensembles**
   - Combine multiple model predictions
   - Weight by historical performance

3. **Automated Trading Signals**
   - Generate trade alerts when convergence accelerates
   - Risk-adjusted position sizing

4. **Market Sentiment Integration**
   - Twitter/social sentiment tracking
   - News event correlation

5. **A/B Testing Framework**
   - Compare different prompting strategies
   - Automated experiment optimization

6. **Webhooks & Notifications**
   - Slack/Discord alerts for high-conviction predictions
   - Email digests for portfolio performance

7. **Historical Backtesting**
   - Replay past markets with predictions
   - Validate model performance retrospectively

8. **Public API**
   - External developer access
   - Rate limiting and API keys
   - Monetization potential

9. **Experiments Framework Evolution**

   **Recommendation**: Keep the current experiments framework and evolve it for serverless architecture. The benchmark service makes experiments measurable and valuable for continuous improvement.

   **Evolution 1 - Move to Monorepo:**
   ```
   packages/
   └── core/
       └── experiments/          # Move experiments here
           ├── config.ts
           ├── types.ts
           ├── base/             # Shared utilities
           │   └── base-experiment.ts
           ├── exp006/
           └── exp007/
   ```

   **Evolution 2 - Make Experiments API-First:**
   ```typescript
   // Add tRPC endpoints for experiments
   export const experimentRouter = router({
     // List available experiments
     list: publicProcedure.query(() => getAllExperimentMetadata()),

     // Run experiment via API
     run: publicProcedure
       .input(z.object({
         experimentId: z.string(),
         marketSlug: z.string(),
       }))
       .mutation(async ({ input }) => {
         const market = await fetchMarketBySlug(input.marketSlug);
         return await runExperiment(input.experimentId, market);
       }),

     // Get experiment performance
     getPerformance: publicProcedure
       .input(z.object({ experimentId: z.string() }))
       .query(({ input }) => getExperimentPerformance(input.experimentId)),
   });
   ```

   **Evolution 3 - Smart Experiment Selection:**

   Select best experiment per market category based on historical benchmark performance:
   ```typescript
   // Auto-select best performing experiment for each category
   const selector = new ExperimentSelector();
   const experimentId = await selector.selectExperiment(market);
   // Returns: '007' for Sports, '006' for Politics, etc.
   ```

   **Future Vision (6 months):**
   ```
   📊 Experiment Performance Dashboard

   Exp007 "Multi-Model Ensemble"
   ├─ Sports: 78% accuracy ⭐ BEST
   ├─ Politics: 71% accuracy
   ├─ Crypto: 69% accuracy
   └─ Overall: 73% accuracy

   Exp006 "Parallel Research"
   ├─ Sports: 72% accuracy
   ├─ Politics: 75% accuracy ⭐ BEST
   ├─ Crypto: 68% accuracy
   └─ Overall: 72% accuracy

   → Smart Router: Uses Exp007 for Sports, Exp006 for Politics
   → A/B Testing: 80% production, 20% experimental
   → Auto-deprecate underperformers after 100 predictions
   ```

   **Benefits:**
   - Measure which experiments work best per category
   - A/B test new approaches safely
   - Continuously improve without breaking production
   - Data-driven experiment promotion/deprecation
   - Maintain agility while scaling

---

## Appendix

### Sample CLI Commands

```bash
# Run hourly benchmark manually
pnpm dev run:benchmark

# Run benchmark for specific prediction
pnpm dev run:benchmark --prediction-id abc-123-def

# Generate experiment report
pnpm dev benchmark:report --experiment-id 006

# Export benchmark data
pnpm dev benchmark:export --format csv --output ./reports/

# View live benchmark status
pnpm dev benchmark:status

# Pause benchmarking for a prediction
pnpm dev benchmark:pause --prediction-id abc-123

# Resume benchmarking
pnpm dev benchmark:resume --prediction-id abc-123
```

### Sample API Queries (tRPC)

```typescript
// Get benchmark summary
const summary = await trpc.benchmarks.getByPredictionId.query({
  predictionId: 'abc-123-def',
});

// Get time series data
const snapshots = await trpc.benchmarks.getSnapshots.query({
  predictionId: 'abc-123-def',
  limit: 168, // 7 days of hourly data
});

// Get experiment leaderboard
const leaderboard = await trpc.benchmarks.getLeaderboard.query({
  sortBy: 'convergence',
  limit: 50,
});

// Get experiment report
const report = await trpc.benchmarks.getExperimentReport.query({
  experimentId: '006',
});
```

### Database Query Examples

```sql
-- Get top converging predictions in last 24 hours
SELECT
  p.id,
  p.market_id,
  bs.cumulative_convergence,
  bs.convergence_percentage,
  bs.hours_tracked
FROM benchmark_summary bs
JOIN predictions p ON p.id = bs.prediction_id
WHERE bs.last_benchmarked_at > NOW() - INTERVAL '24 hours'
  AND bs.benchmark_status = 'ACTIVE'
ORDER BY bs.cumulative_convergence DESC
LIMIT 10;

-- Get hourly convergence rate for a prediction
SELECT
  snapshot_at,
  abs_delta,
  movement_direction,
  convergence_rate,
  cumulative_convergence
FROM benchmark_snapshots
WHERE prediction_id = 'abc-123-def'
ORDER BY snapshot_at ASC;

-- Experiment performance summary
SELECT
  experiment_id,
  COUNT(*) as total_predictions,
  AVG(convergence_percentage) as avg_convergence_pct,
  SUM(CASE WHEN cumulative_convergence > 0 THEN 1 ELSE 0 END) as converging_count,
  AVG(predicted_confidence) as avg_confidence
FROM benchmark_summary
WHERE benchmark_status = 'ACTIVE'
GROUP BY experiment_id
ORDER BY avg_convergence_pct DESC;
```

---

## Conclusion

The Hourly Prediction Benchmark Service provides a robust foundation for measuring AI prediction performance in real-time. By focusing on **directional movement** rather than final outcomes, we can rapidly iterate on prediction models and identify winning strategies.

### Why Serverless Architecture Wins

The **Vercel + Inngest** serverless architecture provides massive advantages:

| Benefit | Impact |
|---------|--------|
| **Zero Infrastructure** | No servers to manage, patch, or scale |
| **Instant Deploys** | Git push → Production in <60 seconds |
| **Auto-Scaling** | Handles 10 or 10,000 predictions seamlessly |
| **Cost Efficiency** | Pay only for execution time (~$5-50/month vs $50-500) |
| **Built-in Observability** | Inngest dashboard shows every execution |
| **Developer Experience** | Focus on code, not DevOps |

### Estimated Costs (Monthly)

**Baseline Usage:**
- 100 active predictions
- Hourly benchmarking (720 runs/month)
- ~5-10 web dashboard visitors/day

| Service | Free Tier | Expected Cost |
|---------|-----------|---------------|
| **Vercel Hobby** | Unlimited bandwidth | $0 |
| **Vercel Pro** (if needed) | More generous limits | $20/month |
| **Neon Postgres** | 0.5GB storage, autosuspend | $0-10/month |
| **Inngest** | 50k free steps/month | $0 (within free tier) |
| **Total** | | **$0-30/month** |

**At Scale (1000+ predictions):**
- Inngest: ~$25-50/month
- Neon: ~$20-40/month
- Vercel Pro: $20/month
- **Total: $65-110/month**

Compare this to traditional infrastructure: $200-500/month for equivalent performance.

### Next Steps

1. **Review and approve this design**
2. **Begin Phase 1**: Database schema and core services
3. **Set up infrastructure**:
   - Create Vercel project
   - Set up Neon database
   - Create Inngest account
4. **Implement Phase 2-3**: Next.js + Inngest integration
5. **Launch MVP**: Deploy hourly benchmarking to production

---

**Document Status:** Ready for Review (Serverless Edition)
**Stakeholders:** Engineering Team, Product
**Target Implementation:** 6-7 weeks
**Estimated Monthly Cost:** $0-30 (MVP), $65-110 (at scale)

# Hourly Prediction Benchmark Service Design

**Version:** 1.0.0
**Date:** 2025-11-10
**Status:** Draft

---

## Table of Contents

1. [Overview](#overview)
2. [Requirements](#requirements)
3. [Architecture](#architecture)
4. [Benchmark Methodology](#benchmark-methodology)
5. [Database Schema](#database-schema)
6. [Service Components](#service-components)
7. [Client/Server API Architecture](#clientserver-api-architecture)
8. [Code Organization Options](#code-organization-options)
9. [Batch Job Infrastructure](#batch-job-infrastructure)
10. [Metrics & Reporting](#metrics--reporting)
11. [Implementation Roadmap](#implementation-roadmap)
12. [Future Enhancements](#future-enhancements)

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

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Hourly Benchmark Service                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │    Cron Scheduler (Hourly Trigger)      │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │      Batch Job Orchestrator             │
        │  - Fetch active predictions             │
        │  - Filter open markets                  │
        │  - Batch price fetching                 │
        │  - Calculate benchmarks                 │
        │  - Store snapshots                      │
        └─────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Polymarket  │    │   Postgres   │    │  API Server  │
│  Gamma API   │    │   Database   │    │  (Future)    │
└──────────────┘    └──────────────┘    └──────────────┘
```

### Component Interactions

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ predictions  │────▶│  benchmark   │────▶│  benchmark   │
│    table     │     │   service    │     │  snapshots   │
└──────────────┘     └──────────────┘     └──────────────┘
                             │
                             ▼
                     ┌──────────────┐
                     │  Polymarket  │
                     │  API Client  │
                     └──────────────┘
```

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

### Option B: Standalone Express API + Separate Next.js App

**Architecture**: Microservices with separate API server

```
betteraiengine/                  # Core prediction engine
├── services/
├── db/
├── experiments/
└── batch-jobs/

betteraiengine-api/              # Standalone API server
├── src/
│   ├── routes/
│   │   ├── predictions.ts
│   │   ├── benchmarks.ts
│   │   └── markets.ts
│   ├── middleware/
│   └── server.ts
└── package.json

betteraiengine-web/              # Next.js web app
├── app/
├── components/
└── package.json
```

**Benefits:**
- Clear separation of concerns
- Independent scaling (API vs Web)
- Different deployment strategies
- REST API can serve multiple clients

**API Endpoints (REST):**

```typescript
// GET /api/v1/benchmarks/:predictionId
// GET /api/v1/benchmarks/:predictionId/snapshots
// GET /api/v1/benchmarks/experiments/:experimentId
// GET /api/v1/benchmarks/leaderboard
// GET /api/v1/predictions/:id
// GET /api/v1/predictions
// POST /api/v1/predictions/run
```

### Recommended Architecture: **Option A (Integrated Next.js)**

**Rationale:**
1. **Type Safety**: tRPC provides end-to-end type safety
2. **Developer Experience**: Single codebase, shared types
3. **Faster Iteration**: No API versioning overhead initially
4. **Modern Stack**: App Router, Server Components, streaming
5. **Deployment**: Simpler deployment story (Vercel)
6. **Future-Proof**: Can extract standalone API later if needed

---

## Code Organization Options

### Option 1: Monorepo with `/packages` (Recommended)

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
```

### Option 2: Feature-Based `/modules` Structure

**Structure:**

```
betteraiengine/
├── package.json
├── cli.ts
│
├── modules/
│   ├── predictions/
│   │   ├── services/
│   │   │   ├── prediction.ts
│   │   │   ├── prediction-storage.ts
│   │   │   └── prediction-publisher.ts
│   │   ├── schemas/
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── benchmarks/              # NEW: Benchmark module
│   │   ├── services/
│   │   │   ├── benchmark-service.ts
│   │   │   ├── benchmark-batch-job.ts
│   │   │   └── benchmark-analytics.ts
│   │   ├── schemas/
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── markets/
│   │   ├── services/
│   │   │   ├── polymarket.ts
│   │   │   ├── market-data-fetcher.ts
│   │   │   └── polymarket-storage.ts
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── trades/
│   │   ├── services/
│   │   │   ├── trade-generator.ts
│   │   │   └── trade-strategies.ts
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   └── research/
│       ├── services/
│       │   ├── exa-research.ts
│       │   └── grok-search.ts
│       └── types.ts
│
├── experiments/                 # Moved to subfolder
│   ├── archive/                 # Old experiments
│   │   ├── exp001/
│   │   └── exp005/
│   ├── active/                  # Current experiments
│   │   └── exp006/
│   └── config.ts
│
├── api/                         # API server (future)
│   ├── routes/
│   ├── middleware/
│   └── server.ts
│
├── web/                         # Next.js app (future)
│   ├── app/
│   └── components/
│
├── db/
│   ├── schema.ts
│   └── index.ts
│
├── config/
├── utils/
└── docs/
```

**Benefits:**
- Feature-based organization
- Related code grouped together
- Simpler import paths
- Good for medium-sized projects
- Clear module boundaries

### Recommendation: **Option 1 (Monorepo with `/packages`)**

**Why:**
1. **Scalability**: Easier to manage as project grows
2. **Code Reuse**: Core package can be shared across API, CLI, Web
3. **Team Collaboration**: Clear ownership boundaries
4. **Future-Proof**: Easy to extract services or publish packages
5. **Modern Best Practice**: Aligns with industry standards (Vercel, Turborepo)
6. **Tooling**: Better support from build tools (Turborepo, nx)

---

## Batch Job Infrastructure

### Hourly Job Execution

**Option 1: Node Cron (Simple)**

```typescript
// services/benchmark-worker.ts
import cron from 'node-cron';
import { BenchmarkBatchJob } from './benchmark-batch-job.js';

// Run every hour at minute 0
cron.schedule('0 * * * *', async () => {
  logger.info('Starting hourly benchmark job');

  const job = new BenchmarkBatchJob();
  const result = await job.run();

  logger.info({ result }, 'Hourly benchmark job completed');
});
```

**Option 2: BullMQ (Production-Ready)**

```typescript
// services/benchmark-worker.ts
import { Queue, Worker } from 'bullmq';
import { BenchmarkBatchJob } from './benchmark-batch-job.js';

const benchmarkQueue = new Queue('benchmark-jobs', {
  connection: redis,
});

// Add hourly job
await benchmarkQueue.add(
  'hourly-benchmark',
  {},
  {
    repeat: {
      pattern: '0 * * * *', // Every hour
    },
  }
);

// Worker
const worker = new Worker(
  'benchmark-jobs',
  async (job) => {
    const benchmarkJob = new BenchmarkBatchJob();
    return await benchmarkJob.run();
  },
  { connection: redis }
);
```

**Recommendation: Start with node-cron, migrate to BullMQ for production**

### CLI Command for Manual Execution

```bash
# Run benchmark manually
pnpm dev run:benchmark

# Run benchmark for specific prediction
pnpm dev run:benchmark --prediction-id <uuid>

# Run benchmark for specific experiment
pnpm dev run:benchmark --experiment-id 006

# Dry run (no database writes)
pnpm dev run:benchmark --dry-run
```

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

### Phase 1: Core Benchmark Service (Week 1-2)

**Tasks:**
- [ ] Create benchmark database schema and migrations
- [ ] Implement `BenchmarkService` core logic
- [ ] Implement `MarketDataFetcher` with batch support
- [ ] Add CLI command: `run:benchmark`
- [ ] Unit tests for benchmark calculations

**Deliverables:**
- Database tables: `benchmark_snapshots`, `benchmark_summary`
- Services: `benchmark-service.ts`, `market-data-fetcher.ts`
- CLI: `pnpm dev run:benchmark`

### Phase 2: Batch Job Infrastructure (Week 3)

**Tasks:**
- [ ] Implement `BenchmarkBatchJob` orchestrator
- [ ] Add hourly cron scheduler
- [ ] Implement retry logic and error handling
- [ ] Add structured logging
- [ ] Integration tests

**Deliverables:**
- Worker: `benchmark-worker.ts`
- Hourly automation running in background
- Error monitoring and alerts

### Phase 3: Analytics & Reporting (Week 4)

**Tasks:**
- [ ] Implement `BenchmarkAnalytics` service
- [ ] Add experiment performance reports
- [ ] Add CLI commands for analytics
- [ ] Generate initial reports for existing predictions

**Deliverables:**
- Service: `benchmark-analytics.ts`
- CLI: `pnpm dev benchmark:report --experiment-id 006`
- Performance dashboards (CLI output)

### Phase 4: API Foundation (Week 5-6)

**Tasks:**
- [ ] Set up Next.js monorepo structure
- [ ] Implement tRPC routers for benchmarks
- [ ] Create API endpoints for predictions
- [ ] Add authentication/authorization
- [ ] API documentation

**Deliverables:**
- Next.js app in `/packages/web`
- tRPC API in `/packages/api`
- API routes: `/api/trpc/benchmarks.*`

### Phase 5: Web Dashboard MVP (Week 7-8)

**Tasks:**
- [ ] Build prediction detail page
- [ ] Build experiment leaderboard
- [ ] Add time-series charts (Recharts)
- [ ] Add real-time updates (polling or SSE)
- [ ] Deploy to production

**Deliverables:**
- Web dashboard at `betteraiengine.app`
- Public prediction tracking
- Experiment performance reports

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

The proposed architecture balances immediate needs (batch processing, CLI access) with future growth (API, web dashboard) while maintaining clean separation of concerns through a monorepo structure.

**Next Steps:**
1. Review and approve this design
2. Begin Phase 1 implementation (Core Benchmark Service)
3. Set up database migrations
4. Implement first hourly batch job
5. Gather initial performance data

---

**Document Status:** Ready for Review
**Stakeholders:** Engineering Team, Product
**Review Deadline:** 2025-11-15

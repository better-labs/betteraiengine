# Hourly Prediction Benchmark Service Design

**Version:** 3.0.0
**Date:** 2025-11-18
**Status:** Implementation Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Requirements](#requirements)
3. [Architecture](#architecture)
4. [Technology Stack](#technology-stack)
5. [Benchmark Methodology](#benchmark-methodology)
6. [Database Schema](#database-schema)
7. [Implementation Roadmap](#implementation-roadmap)
8. [Metrics & Reporting](#metrics--reporting)
9. [Future Enhancements](#future-enhancements)

---

## Overview

The Hourly Prediction Benchmark Service continuously evaluates AI prediction performance by tracking market movement toward predicted outcomes. Measures **directional accuracy** and **convergence velocity** rather than waiting for market closure.

### Key Objectives

- **Continuous Monitoring**: Hourly price checks for all active predictions
- **Directional Accuracy**: Track if markets move toward AI predictions over time
- **Performance Metrics**: Convergence rate, accuracy, confidence calibration
- **API Exposure**: Enable web dashboard and external integrations
- **Scalability**: Support growing prediction volume without performance degradation

---

## Requirements

### Functional Requirements

1. **Hourly Price Checks**: Automated batch job runs every hour
2. **Benchmark Recording**: Store timestamped snapshots of prediction vs market delta
3. **Movement Detection**: Determine if market is converging/diverging/stable
4. **Active Markets Only**: Only benchmark predictions for markets still open for betting
5. **Historical Tracking**: Maintain complete time-series data
6. **API Access**: Expose benchmark data via tRPC endpoints

### Non-Functional Requirements

1. **Performance**: Process 1000+ predictions per hour within 5-minute window
2. **Reliability**: Automatic retries with exponential backoff
3. **Observability**: Structured logging and error tracking
4. **Extensibility**: Support multiple benchmark metrics and strategies
5. **Cost Efficiency**: Serverless pay-per-use model

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────┐
│              Vercel Edge Network                 │
│        (Global CDN + Edge Functions)            │
└─────────────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
  ┌─────────┐  ┌──────────┐  ┌──────────┐
  │ Next.js │  │  tRPC    │  │ Inngest  │
  │   App   │  │   API    │  │  Events  │
  └─────────┘  └──────────┘  └──────────┘
                      │             │
        ┌─────────────┴─────────────┤
        │                           │
        ▼                           ▼
  ┌──────────┐              ┌─────────────┐
  │   Neon   │              │ Polymarket  │
  │ Postgres │              │ Gamma API   │
  └──────────┘              └─────────────┘
```

### Hourly Benchmark Flow

```
1. Inngest Cron (Every Hour)
   │
   ▼
2. Orchestrator Function
   ├─▶ Fetch active predictions from DB
   ├─▶ Fan-out to worker functions (parallel)
   │
   ▼
3. Worker Functions (for each prediction)
   ├─▶ Call Vercel API to fetch market price
   ├─▶ Calculate metrics
   └─▶ Save snapshot to DB
   │
   ▼
4. Aggregate & Update summary table
```

**Key Benefit**: Inngest orchestrates batch jobs → Calls serverless API functions on Vercel → Vercel functions handle individual tasks → Results stored in Neon DB

---

## Technology Stack

### Core Technologies

**Vercel**: Serverless hosting for Next.js. Zero-config deployment, auto-scaling, global CDN. Serverless functions execute on-demand.

**Inngest**: Batch job orchestration platform. Handles cron scheduling, automatic retries, fan-out/fan-in patterns, rate limiting. Visual debugging dashboard.

**Neon**: Serverless Postgres with connection pooling, database branching, auto-pause when inactive.

**tRPC**: Type-safe API layer. End-to-end TypeScript types from database to frontend.

### Architecture Pattern

- **Monorepo**: Single repository with `/packages` structure
- **Shared Core**: Common services in `@betteraiengine/core`
- **Web App**: Next.js in `packages/web`, deploys to Vercel
- **Batch Jobs**: Inngest functions in `packages/web/inngest`
- **CLI**: Optional local CLI in `packages/cli`

---

## Benchmark Methodology

### Core Concept: Directional Movement Tracking

Track convergence toward AI predictions instead of waiting for market resolution.

### Metrics Tracked

1. **Absolute Delta**: `|current_market_price - predicted_probability|`
2. **Directional Movement**: CONVERGING, DIVERGING, or STABLE
3. **Convergence Velocity**: Rate of change per hour
4. **Cumulative Movement**: Total movement since prediction
5. **Confidence Calibration**: How well AI confidence matches actual convergence

### Example

```
Initial State (T0):
  AI Prediction: YES at 75% (confidence: 85%)
  Market Price: 60%
  Initial Delta: 15%

Hour 1 (T1):
  Market Price: 63%
  Current Delta: 12%
  Movement: CONVERGING (delta decreased 3%)
  Convergence Rate: +3% per hour

Hour 24 (T24):
  Market Price: 73%
  Current Delta: 2%
  Cumulative Convergence: +13% (86% of predicted edge)
  Status: Strong directional accuracy ✓
```

---

## Database Schema

### New Tables

#### `benchmark_snapshots`

Hourly snapshots of prediction performance.

```sql
CREATE TABLE benchmark_snapshots (
  id SERIAL PRIMARY KEY,
  prediction_id UUID NOT NULL REFERENCES predictions(id),
  market_id TEXT NOT NULL REFERENCES markets(market_id),
  snapshot_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Market state
  market_price_yes REAL NOT NULL,
  market_price_no REAL NOT NULL,
  market_closed BOOLEAN NOT NULL DEFAULT false,

  -- Prediction state
  predicted_probability REAL NOT NULL,
  predicted_confidence REAL,

  -- Metrics
  abs_delta REAL NOT NULL,
  movement_direction TEXT,
  convergence_rate REAL,
  cumulative_convergence REAL,
  hours_since_prediction INTEGER,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_benchmark_snapshots_prediction_id ON benchmark_snapshots(prediction_id);
CREATE INDEX idx_benchmark_snapshots_snapshot_at ON benchmark_snapshots(snapshot_at);
```

#### `benchmark_summary`

Aggregated performance metrics per prediction.

```sql
CREATE TABLE benchmark_summary (
  id SERIAL PRIMARY KEY,
  prediction_id UUID NOT NULL UNIQUE REFERENCES predictions(id),
  market_id TEXT NOT NULL REFERENCES markets(market_id),
  experiment_id TEXT NOT NULL,

  -- Initial state
  predicted_at TIMESTAMP NOT NULL,
  predicted_probability REAL NOT NULL,
  predicted_confidence REAL,
  initial_market_price REAL NOT NULL,
  initial_delta REAL NOT NULL,

  -- Current state
  latest_market_price REAL,
  latest_delta REAL,
  market_closed BOOLEAN NOT NULL DEFAULT false,

  -- Performance metrics
  total_snapshots INTEGER NOT NULL DEFAULT 0,
  hours_tracked INTEGER NOT NULL DEFAULT 0,
  converging_snapshots INTEGER NOT NULL DEFAULT 0,
  diverging_snapshots INTEGER NOT NULL DEFAULT 0,
  stable_snapshots INTEGER NOT NULL DEFAULT 0,
  avg_convergence_rate REAL,
  cumulative_convergence REAL,
  convergence_percentage REAL,

  -- Status
  benchmark_status TEXT NOT NULL DEFAULT 'ACTIVE',
  last_benchmarked_at TIMESTAMP,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_benchmark_summary_prediction_id ON benchmark_summary(prediction_id);
CREATE INDEX idx_benchmark_summary_experiment_id ON benchmark_summary(experiment_id);
```

---

## Implementation Roadmap

### Phase 1: Database & Core Services (Week 1)

**Prerequisites:**
- [ ] Neon account created at https://neon.tech
- [ ] DATABASE_URL available
- [ ] pnpm workspace configured

**File Structure Created:**
```
packages/core/
├── db/
│   ├── schema.ts          # MODIFY: Add benchmark tables
│   └── index.ts           # EXPORT: db, tables
├── services/
│   ├── benchmark-service.ts      # CREATE
│   └── market-data-fetcher.ts    # CREATE
└── utils/
    └── market-utils.ts            # MODIFY: Add helpers
```

**Database Schema (schema.ts)**

```typescript
// Pseudo code
export const benchmarkSnapshots = pgTable('benchmark_snapshots', {
  id: serial('id').primaryKey(),
  predictionId: uuid('prediction_id').references(() => predictions.id),
  marketId: text('market_id').references(() => markets.marketId),
  // ... all fields from SQL schema above
});

export const benchmarkSummary = pgTable('benchmark_summary', {
  id: serial('id').primaryKey(),
  predictionId: uuid('prediction_id').unique().references(() => predictions.id),
  // ... all fields from SQL schema above
});
```

**BenchmarkService (benchmark-service.ts)**

```typescript
// Pseudo code - high level only
class BenchmarkService {
  // Fetch predictions that need benchmarking
  async getActivePredictions() {
    // Query DB for predictions with status='ACTIVE'
    // Join with benchmark_summary table
    // Return array of predictions
  }

  // Calculate metrics for a prediction
  async calculateBenchmarkMetrics(prediction, currentPrice, previousSnapshot) {
    // Calculate abs_delta
    // Determine movement_direction (CONVERGING/DIVERGING/STABLE)
    // Calculate convergence_rate
    // Calculate cumulative_convergence
    // Return metrics object
  }

  // Save snapshot to database
  async saveBenchmarkSnapshot(snapshot) {
    // Insert into benchmark_snapshots table
  }

  // Update summary with latest metrics
  async updateBenchmarkSummary(predictionId, metrics) {
    // Update benchmark_summary table
    // Increment counters
    // Update averages
  }
}
```

**MarketDataFetcher (market-data-fetcher.ts)**

```typescript
// Pseudo code
class MarketDataFetcher {
  // Fetch current market price
  async fetchCurrentMarketPrice(marketId) {
    // Call Polymarket Gamma API
    // Parse outcomePrices
    // Return YES price as decimal
  }

  // Batch fetch multiple markets
  async fetchMarketPricesBatch(marketIds) {
    // Fetch multiple markets in parallel
    // Return Map<marketId, priceData>
  }
}
```

**Verification Steps:**
```bash
# Run migrations
pnpm drizzle-kit push:pg

# Verify tables created
psql $DATABASE_URL -c "\dt benchmark_*"

# Run unit tests
pnpm test packages/core/services/*.test.ts
```

**Success Criteria:**
- [ ] benchmark_snapshots table created
- [ ] benchmark_summary table created
- [ ] BenchmarkService exports all methods
- [ ] MarketDataFetcher can fetch prices
- [ ] Unit tests pass

**Exports for Next Phase:**
```typescript
// packages/core/index.ts
export { BenchmarkService } from './services/benchmark-service';
export { MarketDataFetcher } from './services/market-data-fetcher';
export { db, benchmarkSnapshots, benchmarkSummary } from './db';
```

---

### Phase 2: Next.js + Vercel Setup (Week 2)

**Prerequisites:**
- [ ] Phase 1 complete
- [ ] Vercel account created
- [ ] Vercel CLI installed (`pnpm add -g vercel`)

**File Structure Created:**
```
packages/web/
├── package.json              # CREATE
├── next.config.js            # CREATE
├── vercel.json               # CREATE
├── app/
│   ├── layout.tsx            # CREATE
│   ├── page.tsx              # CREATE
│   └── api/
│       └── trpc/
│           └── [trpc]/route.ts    # CREATE
└── lib/
    └── trpc.ts               # CREATE: tRPC setup
```

**Monorepo Setup (pnpm-workspace.yaml)**

```yaml
packages:
  - 'packages/*'
```

**Root package.json**

```json
{
  "name": "betteraiengine-monorepo",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter web dev",
    "build": "pnpm --filter core build && pnpm --filter web build"
  }
}
```

**Next.js Config (next.config.js)**

```javascript
// Pseudo code
module.exports = {
  transpilePackages: ['@betteraiengine/core'],
  // Other Next.js config
};
```

**Vercel Config (vercel.json)**

```json
{
  "buildCommand": "pnpm build",
  "framework": "nextjs",
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 300
    }
  }
}
```

**tRPC Router (app/api/trpc/[trpc]/route.ts)**

```typescript
// Pseudo code
// Create tRPC router
const appRouter = router({
  benchmarks: benchmarkRouter,
  predictions: predictionRouter,
});

// Create API handler
export async function GET/POST(req) {
  // Handle tRPC requests
  // Use appRouter
}
```

**Benchmark Router**

```typescript
// Pseudo code
const benchmarkRouter = router({
  getByPredictionId: procedure
    .input(z.object({ predictionId: z.string().uuid() }))
    .query(async ({ input }) => {
      // Query benchmark_summary
      // Return data
    }),

  getSnapshots: procedure
    .input(z.object({
      predictionId: z.string().uuid(),
      limit: z.number().optional()
    }))
    .query(async ({ input }) => {
      // Query benchmark_snapshots
      // Return time series
    }),
});
```

**Verification Steps:**
```bash
# Link Vercel project
vercel link

# Add environment variables
vercel env add DATABASE_URL production

# Deploy to preview
vercel

# Test API
curl https://your-app.vercel.app/api/trpc/benchmarks.getByPredictionId?input=...
```

**Success Criteria:**
- [ ] Next.js app runs locally
- [ ] Deployed to Vercel
- [ ] tRPC API responds
- [ ] Can query database from API
- [ ] Environment variables configured

---

### Phase 3: Inngest Integration (Week 3)

**Prerequisites:**
- [ ] Phase 2 complete
- [ ] Inngest account created at https://inngest.com
- [ ] INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY available

**File Structure Created:**
```
packages/web/
├── inngest/
│   ├── client.ts                     # CREATE
│   └── functions/
│       ├── benchmark-hourly.ts       # CREATE
│       └── benchmark-prediction.ts   # CREATE
└── app/api/inngest/
    └── route.ts                      # CREATE
```

**Inngest Client (inngest/client.ts)**

```typescript
// Pseudo code
export const inngest = new Inngest({
  id: 'betteraiengine',
  name: 'BetterAI Engine'
});
```

**Inngest API Route (app/api/inngest/route.ts)**

```typescript
// Pseudo code
// Serve Inngest functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    benchmarkHourly,
    benchmarkPrediction,
  ],
});
```

**Hourly Orchestrator (inngest/functions/benchmark-hourly.ts)**

```typescript
// Pseudo code - simplified
export const benchmarkHourly = inngest.createFunction(
  { id: 'benchmark-hourly' },
  { cron: '0 * * * *' },  // Every hour
  async ({ step }) => {

    // Step 1: Fetch active predictions
    const predictions = await step.run('fetch-predictions', async () => {
      // Call BenchmarkService.getActivePredictions()
      // Return list of predictions to process
    });

    // Step 2: Fan-out to workers
    await step.run('fan-out', async () => {
      // Send events to trigger benchmark-prediction function
      // One event per prediction
      inngest.send(predictions.map(p => ({
        name: 'benchmark/process-prediction',
        data: { predictionId: p.id, marketId: p.marketId }
      })));
    });

    // Return summary
    return { totalProcessed: predictions.length };
  }
);
```

**Prediction Worker (inngest/functions/benchmark-prediction.ts)**

```typescript
// Pseudo code - simplified
export const benchmarkPrediction = inngest.createFunction(
  {
    id: 'benchmark-prediction',
    concurrency: 50,
    retries: 3
  },
  { event: 'benchmark/process-prediction' },
  async ({ event, step }) => {

    // Step 1: Fetch market price (calls Vercel API internally)
    const marketPrice = await step.run('fetch-price', async () => {
      // Call MarketDataFetcher.fetchCurrentMarketPrice()
      // This runs as serverless function on Vercel
    });

    // Step 2: Calculate metrics
    const metrics = await step.run('calculate', async () => {
      // Call BenchmarkService.calculateBenchmarkMetrics()
    });

    // Step 3: Save to database
    await step.run('save', async () => {
      // Call BenchmarkService.saveBenchmarkSnapshot()
      // Call BenchmarkService.updateBenchmarkSummary()
    });

    return { success: true };
  }
);
```

**Verification Steps:**
```bash
# Test Inngest locally
inngest-cli dev

# Trigger manual execution
curl -X POST http://localhost:3000/api/inngest \
  -H "Content-Type: application/json" \
  -d '{"name":"benchmark/process-prediction","data":{...}}'

# Check Inngest dashboard
open https://app.inngest.com/env/production/functions
```

**Success Criteria:**
- [ ] Inngest client configured
- [ ] Hourly cron job shows in dashboard
- [ ] Can trigger manual execution
- [ ] Worker processes predictions
- [ ] Snapshots saved to database
- [ ] Automatic retries work on failure

---

### Phase 4: Analytics & CLI (Week 4)

**Prerequisites:**
- [ ] Phase 3 complete

**File Structure Created:**
```
packages/core/services/
└── benchmark-analytics.ts    # CREATE

packages/web/app/api/trpc/routers/
└── analytics.ts              # CREATE

packages/cli/
├── package.json              # CREATE
├── cli.ts                    # CREATE
└── commands/
    └── benchmark.ts          # CREATE
```

**BenchmarkAnalytics Service**

```typescript
// Pseudo code
class BenchmarkAnalytics {
  // Get performance by experiment
  async getExperimentReport(experimentId) {
    // Aggregate metrics from benchmark_summary
    // Group by experiment_id
    // Calculate success rate, avg convergence, etc.
  }

  // Get performance by category (future)
  async getCategoryPerformance(experimentId) {
    // Join with market metadata
    // Group by category
    // Return per-category stats
  }
}
```

**Analytics tRPC Router**

```typescript
// Pseudo code
const analyticsRouter = router({
  getExperimentReport: procedure
    .input(z.object({ experimentId: z.string() }))
    .query(async ({ input }) => {
      // Call BenchmarkAnalytics.getExperimentReport()
    }),

  getLeaderboard: procedure
    .input(z.object({
      sortBy: z.enum(['convergence', 'confidence']),
      limit: z.number().default(50)
    }))
    .query(async ({ input }) => {
      // Query top predictions
      // Sort by specified metric
    }),
});
```

**CLI Tool**

```typescript
// Pseudo code
program
  .command('run:benchmark')
  .option('--prediction-id <id>')
  .option('--dry-run')
  .action(async (options) => {
    // Send event to Inngest
    await inngest.send({
      name: 'benchmark/trigger-manual',
      data: { predictionIds: [options.predictionId] }
    });
  });

program
  .command('benchmark:report')
  .option('--experiment-id <id>')
  .action(async (options) => {
    // Call tRPC API
    const report = await trpc.analytics.getExperimentReport.query({
      experimentId: options.experimentId
    });
    // Display formatted report
  });
```

**Verification Steps:**
```bash
# Test CLI
pnpm dev run:benchmark --prediction-id abc-123
pnpm dev benchmark:report --experiment-id 006

# Test API
curl https://your-app.vercel.app/api/trpc/analytics.getExperimentReport?input=...
```

**Success Criteria:**
- [ ] BenchmarkAnalytics service complete
- [ ] Analytics API endpoints working
- [ ] CLI can trigger benchmarks
- [ ] CLI can display reports
- [ ] Manual trigger function works

---

### Phase 5: Web Dashboard MVP (Week 5-6)

**Prerequisites:**
- [ ] Phase 4 complete

**File Structure Created:**
```
packages/web/app/
├── benchmarks/
│   ├── [id]/
│   │   └── page.tsx          # CREATE: Detail view
│   └── page.tsx              # CREATE: List view
├── predictions/
│   └── [id]/
│       └── page.tsx          # CREATE: Prediction view
└── components/
    ├── BenchmarkChart.tsx    # CREATE
    └── MetricsCard.tsx       # CREATE
```

**Prediction Detail Page**

```typescript
// Pseudo code
export default function PredictionPage({ params }) {
  // Fetch data with tRPC
  const { data } = trpc.benchmarks.getByPredictionId.useQuery({
    predictionId: params.id
  });

  const { data: snapshots } = trpc.benchmarks.getSnapshots.useQuery({
    predictionId: params.id,
    limit: 168  // 7 days
  });

  return (
    <div>
      <h1>{data.market.question}</h1>
      <MetricsCard metrics={data} />
      <BenchmarkChart snapshots={snapshots} />
    </div>
  );
}
```

**Experiment Leaderboard Page**

```typescript
// Pseudo code
export default function LeaderboardPage() {
  const { data } = trpc.analytics.getLeaderboard.useQuery({
    sortBy: 'convergence',
    limit: 50
  });

  return (
    <table>
      {data.map(prediction => (
        <tr>
          <td>{prediction.market.question}</td>
          <td>{prediction.convergencePercentage}%</td>
          <td>{prediction.experimentId}</td>
        </tr>
      ))}
    </table>
  );
}
```

**Verification Steps:**
```bash
# Run locally
pnpm dev

# Open browser
open http://localhost:3000/benchmarks

# Deploy to Vercel
vercel --prod
```

**Success Criteria:**
- [ ] Can view prediction details
- [ ] Can see benchmark chart
- [ ] Can view leaderboard
- [ ] Real-time updates work
- [ ] Mobile responsive
- [ ] Deployed to production

---

### Phase 6: Monitoring & Optimization (Week 7)

**Prerequisites:**
- [ ] Phase 5 complete

**Tasks:**
- [ ] Set up Vercel Analytics
- [ ] Configure Inngest alerts for failures
- [ ] Add error tracking (Sentry optional)
- [ ] Optimize database queries with EXPLAIN
- [ ] Add database indexes for performance
- [ ] Load test with 1000+ predictions

**Monitoring Setup**

```typescript
// Add to Inngest functions
export const benchmarkPrediction = inngest.createFunction(
  {
    onFailure: async ({ error, event }) => {
      // Send alert to Slack/Discord
      // Log to error tracking service
    }
  },
  // ... rest of function
);
```

**Database Optimization**

```sql
-- Add composite indexes
CREATE INDEX idx_benchmark_summary_status_experiment
  ON benchmark_summary(benchmark_status, experiment_id);

CREATE INDEX idx_benchmark_snapshots_prediction_time
  ON benchmark_snapshots(prediction_id, snapshot_at DESC);

-- Analyze queries
EXPLAIN ANALYZE SELECT ...;
```

**Success Criteria:**
- [ ] Vercel Analytics configured
- [ ] Inngest alerts working
- [ ] Database queries optimized
- [ ] Load test passes
- [ ] Error rate < 1%
- [ ] P95 latency < 500ms

---

## Metrics & Reporting

### Key Performance Indicators (KPIs)

1. **Directional Accuracy**: % of predictions where market moves toward AI prediction (Target: >60%)
2. **Convergence Rate**: Average hourly movement toward prediction
3. **Confidence Calibration**: Correlation between AI confidence and convergence
4. **Time to Convergence**: Hours before market reaches predicted price

### Dashboard Views

**Prediction Performance:**
- Current market price vs prediction
- Convergence chart (24h, 7d, all-time)
- Movement direction indicator
- Convergence metrics (rate, cumulative, percentage)

**Experiment Leaderboard:**
- Total predictions per experiment
- Directional accuracy percentage
- Average convergence rate
- Confidence calibration score
- Top performers list

**Real-Time Monitor:**
- Active predictions count
- Markets tracked count
- Movement distribution (converging/diverging/stable)
- Recent activity feed

---

## Future Enhancements

### Advanced Features

1. **Multi-Timeframe Analysis**: Track benchmarks at 1h, 6h, 24h, 7d intervals
2. **Prediction Ensembles**: Combine multiple model predictions weighted by performance
3. **Automated Trading Signals**: Generate alerts when convergence accelerates
4. **Market Sentiment Integration**: Twitter/social sentiment tracking
5. **A/B Testing Framework**: Compare prompting strategies with automated optimization
6. **Webhooks & Notifications**: Slack/Discord alerts for high-conviction predictions
7. **Historical Backtesting**: Replay past markets to validate model performance
8. **Public API**: External developer access with rate limiting

### Experiments Framework Evolution

**Recommendation**: Keep experiments framework and evolve for serverless.

**Evolution 1 - Move to Monorepo:**
```
packages/core/experiments/
├── config.ts
├── types.ts
├── base/
├── exp006/
└── exp007/
```

**Evolution 2 - API-First:**
```typescript
// tRPC endpoints
experimentRouter.run({ experimentId, marketSlug })
experimentRouter.getPerformance({ experimentId })
```

**Evolution 3 - Smart Selection:**
```typescript
// Auto-select best experiment per category
const experimentId = await selector.selectExperiment(market);
// Returns '007' for Sports, '006' for Politics
```

**Future Vision (6 months):**
```
📊 Experiment Performance Dashboard

Exp007 "Multi-Model Ensemble"
├─ Sports: 78% accuracy ⭐ BEST
├─ Politics: 71% accuracy
└─ Overall: 73% accuracy

Exp006 "Parallel Research"
├─ Sports: 72% accuracy
├─ Politics: 75% accuracy ⭐ BEST
└─ Overall: 72% accuracy

→ Smart Router: Uses Exp007 for Sports, Exp006 for Politics
→ A/B Testing: 80% production, 20% experimental
```

**Benefits:** Measure category performance, A/B test safely, data-driven optimization

---

## Conclusion

This design provides a complete roadmap for implementing the Hourly Prediction Benchmark Service using serverless architecture (Vercel + Inngest + Neon).

### Why Serverless Wins

| Benefit | Impact |
|---------|--------|
| Zero Infrastructure | No servers to manage |
| Instant Deploys | Git push → Production <60s |
| Auto-Scaling | 10 to 10,000 predictions seamlessly |
| Cost Efficiency | $0-30/month (MVP), $65-110/month (scale) |
| Built-in Observability | Inngest dashboard shows every execution |

### Next Steps

1. **Begin Phase 1**: Database schema and core services
2. **Set up infrastructure**: Neon, Vercel, Inngest accounts
3. **Implement phases sequentially**: Each phase builds on previous
4. **Launch MVP**: Deploy hourly benchmarking to production

---

**Document Status:** Implementation Ready
**Target Implementation:** 6-7 weeks
**Estimated Cost:** $0-30/month (MVP), $65-110/month (at scale)

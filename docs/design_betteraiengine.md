# design-betteraiengine.md

## Overview
BetterAI-v2 is a **headless backend service** (no frontend) for generating AI-enhanced predictions on Polymarket markets. It ingests data from the Polymarket Gamma API, persists both structured entities (events, markets, predictions) and raw API payloads, then uses LangChain + OpenRouter to produce structured prediction outputs.

The system is operated via CLI commands and scheduled batch jobs (daily syncs).

---

## Problems Solved
- **Automated Market Data Ingestion**: Consistently fetches top or specified Polymarket markets and stores them in a local Postgres database.
- **Auditability**: Saves **raw JSON snapshots** from Polymarket in a `polymarket_raw` table for debugging, reproducibility, and compliance.
- **Prediction Automation**: Allows single-market or batch prediction jobs with LLM inference pipelines (LangChain → OpenRouter).
- **Structured Storage**: Persists both intermediate steps and final prediction outputs for later analysis, reproducibility, or re-training.
- **No UI Complexity**: Headless design (CLI only) avoids early frontend overhead.
- **Extensible**: Built to support later add-ons like tool-augmented predictions, research integrations, or trading automation.

---

## User Stories
1. **Analyst**: As a user, I can run  
   `yarn cli predict:market --marketId <id>`  
   to fetch a Polymarket market, run a prediction job, and store results.
2. **Researcher**: As a user, I can query the DB for past raw Polymarket responses to compare data revisions.
3. **Operator**: As a maintainer, I can schedule a daily batch job to pull the top N markets by volume/liquidity.
4. **Developer**: As a developer, I can inspect prediction job steps, including raw AI responses, to debug prompt performance.
5. **Auditor**: As a compliance reviewer, I can confirm exactly what the AI saw by inspecting raw API JSON + saved prompt context.

---

## High-Level System Components
- **CLI Layer**
  - `ingest:topMarkets`
  - `ingest:event <id>`
  - `predict:market <id>`
  - `prune:raw --keep-days 60`
- **Database (Postgres + Prisma)**
  - `Event`, `Market`, `Predictions`
  - `PredictionJob`, `PredictionStep`, `PredictionResult`
  - `PolymarketRaw` (audit log of raw payloads)
- **Polymarket Ingestion**
  - Gamma API fetchers
  - Deduplication + upserts into DB
  - Call `savePolymarketRaw` for every fetch
- **Prediction Engine**
  - LangChain pipeline
  - OpenRouter wrapper (system + context prompt builders)
  - Writes `PredictionJob` and `PredictionStep`
- **Observability**
  - Pino logging with structured context (jobId, marketId, eventId)
  - Logs output to JSON (raw) and pretty (dev)
- **Retention / Pruning**
  - Scripted pruning of old `polymarket_raw` entries (retain first + last daily snapshots, keep last N days)

---

## Phased Implementation Plan

### Phase 1 – Core Ingestion
- Scaffold repo (TS/Node, Prisma, CLI)
- Create DB schema for Events, Markets, Predictions
- Implement Gamma API fetcher + upsert
- Add `PolymarketRaw` table + `savePolymarketRaw` helper
- CLI: `ingest:topMarkets`

### Phase 2 – Prediction Pipeline (MVP)
- Add `PredictionJob` + `PredictionStep` tables
- Integrate LangChain + OpenRouter
- CLI: `predict:market <id>`
- Persist final prediction JSON + raw model responses

### Phase 3 – Batch + Scheduling
- Daily cron job: fetch top N markets by 24h volume/liquidity
- Batch prediction: `predict:event <eventId>` → fan out to all open markets
- Structured logs with Pino (contextualized by job/market/event)

### Phase 4 – Data Retention & Ops
- Implement pruning job for `PolymarketRaw` (`prune:raw`)
- Add retention policy (keep last 60 days, plus daily first/last snapshots)
- Add indexes for query speed (GIN for JSONB, timestamps)

### Phase 5 – Extensibility / Future
- Plug in research sources (Exa, Grok, etc.)
- Advanced AI pipelines (multi-step reasoning, multiple models)
- Trading integration layer (OMS, portfolio watcher)
- Optional frontend dashboard for monitoring jobs


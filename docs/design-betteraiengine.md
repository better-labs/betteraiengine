# design-betteraiengine.md

Last updated: 10/3/25

## Overview
BetterAI-v2 is a **headless backend service** (no frontend) for generating AI-enhanced predictions on Polymarket markets. It pulls data from the Polymarket Gamma API, persists both structured entities (events, markets, predictions) and raw API payloads, then uses LangChain + OpenRouter to produce structured prediction outputs.

The system is operated via CLI commands and scheduled batch jobs (daily syncs).

---

## Problems Addressed
- **Prediction Automation**: Allows single-market or batch prediction jobs with LLM inference pipelines (LangChain → OpenRouter).

- **Auditability**: Saves **raw JSON snapshots** from Polymarket in a `polymarket_raw` table for debugging, reproducibility, and compliance.
- **Structured Storage**: Persists both intermediate steps and final prediction outputs for later analysis, reproducibility, or re-training.
- **No UI Complexity**: Headless design (CLI only) avoids early frontend overhead.


---

## User Stories
- Prediction: As a user, I can run a CLI command that will fetch a Polymarket event and/or market's latest data, run a prediction job. Store intermediate prediction jobs, steps, and results to the database.
- Inspect prediction job steps, including raw AI responses, to debug prompt performance.
- View past predictions in the database by inspecting raw API JSON + saved prompt context.

---

## High-Level System Components
- **CLI Layer**
  - `run:experiment -e <experiment-id> --url or --slug`
  - `list:experiments`

- **Database (Postgres + Drizzle)**

  - `RawEvent`, `RawMarket` (pure JSONB with generated columns for id/slug)
  - `Prediction`, `PredictionJob`, `PredictionResult`
- **Polymarket Ingestion**
  - Gamma API fetchers for Event and Market endpoints, eg: 
  https://docs.polymarket.com/api-reference/events/get-event-by-slug
  https://docs.polymarket.com/api-reference/markets/get-market-by-slug
  - Deduplication + upserts into DB
  - Call `saveRawEvent` or `saveRawMarket` for every fetch

- **Prediction Engine**
  - LangChain pipeline
  - OpenRouter wrapper (system + context prompt builders)
- **Observability**
  - Pino logging with structured context (jobId, marketId, eventId)
  - Logs output to JSON (raw) and pretty (dev)

---

## Phased Implementation Plan

### Phase 1 – Scaffold setup
- Scaffold repo (TS/Node, Drizzle, Commander.js CLI, pnpm)
- Create DB schema for Events, Markets, Predictions
- Implement Gamma API fetcher + upsert
- Add `RawEvent` and `RawMarket` tables (pure JSONB with generated id/slug columns)
- CLI: `pnpm dev ingest:topMarkets`

### Phase 2 – Prediction Pipeline (MVP)
- Add `PredictionJob` and `Predictions` tables
- Integrate LangChain + OpenRouter
- CLI: `run:experiment -e 001 --url or --slug`
- Persist final prediction JSON + raw model responses
- Configuration-based experiment system for pluggable models

### Future Features – Batch + Scheduling
- Daily cron job: fetch top N markets by 24h volume/liquidity
- Batch prediction: `predict:event <eventId>` → fan out to all open markets
- Structured logs with Pino (contextualized by job/market/event)


- Advanced AI pipelines (multi-step reasoning, multiple models)
- Plug in research sources (Exa, Grok, etc.)
- Trading integration with BetterOMS: https://github.com/better-labs/betteroms
- Optional frontend dashboard for monitoring jobs


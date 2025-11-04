# Experiment 006: Modular Market Prediction Pipeline

## Overview
Modular prediction experiment using dual-source web research (Exa AI + Grok) with GPT-5 for structured market analysis.

## Architecture

### Modular Design
The experiment is split into focused, reusable modules:

```
exp006/
├── main.ts              # Orchestrator - coordinates all steps
├── fetch-markets.ts     # Market fetching and filtering
├── research-market.ts   # Dual-source web research (Exa + Grok)
├── prepare-prompts.ts   # Prompt generation with auto-schema
├── generate-prediction.ts # AI model invocation and validation
└── schemas.ts           # Single source of truth (Zod schema)
```

## Flow

### 1. Fetch Markets
**Module:** `fetch-markets.ts`

```typescript
fetchTrendingMarkets({
  limit: 100,
  maxSpreadPercent: 25,
  excludeTags: ['Crypto', 'Hide From New', 'Weekly', 'Recurring']
})
```

- Fetches trending markets from Polymarket
- Filters by spread and excludes unwanted tags
- Returns first market for analysis (or uses provided market)

### 2. Research Market
**Module:** `research-market.ts`

```typescript
performMarketResearch(market)
```

- Parallel research using Exa AI (neural search) and Grok (web search)
- Gathers 10 sources from each provider
- Formats and merges research contexts
- Returns metadata (source counts, character counts, success flags)

### 3. Prepare Prompts
**Module:** `prepare-prompts.ts`

```typescript
buildPrompts(market, researchContext)
```

- Auto-generates JSON schema from Zod using `zod-to-json-schema`
- Builds system prompt with AI analyst guidelines
- Builds context prompt with market info + research data
- Includes structured formatting requirements

### 4. Generate Prediction
**Module:** `generate-prediction.ts`

```typescript
generatePrediction({
  marketId,
  systemPrompt,
  contextPrompt,
  model: 'openai/gpt-5',
  temperature: 0.7
})
```

- Calls OpenRouter API with GPT-5
- Parses JSON response (handles markdown code blocks)
- Validates against Zod schema
- Returns structured prediction + raw response

### 5. Save Results
**Module:** `main.ts`

- Calculates prediction delta (model vs market price)
- Saves prediction to database with enrichment metadata
- Returns experiment result with all data

## Schema Management

**Single Source of Truth:** `schemas.ts`

```typescript
export const PredictionSchema = z.object({
  outcome: z.enum(['YES', 'NO', 'UNCERTAIN']),
  outcomeReasoning: z.string().min(10),
  confidence: z.number().min(0).max(100),
  confidenceReasoning: z.string().min(10),
  probability: z.number().min(0).max(100),
  keyFactors: z.array(z.string()).min(1),
  dataQuality: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  lastUpdated: z.string().datetime(),
});
```

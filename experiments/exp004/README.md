# Experiment 004: Exa AI Web Research Enrichment

## Overview

Experiment 004 enhances prediction accuracy by enriching the AI model's context with real-time web research data from Exa AI before generating predictions. This experiment builds on the structured output approach from exp003 while adding a critical data collection step.

## Architecture

### Two-Step Pipeline

```
1. Data Collection (Exa AI)
   ↓
2. Enriched Prediction (Claude Sonnet 4.5)
```

### Step 1: Web Research Collection

Uses Exa AI's **Search API + Contents API** to gather relevant information:

- **Input**: Market question (e.g., "Will Georgia Tech win the 2026 College Football National Championship?")
- **Process**:
  - Exa's neural search finds 8 semantically relevant web sources
  - Contents API extracts summaries, highlights, and text from each source
  - Results are aggregated and formatted into structured research context
- **Output**: Formatted research context with multiple sources, summaries, and key highlights
- **Token Limit**: Capped at ~200k characters (~50k tokens) to avoid context window overflow

### Step 2: Enriched Prediction

Uses Claude Sonnet 4.5 with the enriched context:

- **Input**: Original market data + Web research context
- **Process**: AI model analyzes both Polymarket data and web research to generate prediction
- **Output**: Structured JSON prediction with reasoning that cites research sources

## Why This API Combination?

After deep research into Exa AI's APIs, I recommend **Search + Contents** over alternatives:

### ✅ Recommended: Search API + Contents API

- **Neural search** finds semantically similar content (better than keyword matching)
- **Contents API** provides clean, parsed text with summaries and highlights
- **Flexible**: Can control text length, number of highlights, and summary generation
- **Efficient**: Aggregates data in one round-trip with character limits

### ❌ Not Recommended

- **Research API**: Unavailable (500 errors) and likely overkill for single predictions
- **Answer API**: Too narrow - gives one answer instead of rich research context
- **Websets**: Optimized for building monitored or curated web collections with webhooks—powerful, but heavier than needed for on-demand, single-market research

## Key Features

1. **Graceful Degradation**: If Exa API fails, continues with prediction (without enrichment)
2. **Token Management**: Automatically truncates content to stay within ~50k token limit
3. **Source Attribution**: AI reasoning can reference specific web sources
4. **Metadata Tracking**: Stores enrichment metadata (# sources, characters, truncation status)
5. **Structured Output**: Same Zod schema as exp003 with separated reasoning fields

## Configuration

### Environment Variables

Add to `.env.local`:

```bash
EXA_API_KEY=your_exa_api_key_here
```

### Exa Research Parameters

Defined in `services/exa-research.ts`:

- `numResults`: 8 (number of web sources to fetch)
- `type`: 'neural' (semantic search vs keyword)
- `useAutoprompt`: true (let Exa optimize the search query)
- `contents.text.maxCharacters`: 2000 per source
- `contents.highlights.numSentences`: 3 sentences per highlight
- `contents.summary`: true (generate summaries)

## Data Flow

```typescript
Market Question
  ↓
Exa AI Search (neural, 8 results)
  ↓
Exa AI Contents (summaries, highlights, text)
  ↓
Format Research Context (markdown)
  ↓
Truncate to 200k chars (~50k tokens)
  ↓
Combine with Market Data
  ↓
Claude Sonnet 4.5 Prediction
  ↓
Structured JSON Output + Delta
  ↓
Save to Database with Enrichment Metadata
```

## Example Usage

```bash
pnpm dev run:experiment -e 004 -u https://polymarket.com/event/college-football-champion-2026-684/will-georgia-tech-win-the-2026-college-football-national-championship
```

## Prediction Schema

Same as exp003 with added enrichment metadata:

```typescript
{
  marketId: string,
  question: string,
  prediction: {
    outcome: "YES" | "NO" | "UNCERTAIN",
    outcomeReasoning: string,
    confidence: number,  // 0-100
    confidenceReasoning: string,
    probability: number  // 0-100
  },
  keyFactors: string[],
  dataQuality: "HIGH" | "MEDIUM" | "LOW",
  lastUpdated: string,  // ISO timestamp
  enrichmentMetadata: {
    exaResearchSuccess: boolean,
    numSources: number,
    totalCharacters: number,
    truncated: boolean
  }
}
```

## Benefits Over Previous Experiments

### vs exp001 (Baseline GPT-4)
- ✅ Real-time web research data
- ✅ Structured output with Zod validation
- ✅ Better model (Claude Sonnet 4.5)

### vs exp002/003 (Structured Claude)
- ✅ **Enriched context** with current, real-world information
- ✅ AI can cite specific sources in reasoning
- ✅ Higher data quality assessment
- ✅ More informed confidence levels

## Cost Considerations

- **Exa AI**: ~$0.001-0.01 per search depending on contents fetched
- **Claude Sonnet 4.5**: Higher token usage due to enriched context (~10-30k tokens)
- **Trade-off**: Higher cost for potentially more accurate predictions

## Future Enhancements

- Add date filtering for time-sensitive markets
- Cache research results to reduce API calls
- A/B test predictions with/without enrichment
- Add Exa findSimilar for related market discovery
- Implement source quality scoring

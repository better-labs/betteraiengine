# Experiment 002: Claude Sonnet 4.5 with Structured JSON Output

## Overview
Enhanced prediction experiment using Claude Sonnet 4.5 via OpenRouter with explicit JSON prompting and Zod schema validation. Builds on exp001's foundation while improving consistency and reliability through strongly-typed outputs and prediction delta tracking.

## Key Improvements over exp001
- **Model**: Claude Sonnet 4.5 via OpenRouter - more advanced reasoning capabilities
- **Structured Output**: Explicit JSON prompting with Zod schema validation - ensures consistent format
- **Prediction Delta**: Calculates and stores the difference between market YES price and predicted YES probability
- **Error Handling**: Robust JSON parsing with markdown stripping and Zod validation for type safety

## Functionality
- Uses Claude Sonnet 4.5 model through OpenRouter
- Analyzes Polymarket market data (question, description, volume, liquidity, outcome prices)
- Generates **structured** predictions with explicit JSON format instructions:
  - Outcome (YES/NO/UNCERTAIN)
  - Confidence level (0-100)
  - Probability (0-100) - YES outcome likelihood
  - Detailed reasoning
  - Key factors
  - Data quality assessment
- **Parses and validates** responses using Zod schema for type safety
- **Calculates prediction delta**: `predictionDelta = marketYesPrice - (prediction.probability / 100)`
  - Positive delta = Market more bullish than AI
  - Negative delta = Market more bearish than AI (AI predicts higher than market)
- Saves predictions with delta to database
- Logs failures and saves failed prediction records

## Model Configuration
- Model: `anthropic/claude-sonnet-4.5` (OpenRouter format)
- Temperature: 0.7
- Provider: OpenRouter (supports Anthropic models with structured output)
- Max Tokens: 4096

## Structured Output Schema (Zod)

### Pros of Structured JSON Output:
- **Type Safety**: Compile-time validation ensures correct data structure
- **Consistency**: Every prediction follows exact same format
- **Easier Processing**: No string parsing or format detection needed
- **Better Error Messages**: Zod provides detailed validation errors
- **Auto-completion**: IDE support for prediction objects
- **Maintainability**: Schema serves as documentation

### Cons of Structured JSON Output:
- **Less Flexibility**: Can't handle edge cases outside schema
- **Initial Setup**: Requires defining and maintaining Zod schemas
- **Potential Over-constraint**: Might force AI into rigid structure when nuance needed
- **Parsing Overhead**: Small performance cost for validation

### Decision: **Use Zod + Explicit JSON Prompting**
The benefits of consistency, type safety, and easier data processing outweigh the minor loss of flexibility. Using explicit JSON format instructions with Zod validation provides reliable structured output that works with any model via OpenRouter.

## Prediction Schema
```typescript
import { z } from 'zod';

const PredictionSchema = z.object({
  marketId: z.string().describe('Polymarket market identifier'),
  question: z.string().describe('Market question being analyzed'),
  prediction: z.object({
    outcome: z.enum(['YES', 'NO', 'UNCERTAIN']).describe('Predicted outcome'),
    confidence: z.number().min(0).max(100).describe('Confidence level in prediction (0-100)'),
    probability: z.number().min(0).max(100).describe('Estimated probability of YES outcome (0-100)'),
    reasoning: z.string().min(10).describe('Detailed explanation for the prediction'),
  }),
  keyFactors: z.array(z.string()).min(1).describe('Key factors influencing the prediction'),
  dataQuality: z.enum(['HIGH', 'MEDIUM', 'LOW']).describe('Quality of available data for analysis'),
  lastUpdated: z.string().datetime().describe('ISO timestamp of prediction'),
});

export type PredictionOutput = z.infer<typeof PredictionSchema>;
```

## Implementation Approach
```typescript
// Initialize model
const model = new ChatOpenAI({
  model: 'anthropic/claude-sonnet-4.5',
  temperature: 0.7,
  apiKey: process.env.OPENROUTER_API_KEY,
  configuration: {
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://betterai.tools',
      'X-Title': 'BetterAI Engine',
    },
  },
});

// Invoke model with explicit JSON format instructions in prompt
const response = await model.invoke(messages);

// Parse response - handle markdown code blocks
let content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
if (jsonMatch) {
  content = jsonMatch[1].trim();
}

// Parse and validate with Zod
const parsed = JSON.parse(content);
const prediction: PredictionOutput = PredictionSchema.parse(parsed);
```

**Note**: OpenRouter does not support LangChain's `withStructuredOutput()` method for Claude models. This implementation uses explicit JSON format instructions in the prompt combined with manual parsing and Zod validation, which is more reliable and works with any model.

## Utility Functions

### Market Data Parsing (`utils/market-utils.ts`)

The experiment uses dedicated utility functions for robust parsing and error handling:

#### `parseOutcomePrices(outcomePrices?: string): ParseResult<number[]>`
Parses Polymarket's `outcomePrices` JSON string into an array of numbers.
- Handles both string and number array formats
- Returns `ParseResult` with success/error information
- Example: `'["0.45", "0.55"]'` → `[0.45, 0.55]`

#### `getYesOutcomePrice(outcomePrices?: string): ParseResult<number>`
Extracts the YES outcome price (first element) from outcomePrices.
- Returns decimal value (0-1 range)
- Handles undefined/invalid formats gracefully

#### `calculatePredictionDelta(marketOutcomePrices?: string, predictedProbability?: number): ParseResult<number>`
Calculates the prediction delta with full validation.
- Formula: `delta = marketYesPrice - (predictedProbability / 100)`
- Validates probability is in 0-100 range
- Returns error if either value is invalid
- Logs calculation details for debugging

#### `formatOutcomePrices(outcomePrices?: string): string`
Formats outcome prices for display in prompts.
- Example output: `"YES: 45.0%, NO: 55.0%"`
- Returns `"N/A"` for invalid formats

### Error Handling Strategy
- All parsing functions return `ParseResult<T>` objects with `success` flag
- Prediction is saved even if delta calculation fails
- Failed delta calculations are logged as warnings, not errors
- Invalid data formats are caught and reported clearly

## Database Schema
Uses existing `predictions` table with `predictionDelta` field (already added):
- `predictionDelta`: real - difference between market YES price and predicted YES probability (as decimal)
- Field is optional and may be `null` if delta calculation fails

## Environment Variables Required
- `OPENROUTER_API_KEY` (OpenRouter supports Anthropic models)

## Usage
```bash
pnpm dev predict:market <market-id> --experiment exp002
```

## Metrics to Track
- Prediction delta over time
- Correlation between delta and actual outcomes
- Model accuracy vs market consensus
- Response time and token usage

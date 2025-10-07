# Experiment 003: Separated Reasoning Fields

## Changes vs Experiment 002

This experiment builds on [exp002](../exp002/main.ts) with the following modifications:

### Prediction Schema Changes

The `prediction` object now includes **two separate reasoning fields** instead of a single combined reasoning field:

#### Before (exp002):
```typescript
prediction: {
  outcome: z.enum(['YES', 'NO', 'UNCERTAIN']),
  confidence: z.number().min(0).max(100),
  probability: z.number().min(0).max(100),
  reasoning: z.string().min(10).describe('Detailed explanation for the prediction'),
}
```

#### After (exp003):
```typescript
prediction: {
  outcome: z.enum(['YES', 'NO', 'UNCERTAIN']),
  outcomeReasoning: z.string().min(10).describe('Detailed reasoning for the predicted outcome'),
  confidence: z.number().min(0).max(100),
  confidenceReasoning: z.string().min(10).describe('Detailed reasoning for the confidence level'),
  probability: z.number().min(0).max(100),
}
```

### Key Differences

1. **`outcomeReasoning`**: Dedicated field explaining why the model chose YES, NO, or UNCERTAIN
2. **`confidenceReasoning`**: Dedicated field explaining why the model assigned a specific confidence level (0-100)

This separation allows for:
- More structured and explicit reasoning
- Better analysis of how the model arrives at its outcome vs. its confidence
- Improved transparency in the prediction process
- Potential for separate evaluation of outcome logic vs. confidence calibration

### All Other Features Remain the Same

- Claude Sonnet 4.5 via OpenRouter
- Structured JSON output with Zod validation
- Prediction delta calculation
- Comprehensive logging
- Database persistence

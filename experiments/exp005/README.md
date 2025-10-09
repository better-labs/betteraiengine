# Experiment 005: Dual-Source Research with Enhanced Formatting

## Overview

Experiment 005 introduces dual-source web research enrichment (Exa AI + Grok AI) and enhanced prediction output formatting. This experiment removes LangChain dependencies in favor of direct API calls and implements parallel research fetching for improved data coverage and performance. Building on exp004's web research capabilities, exp005 adds a second research source and enhanced formatting requirements for better human readability.

## Design Changes

### 1. Dual-Source Research Architecture (NEW)

**Addition**: Parallel web research from two complementary sources for broader information coverage.

**Research Sources**:
- **Exa AI**: Neural search engine optimized for high-quality web content discovery
  - 10 results per query
  - 1,500 characters per result
  - Includes text, highlights, and summaries
  - 25K character budget (half of total 50K limit)

- **Grok AI** (via OpenRouter): Real-time web search with current information
  - Model: `x-ai/grok-2-1212`
  - 10 results per query
  - Real-time web access for latest news and developments
  - 25K character budget (half of total 50K limit)

**Implementation**:
```typescript
const [exaResult, grokResult] = await Promise.all([
  performExaResearch({ query, numResults: 10, ... }),
  performGrokSearch({ query, maxResults: 10 }),
]);
```

**Benefits**:
- Broader information coverage from diverse sources
- Parallel fetching reduces total latency
- Redundancy if one API fails
- Complementary strengths (Exa: depth, Grok: real-time)

### 2. Removed LangChain Dependencies (NEW)

**Change**: Replaced LangChain wrapper with direct OpenRouter API calls for better control and reduced overhead.

**Before (with LangChain)**:
```typescript
const model = new ChatOpenAI({
  model: 'anthropic/claude-sonnet-4.5',
  configuration: { baseURL: 'https://openrouter.ai/api/v1', ... }
});
const response = await model.invoke(messages);
```

**After (direct API)**:
```typescript
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { ... },
  body: JSON.stringify({
    model: 'anthropic/claude-sonnet-4.5',
    messages: [...]
  })
});
```

**Benefits**:
- Reduced dependencies and bundle size
- More explicit control over API calls
- Simplified error handling
- Easier to debug and maintain

### 3. Enhanced Reasoning Formatting (Implemented)

**Problem**: Outcome and confidence reasoning sections are generated as single-line text blocks, making them difficult to read and parse.

**Previous State (exp004)**:
```
Based on comprehensive analysis of polling data and political dynamics, Newsom's path to the nomination remains highly uncertain. Current evidence shows mixed signals: (1) Polymarket data indicates Newsom leads the betting market at 35% probability with $1.1M in volume, suggesting he is the current frontrunner among potential candidates. (2) However, multiple polls reveal significant challenges...
```

**Solution Implemented**: Enhanced prompting logic in both system and context prompts to explicitly request structured formatting.

#### Implemented Formatting Requirements
- **Numbered Points**: Use (1), (2), (3) format for clear enumeration
- **Paragraph Breaks**: Separate major arguments with line breaks
- **Bullet Points**: For lists of factors or considerations
- **Source Citations**: Clear attribution to research sources
- **Logical Flow**: Structure reasoning in a logical flow that's easy to follow

### 4. System Prompt Enhancements

**Changes in `buildSystemPrompt()`**:
- Added explicit "FORMATTING REQUIREMENTS FOR REASONING SECTIONS" section
- Specified numbered points format: (1), (2), (3) for enumeration
- Requested paragraph breaks between major arguments
- Emphasized clear source citations with context
- Added requirement for logical flow structure

### 5. Context Prompt Enhancements

**Changes in `buildContextPrompt()`**:
- Updated field descriptions in JSON format template to include formatting instructions
- Added "IMPORTANT FORMATTING REQUIREMENTS" section with detailed bullet points
- Specified formatting expectations for both `outcomeReasoning` and `confidenceReasoning` fields
- Emphasized paragraph breaks and numbered point structure
- Added instruction to reference specific research sources from both Exa and Grok

### 6. Schema Documentation Updates

**Changes to Zod Schema**:
- Updated descriptions for `outcomeReasoning` and `confidenceReasoning` to mention "structured formatting"
- No changes to validation logic (backward compatible)

### 7. Metadata Tracking

**New Tracking Fields**:
- Added `enhancedFormatting: true` flag to enrichment metadata
- Added `formatting: 'enhanced-structured'` to raw request and result data
- Tracks both Exa and Grok research success rates
- Separate character counts for each research source
- Added `enrichment: 'exa-ai-and-grok-research'` identifier

## Technical Specifications

### Files Created/Modified
- [experiments/exp005/main.ts](main.ts) - Complete implementation with dual-source research and direct API calls
- [services/grok-search.ts](../../services/grok-search.ts) - New Grok AI search service
- [services/exa-research.ts](../../services/exa-research.ts) - Updated character limits (200K → 25K)

### Key Differences from exp004

| Aspect | exp004 | exp005 |
|--------|--------|--------|
| Research Sources | Exa AI only | Exa AI + Grok AI (parallel) |
| API Client | LangChain wrapper | Direct fetch calls |
| Character Budget | 200K (Exa) | 25K (Exa) + 25K (Grok) = 50K total |
| Research Fetching | Sequential | Parallel (Promise.all) |
| System Prompt | Basic guidelines | Explicit formatting requirements section |
| Context Prompt | Simple field descriptions | Detailed formatting instructions |
| Metadata | Enrichment only | Enrichment + formatting + dual-source tracking |
| Raw Request | `enrichment: 'exa-ai-research'` | `enrichment: 'exa-ai-and-grok-research'`, `formatting: 'enhanced-structured'` |

### Dependencies
- **Removed**: `@langchain/openai`, `@langchain/core` (no longer needed)
- **New**: Uses native `fetch` for all API calls
- **Required Environment Variables**:
  - `OPENROUTER_API_KEY` - For Claude and Grok API access
  - `EXA_API_KEY` - For Exa AI research

## Expected Outcomes

The dual-source research and enhanced formatting should result in:

### Information Quality
1. **Broader coverage** - Two complementary research sources provide more diverse perspectives
2. **Real-time data** - Grok's web access ensures latest news and developments are included
3. **Better redundancy** - If one API fails, predictions can still use the other source
4. **Richer context** - Combined 50K character budget provides substantial research depth

### Performance Improvements
5. **Faster research** - Parallel fetching reduces total latency vs sequential calls
6. **Reduced overhead** - Removing LangChain eliminates wrapper overhead
7. **Clearer debugging** - Direct API calls are easier to trace and debug

### Output Quality
8. **More readable reasoning** - Clear paragraph structure with numbered enumeration
9. **Better source attribution** - Citations from both Exa and Grok research
10. **Improved logical flow** - Structured formatting makes arguments easier to follow
11. **Maintained accuracy** - All exp004 prediction quality preserved with added benefits

## Usage

```bash
# Ensure environment variables are set
export OPENROUTER_API_KEY="your-key"
export EXA_API_KEY="your-key"

# Run prediction for a specific market
pnpm dev predict:market <market-id-or-slug>
```


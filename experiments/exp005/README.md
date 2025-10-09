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

### Files Modified
- [experiments/exp005/main.ts](main.ts) - Complete implementation with enhanced prompting

### Key Differences from exp004

| Aspect | exp004 | exp005 |
|--------|--------|--------|
| System Prompt | Basic guidelines | Explicit formatting requirements section |
| Context Prompt | Simple field descriptions | Detailed formatting instructions with examples |
| Schema Descriptions | Generic | Mentions "structured formatting" |
| Metadata | Enrichment only | Enrichment + formatting flags |
| Raw Request | `enrichment: 'exa-ai-research'` | `enrichment: 'exa-ai-research'`, `formatting: 'enhanced-structured'` |

### Dependencies
- No new dependencies required
- Changes are backward compatible
- All exp004 functionality preserved (Exa AI research, web enrichment, etc.)

## Expected Outcomes

The enhanced formatting requirements should result in:
1. More readable reasoning sections with clear paragraph structure
2. Easier identification of key arguments through numbered enumeration
3. Better source attribution and citation clarity
4. Improved logical flow in reasoning presentation
5. Maintained prediction accuracy and data quality from exp004


# Experiment 005: Enhanced Prediction Formatting

## Overview

Experiment 005 introduces significant improvements to the prediction output formatting to enhance human readability and provide better information hierarchy.

## Design Changes

### 1. Enhanced Reasoning Formatting (Planned)

**Problem**: Outcome and confidence reasoning sections are generated as single-line text blocks, making them difficult to read and parse.

**Current State**: 
```
Based on comprehensive analysis of polling data and political dynamics, Newsom's path to the nomination remains highly uncertain. Current evidence shows mixed signals: (1) Polymarket data indicates Newsom leads the betting market at 35% probability with $1.1M in volume, suggesting he is the current frontrunner among potential candidates. (2) However, multiple polls reveal significant challenges...
```

**Proposed Solution**: Enhance the prompting logic in experiment implementations to request structured formatting.

#### Proposed Formatting Requirements
- **Numbered Points**: Use (1), (2), (3) format for clear enumeration
- **Paragraph Breaks**: Separate major arguments with line breaks
- **Bullet Points**: For lists of factors or considerations
- **Source Citations**: Clear attribution to research sources

#### Implementation Strategy
Modify the `buildContextPrompt()` function in experiment implementations:

```typescript
"outcomeReasoning": "<Use clear structure with numbered points (1), (2), etc. Include paragraph breaks for readability. Cite specific research sources with context.>",
"confidenceReasoning": "<Use clear structure with numbered points (1), (2), etc. Include paragraph breaks for readability. Reference data quality and source reliability with specific examples.>",
```

## Technical Specifications

### Files to be Modified (Planned)
- `experiments/exp004/main.ts` - Enhanced prompting for structured reasoning
- Other experiment implementations - Consistent formatting requirements

### Dependencies
- No new dependencies required
- Changes are backward compatible


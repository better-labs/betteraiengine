# Trade Generator Design

## Overview

The Trade Generator feature converts AI predictions into executable trade plans for paper trading on Polymarket. It fetches predictions from the database, retrieves current market prices, validates trading opportunities, and generates structured trade plans following the [BetterOMS Trade Plan Schema v0.0.4](https://github.com/better-labs/betteroms/blob/main/docs/schemas/trade-plan-v0.0.4.schema.json).

## Architecture

### Components

1. **CLI Command** (`cli.ts`)
   - Minimal command interface: `generate:trade`
   - Input: Prediction ID (UUID)
   - Options: Strategy selection, minimum delta threshold
   - Output: JSON trade plan or error message

2. **Trade Generator Service** (`services/trade-generator.ts`)
   - Core orchestration logic
   - Fetches prediction from database
   - Retrieves fresh market data from Polymarket API
   - Validates trade opportunities
   - Generates trade plans using selected strategy

3. **Trade Strategies** (`services/trade-strategies.ts`)
   - Pluggable strategy system
   - Currently implements: `takeProfit` strategy
   - Future strategies can be added without modifying core logic

### Data Flow

```
User Input (Prediction ID)
  ↓
CLI Command (generate:trade)
  ↓
Trade Generator Service
  ↓
├─→ Fetch Prediction (Database)
├─→ Fetch Market Data (Polymarket API)
├─→ Validate Opportunity (Min Delta Check)
└─→ Calculate Strategy (Trade Strategies)
  ↓
Trade Plan JSON Output
```

## Trading Strategy: Take Profit

The "Take Profit" strategy handles both **underpriced** and **overpriced** scenarios by executing two orders:

1. **Market BUY** - Immediate entry at current market price
2. **Limit SELL** - Take profit order at **confidence-based target** (scales with AI confidence)

### Profit Target Formula

**`profitFraction = confidence / 200`**

This formula adjusts profit targets based on the AI's confidence level:

| Confidence | Profit Fraction | Description |
|------------|-----------------|-------------|
| 100% | 50% | Maximum aggressive target (takes half the predicted edge) |
| 90% | 45% | High confidence target |
| 80% | 40% | Moderate-high confidence |
| 76% | 38% | Moderate confidence |
| 70% | 35% | Moderate-low confidence |
| 60% | 30% | Conservative target |
| 50% | 25% | Minimum conservative target |

**Higher AI confidence → More aggressive profit target**
**Lower AI confidence → More conservative profit target**

### Strategy Logic

The strategy automatically detects whether the market is underpriced or overpriced relative to the AI prediction and adjusts accordingly:

#### Scenario 1: Underpriced (Market < AI Prediction)
**Buy the predicted outcome** when the market is undervaluing it.

**Example:**
```
AI Prediction: YES at 75% probability (85% confidence)
Current Market: YES trading at 60%
Delta: 15% (above 2.5% threshold)

Strategy: Buy YES (market is underpricing it)
Profit Target: Halfway between 60% and 75% = 67.5%

Generated Trade Plan:
[
  {
    "marketId": "0x123...",
    "outcome": "YES",
    "side": "BUY",
    "orderType": "MARKET",
    "size": 1
  },
  {
    "marketId": "0x123...",
    "outcome": "YES",
    "side": "SELL",
    "orderType": "LIMIT",
    "price": 0.675,
    "size": 1
  }
]

Expected Profit: 0.675 - 0.60 = 0.075 (7.5%)
Conservative target increases execution probability
```

#### Scenario 2: Overpriced (Market > AI Prediction)
**Buy the OPPOSITE outcome** when the market is overvaluing the predicted outcome.

**Example:**
```
AI Prediction: YES at 82% probability (76% confidence)
Current Market: YES trading at 91.5%
Delta: 9.5% (above 2.5% threshold)

Strategy: Buy NO (YES is overpriced, so NO is underpriced)
Profit Target: Halfway between 8.5% and 18% = 13.25%

Generated Trade Plan:
[
  {
    "marketId": "0x123...",
    "outcome": "NO",
    "side": "BUY",
    "orderType": "MARKET",
    "size": 1
  },
  {
    "marketId": "0x123...",
    "outcome": "NO",
    "side": "SELL",
    "orderType": "LIMIT",
    "price": 0.133,
    "size": 1
  }
]

Logic: If YES should be 82%, then NO should be 18%
       Current NO price is 8.5% (underpriced)
       Halfway target: 8.5% + ((18% - 8.5%) / 2) = 13.25%
       Expected Profit: 0.133 - 0.085 = 0.048 (4.75%)
       Conservative target increases execution probability
```

### Key Features

✅ **Bidirectional Trading** - Profits from both underpriced and overpriced scenarios
✅ **Automatic Detection** - Strategy automatically determines which outcome to buy
✅ **Contrarian Positions** - Buys opposite outcome when market is overpriced
✅ **Conservative Profit Targets** - Takes profit at halfway point (50% of predicted edge)
✅ **Higher Execution Rate** - Realistic targets increase likelihood of limit orders filling
✅ **Clear Reasoning** - Trade notes explain the logic behind each decision

## Validation Rules

### 1. UNCERTAIN Predictions
- **Rule**: Skip predictions with outcome `UNCERTAIN`
- **Reason**: AI model lacks confidence for directional trade
- **Error**: "Cannot generate trade for UNCERTAIN prediction..."

### 2. Minimum Delta Threshold
- **Rule**: Delta between prediction and market must exceed 2.5% (configurable)
- **Reason**: Ensures meaningful edge before trading
- **Calculation**: `|prediction_price - outcome_market_price| * 100`
- **Note**: Delta is calculated for the predicted outcome's market price

### 3. Direction Handling (Automatic)
The strategy automatically handles both scenarios:
- **Underpriced**: When market < AI prediction → Buy predicted outcome
- **Overpriced**: When market > AI prediction → Buy opposite outcome
- **No manual direction check needed** - Strategy intelligently chooses the right side

## Trade Plan Schema

Follows [BetterOMS Trade Plan v0.0.4](https://github.com/better-labs/betteroms/blob/main/docs/schemas/trade-plan-v0.0.4.schema.json):

```typescript
interface TradePlan {
  planId: string;              // "prediction-{uuid}-{timestamp}"
  mode: "paper" | "live";      // Always "paper" for now
  trades: Array<{
    marketId: string;          // Polymarket market ID
    outcome: "YES" | "NO";     // Which outcome to trade
    side: "BUY" | "SELL";      // Buy or sell
    orderType: "MARKET" | "LIMIT";
    size: number;              // Amount in USDC (fixed at 1 for paper trading)
    price?: number;            // Required for LIMIT orders (0-1 scale)
  }>;
}
```

## Usage

### Basic Usage
```bash
pnpm dev generate:trade -p <prediction-uuid>
```

### With Options
```bash
# Use different strategy (future)
pnpm dev generate:trade -p <uuid> -s limitOnly

# Adjust minimum delta threshold
pnpm dev generate:trade -p <uuid> -d 5.0
```

### Output Format

**Success:**
```json
{
  "planId": "prediction-abc-123-1234567890",
  "mode": "paper",
  "trades": [...]
}
```

**Failure:**
```
Error: Delta 1.85% is below minimum threshold 2.5%
```

## Future Enhancements

### Additional Strategies

1. **Limit Only** - Single limit order between market and prediction
2. **Scaled Entry** - Multiple limit orders at different price levels
3. **Market Maker** - Provide liquidity on both sides
4. **Mean Reversion** - Trade against recent price movements

### Configuration Options

- Variable trade sizes based on confidence
- Risk-adjusted position sizing
- Multi-market portfolio trades
- Time-based order expiration

### Integration Points

- Direct submission to BetterOMS for execution
- Position tracking and P&L monitoring
- Performance analytics and backtesting
- Alert system for trade opportunities

## Technical Notes

### Market Price Extraction
- Polymarket API returns `outcomePrices` as stringified JSON array
- Format: `["0.6234", "0.3766"]` where index 0 = YES, index 1 = NO
- Prices are on 0-1 scale (e.g., 0.60 = 60% probability)

### Paper Trading
- All trades use `mode: "paper"` for simulation
- Fixed size of 1 USDC per trade
- No actual funds at risk

### Error Handling
- Graceful degradation with descriptive error messages
- Structured logging for debugging
- Validation at multiple levels (CLI, service, strategy)

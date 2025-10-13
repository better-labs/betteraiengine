# BetterAI Engine

## Overview

BetterAI Engine is a headless backend system for generating AI-powered predictions on Polymarket markets. It ingests market data from the Polymarket Gamma API, stores structured data and raw API payloads in Postgres, and runs a prediction pipeline via LangChain and OpenRouter. The system is operated through CLI commands and scheduled batch jobs.

BetterAI Engine is part of the evolving BetterAI platform. Please see the other ongoing work here: https://github.com/better-labs

---

## 🎯 Purpose

The purpose of BetterAI-v2 is to provide a streamlined, backend-only prediction engine for Polymarket markets. By focusing on ingestion, storage, and automated AI-driven predictions, it avoids early frontend overhead while ensuring data auditability, reproducibility, and future extensibility.

BetterAI-v2 sets the foundation for more advanced features such as multi-model research integration, portfolio monitoring, and trading automation.

---

## 🛠️ The Problems Addressed

* **Data Ingestion & Persistence**: Automated daily ingestion of Polymarket’s top markets ensures always-current market data.
* **Auditability & Compliance**: Raw JSON API responses are stored in a dedicated `polymarket_raw` table, enabling full transparency and debugging.
* **Prediction Automation**: AI models (via LangChain + OpenRouter) generate structured predictions for specified markets or events.
* **Operational Simplicity**: Headless, CLI-first design keeps setup simple without a frontend.
* **Extensibility**: The system design makes it easy to layer in future capabilities like external research integrations, trading signals, and dashboards.

---

## 🧪 Experiments System

BetterAI Engine uses a configuration-based experiment system that allows for safe, pluggable prediction models. Each experiment is isolated, versioned, and can be enabled/disabled independently.

### Available Commands

**List all experiments:**
```bash
pnpm dev list:experiments
```

**Run an experiment:**
```bash
pnpm dev run:experiment -e 001 -u <polymarket-url>
# or with slug directly:
pnpm dev run:experiment -e 001 -s <market-slug>
```

**Example:**
```bash
pnpm dev run:experiment -e 001 -u https://polymarket.com/event/college-football-champion-2026-684/will-georgia-tech-win-the-2026-college-football-national-championship
```

---

## 📝 Creating a New Experiment

Follow these steps to add a new experiment to the system:

### 1. Create Experiment Folder

Create a new folder in `experiments/` with the naming convention `expXXX` (e.g., `exp002`, `exp003`):

```bash
mkdir experiments/exp002
```

### 2. (Optional) Create a README.md File

To explain the architecture of your experiment (data pipeline).

### 3. Create `main.ts` File

Create `experiments/exp002/main.ts` with the following structure:

```typescript
import { logger } from '../../utils/logger.js';
import { PolymarketMarket } from '../../services/polymarket.js';
import { ExperimentResult } from '../types.js';

/**
 * Experiment 002: Your experiment description
 */
export async function run(market: PolymarketMarket): Promise<ExperimentResult> {
  logger.info({ experimentId: '002', marketId: market.id }, 'Starting experiment 002');

  try {
    // Your experiment logic here
    // Access market data via: market.question, market.description, etc.

    // Example: Call AI models, fetch external data, perform analysis, etc.
    const prediction = await yourPredictionLogic(market);

    return {
      success: true,
      data: {
        marketId: market.id,
        prediction: prediction,
        // ... other data you want to return
      },
    };
  } catch (error) {
    logger.error(
      { experimentId: '002', marketId: market.id, error: error instanceof Error ? error.message : String(error) },
      'Experiment 002 failed'
    );

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

### 4. Register in Configuration

Add your experiment to `experiments/config.ts`:

```typescript
export const experimentRegistry: ExperimentRegistry = {
  // ... existing experiments ...

  '002': {
    id: '002',
    name: 'Your Experiment Name',
    description: 'Detailed description of what your experiment does',
    version: '1.0.0',
    author: 'Your Name',
    enabled: true,  // Set to false to disable
    tags: ['tag1', 'tag2'],
    createdAt: '2025-10-05',
    loader: () => import('./exp002/main.js'),
  },
};
```

### 5. Test Your Experiment

```bash
# List to verify it appears
pnpm dev list:experiments

# Run your experiment
pnpm dev run:experiment -e 002 -u <market-url>
```

### Key Points

- **Type Safety**: The `run()` function must accept `PolymarketMarket` object type as input and return `Promise<ExperimentResult>`
- **Error Handling**: Always wrap logic in try/catch and return appropriate success/error states
- **Logging**: Use structured logging with `logger.info()` and `logger.error()`
- **Enable/Disable**: Use the `enabled` flag in config to control availability
- **Versioning**: Update version numbers when making significant changes
- **Metadata**: Rich metadata helps with discovery and documentation

### Architecture Benefits

✅ **No filesystem dependencies** - All experiments are explicitly registered
✅ **Type-safe** - TypeScript ensures correct interfaces
✅ **Secure** - No dynamic path resolution or arbitrary code execution
✅ **Discoverable** - `list:experiments` shows all available experiments
✅ **Feature flags** - Enable/disable experiments without code changes
✅ **Metadata-rich** - Version tracking, tags, descriptions, and more

---

## 📊 Trade Generation

The Trade Generator converts AI predictions into executable trade plans for paper trading on Polymarket. It analyzes the delta between AI predictions and current market prices, validates trading opportunities, and generates structured trade plans following the [BetterOMS Trade Plan Schema](https://github.com/better-labs/betteroms/blob/main/src/domain/schemas/trade-plan-v0.0.2.schema.json).

### Command

```bash
pnpm dev generate:trade -p <prediction-uuid>
```

### Options

- `-p, --prediction-id <id>` - Prediction UUID from database (required)
- `-s, --strategy <name>` - Trading strategy to use (default: `takeProfit`)
- `-d, --min-delta <percent>` - Minimum delta threshold percentage (default: `2.5`)

### Example

```bash
# Generate trade plan from a prediction
pnpm dev generate:trade -p "abc123-def456-ghi789"

# Use custom delta threshold
pnpm dev generate:trade -p "abc123-def456-ghi789" -d 5.0
```

### How It Works

1. **Fetch Prediction** - Retrieves prediction data from database
2. **Get Market Price** - Fetches current market price from Polymarket API
3. **Validate Opportunity** - Checks if delta exceeds threshold (default 2.5%)
4. **Generate Trade Plan** - Creates trade plan using selected strategy

### Trading Strategy: Take Profit

The default `takeProfit` strategy intelligently handles both underpriced and overpriced scenarios with **confidence-based profit targets** that scale with the AI's confidence level:

**Profit Target Formula**: `profitFraction = confidence / 200`

- **High confidence (90%+)**: Takes ~45-50% of predicted edge
- **Medium confidence (70-90%)**: Takes ~35-45% of predicted edge
- **Low confidence (50-70%)**: Takes ~25-35% of predicted edge

**Scenario 1: Underpriced (Market < AI Prediction)**
- Buys the predicted outcome when market is undervaluing it
- Takes profit based on confidence (more confident = more aggressive)
- Example: AI says YES at 75% (85% confidence), market at 60% → Buy YES, sell at 66.4% (38% of edge)

**Scenario 2: Overpriced (Market > AI Prediction)**
- Buys the opposite outcome when market is overvaluing the prediction
- Takes profit based on confidence toward inverse AI target
- Example: AI says YES at 82% (76% confidence), market at 91.5% → Buy NO at 8.5%, sell at 12.1% (38% of edge)

**Example Output (Underpriced):**
```json
{
  "planId": "prediction-abc123-1234567890",
  "mode": "paper",
  "trades": [
    {
      "marketId": "0x123...",
      "outcome": "YES",
      "side": "BUY",
      "orderType": "MARKET",
      "size": 1,
      "notes": "Entry: Buy YES at market 0.600 (underpriced vs AI prediction 0.750)"
    },
    {
      "marketId": "0x123...",
      "outcome": "YES",
      "side": "SELL",
      "orderType": "LIMIT",
      "price": 0.675,
      "size": 1,
      "notes": "Take profit: Sell YES at halfway target 0.675 (50% toward AI prediction 0.750)"
    }
  ]
}
```

**Example Output (Overpriced):**
```json
{
  "planId": "prediction-def456-9876543210",
  "mode": "paper",
  "trades": [
    {
      "marketId": "0x456...",
      "outcome": "NO",
      "side": "BUY",
      "orderType": "MARKET",
      "size": 1,
      "notes": "Entry: Buy NO at market 0.085 (AI predicts YES overpriced at 0.915 vs 0.820)"
    },
    {
      "marketId": "0x456...",
      "outcome": "NO",
      "side": "SELL",
      "orderType": "LIMIT",
      "price": 0.133,
      "size": 1,
      "notes": "Take profit: Sell NO at halfway target 0.133 (50% toward inverse AI target 0.180)"
    }
  ]
}
```

### Key Features

✅ **Bidirectional Trading** - Automatically handles both underpriced and overpriced markets
✅ **Contrarian Positions** - Takes opposite side when market disagrees with AI
✅ **Confidence-Based Targets** - Profit targets scale with AI confidence (25-50% of predicted edge)
✅ **Dynamic Risk Management** - Higher confidence = more aggressive, lower confidence = more conservative
✅ **Higher Execution Rate** - Realistic targets increase likelihood of limit orders filling
✅ **Smart Detection** - Determines optimal outcome to trade without manual intervention

### Validation Rules

- **UNCERTAIN predictions** - Rejected with error message
- **Minimum delta** - Must exceed 2.5% (configurable) between prediction and market
- **Automatic direction** - Strategy intelligently chooses which outcome to buy

For detailed design documentation, see [docs/design-trade-generator.md](docs/design-trade-generator.md).



## Todos

Order Generation
- Test new order gen features

- Modify publishing to write to a subfolder of experiment to include the date yyyy-mm-dd
- Write new command to mimic run:experiment to be run:pipeline, copy exp005 to be pipeline001



Data benchmarking
- Generate a few simple tests to query existing data sources, send them all to AIs and ask AI to rate the quality, comprehensiveness and recency of the data, consider asking it to remove or filter data that is not helpful or relevant.

Experiments
- Test sending one agent's output to another agent an also understand whether each are unique
- run the prediction across multiple top models from config/models.ts, including open source and chinese models
- Add custom user supplied context. Seek out experts in a given field to apply their knowledge to the prediction
  - Post update, example to twitter.

- Optimize the system prompt. Pipe one AI's response to another AI
- Test adding Valyu enrichment, compare to exa
- Test adding websets enrichment



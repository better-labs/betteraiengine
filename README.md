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



## Todos

### Future Experiments list:

- add optional field to published doc: modify published data output to highlight research more clearly. 

- enrich each prediction with data from x/twitter GROK search first

- post update to twitter - "[model] predicts .." eg https://x.com/Kalshi/status/1975612799192866873

- consider whether to generate a twitter overview image for the prediction?

- run the prediction across multiple top models from config/models.ts, including open source and chinese models
- Add custom user supplied context. Seek out experts in a given field to apply their knowledge to the prediction
- Optimize the system prompt. Pipe one AI's response to another AI
- test adding websets enrichment


### Benchmarking
- Add a Prediction Check batch job that pulls the latest Market information for all markets currently listed as open.
- Pull predictioncheck design and "open" definition from betteraiv1.
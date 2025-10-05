#!/usr/bin/env node
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env.local before importing other modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '.env.local');
const result = config({ path: envPath });

if (result.error) {
  console.error('Failed to load .env.local:', result.error.message);
  console.error('Looking for file at:', envPath);
  process.exit(1);
}

import { Command } from 'commander';
import { logger } from './utils/logger.js';
import { runExperiment } from './services/experiment-runner.js';
import { getAllExperimentMetadata } from './experiments/config.js';

const program = new Command();

/**
 * Helper: Extract slug from URL or return slug as-is
 */
function getMarketSlug(options: { url?: string; slug?: string }): string {
  let slug = options.slug;

  if (options.url) {
    // Handle event URL format: /event/{event-slug}/{market-slug}
    const eventUrlMatch = options.url.match(/polymarket\.com\/event\/[^/]+\/([^/?]+)/);
    if (eventUrlMatch) {
      slug = eventUrlMatch[1];
    } else {
      // Handle market URL format: /market/{market-slug}
      const marketUrlMatch = options.url.match(/polymarket\.com\/market\/([^/?]+)/);
      if (marketUrlMatch) {
        slug = marketUrlMatch[1];
      } else {
        slug = options.url;
      }
    }
  }

  if (!slug) {
    logger.error('Either --url or --slug must be provided');
    process.exit(1);
  }

  return slug;
}

program
  .name('betteraiengine')
  .description('CLI for BetterAI Engine - AI-enhanced predictions for Polymarket')
  .version('1.0.0');

/**
 * Command: ingest:topMarkets
 * Fetches top markets from Polymarket and ingests them into the database
 */
// program
//   .command('ingest:topMarkets')
//   .description('Fetch and ingest top markets by volume/liquidity from Polymarket')
//   .option('-l, --limit <number>', 'Number of markets to fetch', '10')
//   .action(async (options) => {
//     const limit = parseInt(options.limit, 10);

//     logger.info({ limit }, 'Starting ingest:topMarkets');

//     try {
//       // Fetch top markets
//       const markets = await fetchTopMarkets(limit);

//       logger.info({ count: markets.length }, 'Fetched markets, starting ingestion');

//       // Ingest each market
//       let successCount = 0;
//       let errorCount = 0;

//       for (const market of markets) {
//         try {
//           await ingestMarket(market);
//           successCount++;
//         } catch (error) {
//           errorCount++;
//           logger.error(
//             { marketId: market.id, error: error instanceof Error ? error.message : String(error) },
//             'Failed to ingest market'
//           );
//         }
//       }

//       logger.info(
//         { total: markets.length, success: successCount, errors: errorCount },
//         'Ingestion complete'
//       );

//       process.exit(0);
//     } catch (error) {
//       logger.error(
//         { error: error instanceof Error ? error.message : String(error) },
//         'Failed to fetch or ingest top markets'
//       );
//       process.exit(1);
//     }
//   });

/**
 * Command: list:experiments
 * List all available experiments with their metadata
 */
program
  .command('list:experiments')
  .description('List all available experiments')
  .option('-a, --all', 'Show all experiments including disabled ones')
  .action(async (options) => {
    const experiments = getAllExperimentMetadata();
    const filteredExperiments = options.all
      ? experiments
      : experiments.filter(exp => exp?.enabled);

    console.log('\n=== AVAILABLE EXPERIMENTS ===\n');

    if (filteredExperiments.length === 0) {
      console.log('No experiments available.');
    } else {
      filteredExperiments.forEach(exp => {
        if (!exp) return;

        const status = exp.enabled ? '✓ ENABLED' : '✗ DISABLED';
        console.log(`[${exp.id}] ${exp.name} (v${exp.version})`);
        console.log(`    Status: ${status}`);
        console.log(`    Description: ${exp.description}`);
        if (exp.author) console.log(`    Author: ${exp.author}`);
        if (exp.tags && exp.tags.length > 0) {
          console.log(`    Tags: ${exp.tags.join(', ')}`);
        }
        console.log('');
      });
    }

    console.log('Use: pnpm dev run:experiment -e <id> -u <market-url>\n');
    process.exit(0);
  });

/**
 * Command: run:experiment
 * Run a prediction experiment with a specific experiment number
 */
program
  .command('run:experiment')
  .description('Run a prediction experiment on a Polymarket market')
  .option('-e, --experiment <number>', 'Experiment number (e.g., 001, 002)', '001')
  .option('-u, --url <url>', 'Polymarket market URL')
  .option('-s, --slug <slug>', 'Market slug')
  .action(async (options) => {
    const marketSlug = getMarketSlug(options);
    logger.info({ experiment: options.experiment, marketSlug }, 'Starting run:experiment command');

    try {
      const result = await runExperiment({
        experimentNumber: options.experiment,
        marketSlug,
      });

      if (result.success) {
        console.log('\n=== EXPERIMENT COMPLETED SUCCESSFULLY ===');
        console.log(`Experiment: [${result.experimentId}] ${result.experimentName}`);
        console.log(`Market ID: ${result.marketId}`);
        if (result.data) {
          console.log('\nResults:');
          console.log(JSON.stringify(result.data, null, 2));
        }
        
        process.exit(0);
      } else {
        console.log('\n=== EXPERIMENT FAILED ===');
        console.log(`Experiment: [${result.experimentId}] ${result.experimentName}`);
        console.log(`Error: ${result.error}`);
        console.log('=========================\n');
        logger.error('Experiment failed');
        process.exit(1);
      }
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          experiment: options.experiment,
          marketSlug,
        },
        'Failed to run experiment'
      );
      console.error('\nError:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();

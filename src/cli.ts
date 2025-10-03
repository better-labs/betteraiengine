#!/usr/bin/env node
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env.local before importing other modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env.local');
const result = config({ path: envPath });

if (result.error) {
  console.error('Failed to load .env.local:', result.error.message);
  console.error('Looking for file at:', envPath);
  process.exit(1);
}

import { Command } from 'commander';
import { logger } from './utils/logger.js';
import { fetchTopMarkets, fetchMarketBySlug } from './services/polymarket.js';
import { ingestMarket } from './services/ingestion.js';
import { runPrediction } from './services/prediction.js';

const program = new Command();

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
 * Command: predict:market
 * Fetch a market, ingest it, and run a prediction job
 */
program
  .command('predict:market')
  .description('Run a prediction on a Polymarket market')
  .option('-u, --url <url>', 'Polymarket market URL')
  .option('-s, --slug <slug>', 'Market slug')
  .action(async (options) => {
    let slug = options.slug;

    // Extract slug from URL if provided
    if (options.url) {
      const urlMatch = options.url.match(/polymarket\.com\/(?:event|market)\/([^/?]+)/);
      if (urlMatch) {
        slug = urlMatch[1];
      } else {
        logger.error({ url: options.url }, 'Invalid Polymarket URL format');
        process.exit(1);
      }
    }

    if (!slug) {
      logger.error('Either --url or --slug must be provided');
      process.exit(1);
    }

    logger.info({ slug }, 'Starting predict:market command');

    try {
      // Step 1: Fetch market from Polymarket API
      logger.info({ slug }, 'Fetching market from Polymarket API');
      const market = await fetchMarketBySlug(slug);

      // Step 2: Ingest market (save raw + structured data)
      logger.info({ marketId: market.id }, 'Ingesting market to database');
      await ingestMarket(market);

      // Step 3: Run prediction
      logger.info({ marketId: market.id }, 'Running prediction job');
      const prediction = await runPrediction(market.id);

      // Output results
      logger.info(
        {
          marketId: market.id,
          question: market.question,
          outcome: prediction.prediction.outcome,
          confidence: prediction.prediction.confidence,
          probability: prediction.prediction.probability,
        },
        'Prediction completed successfully'
      );

      console.log('\n=== PREDICTION RESULTS ===');
      console.log(`Market: ${prediction.question}`);
      console.log(`Outcome: ${prediction.prediction.outcome}`);
      console.log(`Confidence: ${prediction.prediction.confidence}%`);
      console.log(`Probability (YES): ${prediction.prediction.probability}%`);
      console.log(`\nReasoning:\n${prediction.prediction.reasoning}`);
      console.log(`\nKey Factors:`);
      prediction.keyFactors.forEach((factor, idx) => {
        console.log(`  ${idx + 1}. ${factor}`);
      });
      console.log(`\nData Quality: ${prediction.dataQuality}`);
      console.log('========================\n');

      process.exit(0);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), slug },
        'Failed to run prediction'
      );
      console.error('\nError:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program.parse();

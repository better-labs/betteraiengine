#!/usr/bin/env node
import { Command } from 'commander';
import { logger } from './utils/logger.js';
import { fetchTopMarkets } from './services/polymarket.js';
import { ingestMarket } from './services/ingestion.js';

const program = new Command();

program
  .name('betteraiengine')
  .description('CLI for BetterAI Engine - AI-enhanced predictions for Polymarket')
  .version('1.0.0');

/**
 * Command: ingest:topMarkets
 * Fetches top markets from Polymarket and ingests them into the database
 */
program
  .command('ingest:topMarkets')
  .description('Fetch and ingest top markets by volume/liquidity from Polymarket')
  .option('-l, --limit <number>', 'Number of markets to fetch', '10')
  .action(async (options) => {
    const limit = parseInt(options.limit, 10);

    logger.info({ limit }, 'Starting ingest:topMarkets');

    try {
      // Fetch top markets
      const markets = await fetchTopMarkets(limit);

      logger.info({ count: markets.length }, 'Fetched markets, starting ingestion');

      // Ingest each market
      let successCount = 0;
      let errorCount = 0;

      for (const market of markets) {
        try {
          await ingestMarket(market);
          successCount++;
        } catch (error) {
          errorCount++;
          logger.error(
            { marketId: market.id, error: error instanceof Error ? error.message : String(error) },
            'Failed to ingest market'
          );
        }
      }

      logger.info(
        { total: markets.length, success: successCount, errors: errorCount },
        'Ingestion complete'
      );

      process.exit(0);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to fetch or ingest top markets'
      );
      process.exit(1);
    }
  });

program.parse();

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

/**
 * Command: run:experiments-batch
 * Run experiments on multiple markets from a JSON file
 */
program
  .command('run:experiments-batch')
  .description('Run prediction experiments on multiple Polymarket markets from a JSON file')
  .option('-e, --experiment <number>', 'Experiment number (e.g., 001, 002)', '001')
  .option('-j, --json <path>', 'Path to JSON file containing array of Polymarket market URLs')
  .action(async (options) => {
    if (!options.json) {
      logger.error('--json option is required');
      console.error('Error: --json option is required');
      process.exit(1);
    }

    try {
      // Read and parse JSON file
      const fs = await import('fs/promises');
      const jsonContent = await fs.readFile(options.json, 'utf-8');
      const urls: string[] = JSON.parse(jsonContent);

      if (!Array.isArray(urls)) {
        throw new Error('JSON file must contain an array of URLs');
      }

      console.log(`\n=== BATCH EXPERIMENT RUN ===`);
      console.log(`Experiment: ${options.experiment}`);
      console.log(`Total markets: ${urls.length}\n`);

      const results = [];
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        console.log(`\n[${i + 1}/${urls.length}] Processing: ${url}`);

        try {
          const marketSlug = getMarketSlug({ url });
          const result = await runExperiment({
            experimentNumber: options.experiment,
            marketSlug,
          });

          results.push({
            url,
            marketSlug,
            success: result.success,
            experimentId: result.experimentId,
            marketId: result.marketId,
            data: result.data,
            error: result.error,
          });

          if (result.success) {
            successCount++;
            console.log(`✓ Success: ${result.marketId}`);
          } else {
            failCount++;
            console.log(`✗ Failed: ${result.error}`);
          }
        } catch (error) {
          failCount++;
          const errorMsg = error instanceof Error ? error.message : String(error);
          results.push({
            url,
            marketSlug: null,
            success: false,
            error: errorMsg,
          });
          console.log(`✗ Error: ${errorMsg}`);
        }
      }

      console.log('\n=== BATCH EXPERIMENT SUMMARY ===');
      console.log(`Total: ${urls.length}`);
      console.log(`Success: ${successCount}`);
      console.log(`Failed: ${failCount}`);
      console.log('\nDetailed results:');
      console.log(JSON.stringify(results, null, 2));

      process.exit(failCount > 0 ? 1 : 0);
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          experiment: options.experiment,
          jsonFile: options.json,
        },
        'Failed to run batch experiments'
      );
      console.error('\nError:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();

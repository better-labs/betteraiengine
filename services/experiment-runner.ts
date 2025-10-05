import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '../utils/logger.js';
import { fetchMarketBySlug } from './polymarket.js';
import { ingestMarket } from './ingestion.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ExperimentOptions {
  experimentNumber?: string;
  marketUrlOrSlug: string;
}

export async function runExperiment(options: ExperimentOptions): Promise<{ success: boolean }> {
  const experimentNumber = options.experimentNumber || '001';
  const expNum = experimentNumber.padStart(3, '0'); // Ensure 3-digit format

  // Check if experiment folder exists
  const experimentPath = join(__dirname, '../../experiments', `exp${expNum}`);
  const experimentMainPath = join(experimentPath, 'main.ts');

  if (!existsSync(experimentPath)) {
    logger.error({ experimentNumber: expNum }, `Experiment folder not found: exp${expNum}`);
    throw new Error(`Experiment exp${expNum} does not exist`);
  }

  if (!existsSync(experimentMainPath)) {
    logger.error({ experimentNumber: expNum }, `Experiment main.ts not found in exp${expNum}`);
    throw new Error(`Experiment exp${expNum}/main.ts does not exist`);
  }

  logger.info({ experimentNumber: expNum, marketUrlOrSlug: options.marketUrlOrSlug }, 'Starting experiment');

  try {
    // Extract slug from URL if needed
    let slug = options.marketUrlOrSlug;
    const urlMatch = options.marketUrlOrSlug.match(/polymarket\.com\/(?:event|market)\/([^/?]+)/);
    if (urlMatch) {
      slug = urlMatch[1];
    }

    // Fetch and ingest market
    logger.info({ slug }, 'Fetching market from Polymarket API');
    const market = await fetchMarketBySlug(slug);

    logger.info({ marketId: market.id }, 'Ingesting market to database');
    await ingestMarket(market);

    // Dynamically import and run the experiment
    const experimentModule = await import(`../../experiments/exp${expNum}/main.js`);

    if (typeof experimentModule.run !== 'function') {
      throw new Error(`Experiment exp${expNum}/main.ts does not export a run() function`);
    }

    logger.info({ experimentNumber: expNum, marketId: market.id }, 'Running experiment');
    const result = await experimentModule.run(market.id);

    if (result.success) {
      logger.info({ experimentNumber: expNum, marketId: market.id }, 'Experiment completed successfully');
    } else {
      logger.error({ experimentNumber: expNum, marketId: market.id, error: result.error }, 'Experiment failed');
    }

    return { success: result.success };
  } catch (error) {
    logger.error(
      { experimentNumber: expNum, error: error instanceof Error ? error.message : String(error) },
      'Failed to run experiment'
    );
    throw error;
  }
}

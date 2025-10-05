import { logger } from '../utils/logger.js';
import { fetchMarketBySlug } from './polymarket.js';
import { ingestMarket } from './polymarket-storage.js';
import { experimentRegistry, getExperimentMetadata, isExperimentAvailable } from '../experiments/config.js';
import { ExperimentModule } from '../experiments/types.js';

export interface ExperimentOptions {
  experimentNumber?: string;
  marketSlug: string;
}

export interface ExperimentRunResult {
  success: boolean;
  experimentId: string;
  experimentName: string;
  marketId?: string;
  error?: string;
  data?: any;
}

/**
 * Validate that a loaded module conforms to the ExperimentModule interface
 */
function validateExperimentModule(module: any, experimentId: string): module is ExperimentModule {
  if (!module || typeof module !== 'object') {
    throw new Error(`Experiment ${experimentId} did not export a valid module`);
  }

  if (typeof module.run !== 'function') {
    throw new Error(`Experiment ${experimentId} does not export a run() function`);
  }

  return true;
}

/**
 * Load an experiment module from the registry
 */
async function loadExperiment(experimentId: string): Promise<ExperimentModule> {
  const config = experimentRegistry[experimentId];

  if (!config) {
    throw new Error(`Experiment ${experimentId} not found in registry`);
  }

  if (!config.enabled) {
    throw new Error(`Experiment ${experimentId} is disabled`);
  }

  try {
    const module = await config.loader();
    validateExperimentModule(module, experimentId);
    return module;
  } catch (error) {
    logger.error(
      { experimentId, error: error instanceof Error ? error.message : String(error) },
      'Failed to load experiment module'
    );
    throw new Error(`Failed to load experiment ${experimentId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Run a prediction experiment
 */
export async function runExperiment(options: ExperimentOptions): Promise<ExperimentRunResult> {
  const experimentNumber = options.experimentNumber || '001';
  const expNum = experimentNumber.padStart(3, '0'); // Ensure 3-digit format

  // Get experiment metadata
  const metadata = getExperimentMetadata(expNum);
  if (!metadata) {
    logger.error({ experimentNumber: expNum }, 'Experiment not found');
    throw new Error(`Experiment ${expNum} does not exist`);
  }

  // Check if experiment is available
  if (!isExperimentAvailable(expNum)) {
    logger.error({ experimentNumber: expNum, name: metadata.name }, 'Experiment is disabled');
    throw new Error(`Experiment ${expNum} (${metadata.name}) is currently disabled`);
  }

  logger.info(
    {
      experimentId: expNum,
      name: metadata.name,
      version: metadata.version,
      marketSlug: options.marketSlug,
    },
    'Starting experiment'
  );

  try {
    // Fetch and ingest market
    const market = await fetchMarketBySlug(options.marketSlug);
    await ingestMarket(market);

    // Load and run the experiment
    const experimentModule = await loadExperiment(expNum);
    const result = await experimentModule.run(market);

    return {
      success: result.success,
      experimentId: expNum,
      experimentName: metadata.name,
      marketId: market.id,
      data: result.data,
      error: result.error,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      { experimentId: expNum, error: errorMessage },
      'Failed to run experiment'
    );
    return {
      success: false,
      experimentId: expNum,
      experimentName: metadata.name,
      error: errorMessage,
    };
  }
}

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
import { PolymarketMarket } from './polymarket.js';
import { ExperimentRunResult } from './experiment-runner.js';
import { getPredictionById } from './prediction-storage.js';
import { getExperimentMetadata } from '../experiments/config.js';

const execAsync = promisify(exec);

export interface GistPublishOptions {
  predictionId: string;
  experimentId: string;
  experimentName: string;
  market: PolymarketMarket;
  result: ExperimentRunResult;
}

/**
 * Format the prediction result as markdown for gist
 */
function formatPredictionMarkdown(options: GistPublishOptions): string {
  const { predictionId, experimentId, experimentName, market, result } = options;

  const markdown = `# Prediction Result: ${market.question}

**Prediction ID:** ${predictionId}
**Experiment:** [${experimentId}] ${experimentName}
**Market:** [${market.question}](https://polymarket.com/event/${market.slug})
**Market ID:** ${market.id}

---

## Market Details

- **Question:** ${market.question}
- **Description:** ${market.description || 'N/A'}
- **End Date:** ${market.endDate || 'N/A'}
- **Active:** ${market.active ? 'Yes' : 'No'}

## Prediction Results

\`\`\`json
${JSON.stringify(result.data, null, 2)}
\`\`\`

## Experiment Configuration

- **Experiment ID:** ${experimentId}
- **Experiment Name:** ${experimentName}
- **Success:** ${result.success ? 'Yes' : 'No'}
${result.error ? `- **Error:** ${result.error}` : ''}

---

*Generated with [BetterAI Engine](https://github.com/better-labs/betteraiengine)*
*Experiment: ${experimentId} | ${experimentName}*
`;

  return markdown;
}

/**
 * Publish prediction results to a GitHub gist
 */
export async function publishPredictionGist(options: GistPublishOptions): Promise<string> {
  const { predictionId } = options;
  const filename = `prediction-${predictionId}.md`;

  logger.info({ predictionId, filename }, 'Publishing prediction to GitHub gist');

  try {
    // Generate markdown content
    const markdown = formatPredictionMarkdown(options);

    // Write to temporary file
    const fs = await import('fs/promises');
    const tmpFile = `/tmp/${filename}`;
    await fs.writeFile(tmpFile, markdown, 'utf-8');

    // Create gist using gh CLI
    // Note: gh CLI doesn't support --org flag for gists, so this creates under the authenticated user
    const { stdout, stderr } = await execAsync(
      `gh gist create "${tmpFile}" --desc "Prediction ${predictionId} - ${options.market.question}" --public`
    );

    if (stderr && !stderr.includes('Creating gist')) {
      logger.warn({ stderr }, 'gh gist create produced stderr output');
    }

    const gistUrl = stdout.trim();
    logger.info({ predictionId, gistUrl }, 'Successfully published prediction to gist');

    // Clean up temp file
    await fs.unlink(tmpFile);

    return gistUrl;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ predictionId, error: errorMsg }, 'Failed to publish gist');
    throw new Error(`Failed to publish gist: ${errorMsg}`);
  }
}

/**
 * Check if gh CLI is available
 */
export async function checkGhCliAvailable(): Promise<boolean> {
  try {
    await execAsync('gh --version');
    return true;
  } catch (error) {
    logger.warn('gh CLI not available');
    return false;
  }
}

/**
 * Publish an existing prediction from database to GitHub gist
 */
export async function publishExistingPrediction(dbPredictionId: string): Promise<string> {
  logger.info({ dbPredictionId }, 'Publishing existing prediction to gist');

  try {
    // Fetch prediction and market data from database
    const data = await getPredictionById(dbPredictionId);

    if (!data.prediction || !data.rawMarket) {
      throw new Error('Prediction or market data not found in database');
    }

    // Extract data from database records
    const prediction = data.prediction;
    const rawMarketData = data.rawMarket.data as PolymarketMarket;

    // Determine experiment ID from the prediction data or model
    // Try to extract from prediction data first
    let experimentId = 'unknown';
    let experimentName = 'Unknown Experiment';

    // Check if prediction data contains experiment info
    if (prediction.prediction && typeof prediction.prediction === 'object') {
      const predData = prediction.prediction as any;

      // Try to infer experiment from model name
      if (prediction.model) {
        if (prediction.model.includes('gpt-4o')) {
          experimentId = '001';
        } else if (prediction.model.includes('claude-sonnet-4.5')) {
          experimentId = '003';
        } else if (prediction.model.includes('claude')) {
          experimentId = '002';
        }
      }
    }

    // Get experiment metadata if we found an ID
    if (experimentId !== 'unknown') {
      const metadata = getExperimentMetadata(experimentId);
      if (metadata) {
        experimentName = metadata.name;
      }
    }

    // Construct the result object to match ExperimentRunResult
    const result: ExperimentRunResult = {
      success: true,
      experimentId,
      experimentName,
      marketId: prediction.marketId || rawMarketData.id,
      data: {
        marketId: prediction.marketId || rawMarketData.id,
        prediction: prediction.prediction,
        predictionDelta: prediction.predictionDelta,
        model: prediction.model,
      },
    };

    // Use the DB prediction ID for the gist filename
    const gistPredictionId = dbPredictionId;

    // Publish to gist using existing function
    const gistUrl = await publishPredictionGist({
      predictionId: gistPredictionId,
      experimentId,
      experimentName,
      market: rawMarketData,
      result,
    });

    return gistUrl;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ dbPredictionId, error: errorMsg }, 'Failed to publish existing prediction');
    throw new Error(`Failed to publish existing prediction: ${errorMsg}`);
  }
}

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
import { PolymarketMarket, getPolymarketUrl } from './polymarket.js';
import { ExperimentRunResult } from './experiment-runner.js';
import { getPredictionById } from './prediction-storage.js';
import { getExperimentMetadata } from '../experiments/config.js';

const execAsync = promisify(exec);

export interface PredictionPublishOptions {
  predictionId: string;
  experimentId: string;
  experimentName: string;
  market: PolymarketMarket;
  result: ExperimentRunResult;
}

/**
 * Format the prediction result as markdown
 */
function formatPredictionMarkdown(options: PredictionPublishOptions): string {
  const { predictionId, experimentId, experimentName, market, result } = options;

  // Extract prediction data
  const predictionData = result.data?.prediction || {};
  const predictionObj = predictionData.prediction || {};
  const predictionDelta = result.data?.predictionDelta;
  const model = result.data?.model;
  const rawRequest = result.data?.rawRequest;
  const rawResponse = result.data?.rawResponse;
  const promptTokens = result.data?.promptTokens;
  const completionTokens = result.data?.completionTokens;

  // Parse market prices (outcomePrices is a JSON string like "[\"0.0235\", \"0.9765\"]")
  let marketYesProbability = 'N/A';
  try {
    if (market.outcomePrices) {
      const prices = JSON.parse(market.outcomePrices);
      if (Array.isArray(prices) && prices.length > 0) {
        marketYesProbability = `${(parseFloat(prices[0]) * 100).toFixed(2)}%`;
      }
    }
  } catch (e) {
    // Keep as N/A if parsing fails
  }

  // Get AI prediction probability
  const aiProbability = predictionObj.probability !== undefined
    ? `${predictionObj.probability}%`
    : 'N/A';

  // Format delta with sign
  const deltaFormatted = predictionDelta !== undefined
    ? `${predictionDelta >= 0 ? '+' : ''}${(predictionDelta * 100).toFixed(2)}%`
    : 'N/A';

  // Get confidence
  const confidence = predictionObj.confidence !== undefined
    ? `${predictionObj.confidence}%`
    : 'N/A';

  // Get Polymarket URL
  const polymarketUrl = getPolymarketUrl(market);

  const markdown = `# ${market.question}

## AI Prediction Overview

- **Market Prediction:** [${marketYesProbability}](${polymarketUrl})
- **AI Prediction:** ${aiProbability}
- **AI Delta:** ${deltaFormatted}
- **Confidence:** ${confidence}

### Outcome Reasoning
${predictionObj.outcomeReasoning || predictionObj.reasoning || 'N/A'}

### Confidence Reasoning
${predictionObj.confidenceReasoning || 'N/A'}

### Key Factors
${predictionData.keyFactors ? predictionData.keyFactors.map((f: string) => `- ${f}`).join('\n') : 'N/A'}

**Data Quality:** ${predictionData.dataQuality || 'N/A'}
**Last Updated:** ${predictionData.lastUpdated || 'N/A'}

---

## Market Overview

- **Question:** ${market.question}
- **Market:** [View on Polymarket](${polymarketUrl})
- **Market ID:** ${market.id}
- **Description:** ${market.description || 'N/A'}
- **End Date:** ${market.endDate || 'N/A'}
- **Status:** ${market.active ? 'Active' : 'Inactive'}${market.closed ? ' (Closed)' : ''}

---

## Experiment Details

- **Experiment ID:** ${experimentId}
- **Experiment Name:** ${experimentName}
- **Model:** ${model || 'N/A'}
- **Prediction ID:** \`${predictionId}\`
- **Status:** ${result.success ? '✓ Success' : '✗ Failed'}
${result.error ? `- **Error:** ${result.error}` : ''}

---

## Technical Metadata

### Token Usage
- **Prompt Tokens:** ${promptTokens || 'N/A'}
- **Completion Tokens:** ${completionTokens || 'N/A'}
- **Total Tokens:** ${(promptTokens && completionTokens) ? (promptTokens + completionTokens) : 'N/A'}

### Raw Request
\`\`\`json
${rawRequest ? JSON.stringify(rawRequest, null, 2) : 'N/A'}
\`\`\`

### Raw Response
\`\`\`json
${rawResponse ? JSON.stringify(rawResponse, null, 2) : 'N/A'}
\`\`\`

---

## Full Prediction Data

\`\`\`json
${JSON.stringify(result.data, null, 2)}
\`\`\`

---

*Generated with [BetterAI Engine](https://github.com/better-labs/betteraiengine) | [Experiment ${experimentId}](https://github.com/better-labs/prediction-history/tree/main/exp${experimentId}) | ${model || 'N/A'}*

**Disclaimer:** All content is for informational and educational purposes only and is not financial advice. You are solely responsible for your own decisions.
`;

  return markdown;
}

/**
 * Publish prediction results to GitHub repository
 */
export async function publishPrediction(options: PredictionPublishOptions): Promise<string> {
  const { predictionId, experimentId } = options;
  const filename = `prediction-${predictionId}.md`;
  const repo = 'better-labs/prediction-history';
  const branch = 'main';
  const filePath = `exp${experimentId}/${filename}`;

  logger.info({ predictionId, filename, repo, filePath }, 'Publishing prediction to GitHub repository');

  try {
    // Generate markdown content
    const markdown = formatPredictionMarkdown(options);

    // Write to temporary file
    const fs = await import('fs/promises');
    const tmpFile = `/tmp/${filename}`;
    await fs.writeFile(tmpFile, markdown, 'utf-8');

    // Encode content as base64 for GitHub API
    const content = Buffer.from(markdown).toString('base64');

    // Check if file already exists to get SHA (for updates)
    let sha: string | undefined;
    try {
      const { stdout: existingFile } = await execAsync(
        `gh api repos/${repo}/contents/${filePath} --jq '.sha'`
      );
      sha = existingFile.trim();
      logger.info({ filePath, sha }, 'File exists, will update');
    } catch {
      logger.info({ filePath }, 'File does not exist, will create new');
    }

    // Create or update file using GitHub API
    const apiPayload = {
      message: `Add prediction ${predictionId} - ${options.market.question}`,
      content,
      branch,
      ...(sha && { sha }), // Include SHA if updating existing file
    };

    const payloadJson = JSON.stringify(apiPayload);
    const { stdout } = await execAsync(
      `echo '${payloadJson.replace(/'/g, "'\\''")}' | gh api repos/${repo}/contents/${filePath} -X PUT --input -`
    );

    const response = JSON.parse(stdout);
    const fileUrl = response.content?.html_url || `https://github.com/${repo}/blob/${branch}/${filePath}`;

    logger.info({ predictionId, fileUrl }, 'Successfully published prediction to repository');

    // Clean up temp file
    await fs.unlink(tmpFile);

    return fileUrl;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ predictionId, error: errorMsg }, 'Failed to publish to repository');
    throw new Error(`Failed to publish to repository: ${errorMsg}`);
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
 * Publish an existing prediction from database to GitHub repository
 */
export async function publishExistingPrediction(dbPredictionId: string): Promise<string> {
  logger.info({ dbPredictionId }, 'Publishing existing prediction to repository');

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

    // Use the DB prediction ID for the filename
    const filePredictionId = dbPredictionId;

    // Publish to repository using existing function
    const fileUrl = await publishPrediction({
      predictionId: filePredictionId,
      experimentId,
      experimentName,
      market: rawMarketData,
      result,
    });

    return fileUrl;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ dbPredictionId, error: errorMsg }, 'Failed to publish existing prediction');
    throw new Error(`Failed to publish existing prediction: ${errorMsg}`);
  }
}

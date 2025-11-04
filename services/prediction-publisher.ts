import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
import { PolymarketMarket, PolymarketEvent, getPolymarketMarketUrl, getPolymarketEventUrl } from './polymarket.js';
import { ExperimentRunResult } from './experiment-runner.js';
import { getPredictionById } from './prediction-storage.js';
import { getExperimentMetadata } from '../experiments/config.js';
import { db, rawMarkets, rawEvents, markets, events } from '../db/index.js';
import { eq } from 'drizzle-orm';

const execAsync = promisify(exec);

/**
 * Get market and event data from database by market ID
 */
async function getMarketAndEventFromDatabase(marketId: string): Promise<{
  market: PolymarketMarket;
  event: PolymarketEvent | null;
} | null> {
  try {
    const result = await db
      .select({
        rawMarket: rawMarkets,
        market: markets,
        rawEvent: rawEvents,
        event: events,
      })
      .from(rawMarkets)
      .leftJoin(markets, eq(rawMarkets.marketId, markets.marketId))
      .leftJoin(events, eq(markets.eventId, events.eventId))
      .leftJoin(rawEvents, eq(events.eventId, rawEvents.eventId))
      .where(eq(rawMarkets.marketId, marketId))
      .limit(1);

    if (result.length === 0) {
      logger.warn({ marketId }, 'Market not found in database');
      return null;
    }

    const rawMarketData = result[0].rawMarket.data as PolymarketMarket;
    const structuredMarket = result[0].market;

    // Merge structured market data into raw market data
    if (structuredMarket) {
      rawMarketData.icon = structuredMarket.icon || rawMarketData.icon;
      rawMarketData.image = structuredMarket.image || rawMarketData.image;
    }

    // Get event data if available
    let eventData: PolymarketEvent | null = null;
    if (result[0].rawEvent?.data) {
      eventData = result[0].rawEvent.data as PolymarketEvent;
      const structuredEvent = result[0].event;

      // Merge structured event data into raw event data
      if (structuredEvent) {
        eventData.title = structuredEvent.title || eventData.title;
        eventData.icon = structuredEvent.icon || eventData.icon;
        eventData.image = structuredEvent.image || eventData.image;
      }

      logger.info({ marketId, eventId: eventData.id, eventTitle: eventData.title }, 'Successfully fetched market and event from database');
    } else {
      logger.info({ marketId }, 'Successfully fetched market from database (no event)');
    }

    return {
      market: rawMarketData,
      event: eventData,
    };
  } catch (error) {
    logger.error({ marketId, error }, 'Failed to fetch market and event from database');
    throw error;
  }
}

export interface PredictionPublishOptions {
  predictionId: string;
  experimentId: string;
  experimentName: string;
  market?: PolymarketMarket;
  event?: PolymarketEvent | null;
  marketId?: string;
  result: ExperimentRunResult;
}

/**
 * Format the prediction result as markdown
 */
function formatPredictionMarkdown(options: PredictionPublishOptions): string {
  const { predictionId, experimentId, experimentName, market, event, result } = options;

  // Extract prediction data
  const predictionData = result.data?.prediction || {};
  const predictionObj = predictionData.prediction || {};
  const predictionDelta = result.data?.predictionDelta;
  const model = result.data?.model;
  const rawRequest = result.data?.rawRequest;
  const rawResponse = result.data?.rawResponse;
  const promptTokens = result.data?.promptTokens;
  const completionTokens = result.data?.completionTokens;
  const researchContext = result.data?.researchContext;

  // Parse market prices (outcomePrices is a JSON string like "[\"0.0235\", \"0.9765\"]")
  let marketYesProbability = 'N/A';
  try {
    if (market?.outcomePrices) {
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

  // Format delta without sign
  const deltaFormatted = predictionDelta !== undefined
    ? `${Math.abs(predictionDelta * 100).toFixed(2)}%`
    : 'N/A';

  // Get confidence
  const confidence = predictionObj.confidence !== undefined
    ? `${predictionObj.confidence}%`
    : 'N/A';

  // Get Polymarket URLs
  const polymarketUrl = market ? getPolymarketMarketUrl(market) : '#';
  const eventUrl = event?.slug ? getPolymarketEventUrl(event.slug) : polymarketUrl;

  // Get market or event image for display
  const marketImage = market?.image || market?.icon;
  const eventImage = event?.image || event?.icon;
  const eventName = event?.title || 'Unknown Event';

  const markdown = `
  
  # AI Prediction Delta: ${deltaFormatted}  
  ${eventImage ? `<img src="${eventImage}" alt="Event Icon" width="100">` : ''}
 - Event: [${eventName}](${eventUrl})  
- Market: [${market?.question || 'Unknown Market'}](${polymarketUrl})  


## AI Prediction Overview

- Market Prediction: ${marketYesProbability}
- AI Prediction: ${aiProbability}
- Confidence: ${confidence}
- AI Prediction Delta: ${deltaFormatted}

### Key Factors
${predictionData.keyFactors ? predictionData.keyFactors.map((f: string) => `- ${f}`).join('\n') : 'N/A'}

### Outcome Reasoning
${predictionObj.outcomeReasoning || predictionObj.reasoning || 'N/A'}

### Confidence Reasoning
${predictionObj.confidenceReasoning || 'N/A'}

Data Quality: ${predictionData.dataQuality || 'N/A'}


---

## Market Overview

- Question: ${market?.question || 'N/A'}
- Market: [View on Polymarket](${polymarketUrl})
- Market ID: ${market?.id || 'N/A'}
- Description: ${market?.description || 'N/A'}
- End Date: ${market?.endDate || 'N/A'}
- Status: ${market?.active ? 'Active' : 'Inactive'}${market?.closed ? ' (Closed)' : ''}

---

## Experiment Details

- Experiment ID: ${experimentId}
- Experiment Name: ${experimentName}
- Model: ${model || 'N/A'}
- Prediction ID: \`${predictionId}\`
- Status: ${result.success ? '✓ Success' : '✗ Failed'}
${result.error ? `- Error: ${result.error}` : ''}

---

## Technical Metadata

### Token Usage
- Prompt Tokens: ${promptTokens || 'N/A'}
- Completion Tokens: ${completionTokens || 'N/A'}
- Total Tokens: ${(promptTokens && completionTokens) ? (promptTokens + completionTokens) : 'N/A'}

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

# Research Data

${researchContext ? researchContext : 'No research data available for this prediction.'}

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
  const { predictionId, experimentId, result, marketId } = options;
  let { market } = options;

  // Validate that either market or marketId is provided
  if (!market && !marketId) {
    throw new Error('Either market or marketId must be provided');
  }

  // Get current date in yyyy-mm-dd format
  const now = new Date();
  const dateFolder = now.toISOString().split('T')[0]; // yyyy-mm-dd

  const filename = `prediction-${predictionId}.md`;
  const repo = 'better-labs/prediction-history';
  const branch = 'main';
  const filePath = `exp${experimentId}/${dateFolder}/${filename}`;

  const rawRequest = result?.data?.rawRequest;
  const rawResponse = result?.data?.rawResponse;

  if (!rawRequest || !rawResponse) {
    throw new Error(
      `Prediction ${predictionId} is missing raw request/response data. Aborting publish.`
    );
  }

  logger.info({ predictionId, filename, repo, filePath }, 'Publishing prediction to GitHub repository');

  try {
    let event: PolymarketEvent | null = null;

    // Fetch market and event data from database if marketId was provided
    if (marketId) {
      logger.info({ marketId }, 'Fetching market and event data from database');
      const data = await getMarketAndEventFromDatabase(marketId);
      if (!data) {
        throw new Error(`Market ${marketId} not found in database`);
      }
      market = data.market;
      event = data.event;
    }

    // Generate markdown content
    const markdown = formatPredictionMarkdown({
      ...options,
      market: market!,
      event,
    });

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
      message: `Add prediction ${predictionId} - ${market!.question}`,
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
    // Fetch prediction from database
    const data = await getPredictionById(dbPredictionId);

    if (!data.prediction) {
      throw new Error('Prediction not found in database');
    }

    // Extract prediction data
    const prediction = data.prediction;

    // Expect experiment ID to be stored on the prediction record
    const experimentId =
      typeof prediction.experimentId === 'string' && prediction.experimentId.trim().length > 0
        ? prediction.experimentId.trim()
        : null;

    if (!experimentId) {
      throw new Error('Experiment ID is missing on the prediction record. Please ensure predictions are saved with experimentId.');
    }

    const metadata = getExperimentMetadata(experimentId);
    if (!metadata) {
      throw new Error(`Experiment ${experimentId} not found in registry. Unable to publish prediction.`);
    }
    const experimentName = metadata.name;

    if (!prediction.rawRequest || !prediction.rawResponse) {
      throw new Error(
        `Prediction ${dbPredictionId} is missing raw request/response payloads in the database. Cannot publish.`
      );
    }

    // Get market ID
    const marketId = prediction.marketId;
    if (!marketId) {
      throw new Error(`Prediction ${dbPredictionId} has no associated market ID`);
    }

    // Construct the result object to match ExperimentRunResult
    const result: ExperimentRunResult = {
      success: true,
      experimentId,
      experimentName,
      marketId,
      data: {
        experimentId,
        marketId,
        prediction: prediction.prediction,
        predictionDelta: prediction.predictionDelta,
        model: prediction.model,
        rawRequest: prediction.rawRequest,
        rawResponse: prediction.rawResponse,
        promptTokens: prediction.promptTokens,
        completionTokens: prediction.completionTokens,
        researchContext: prediction.researchContext,
      },
    };

    // Use the DB prediction ID for the filename
    const filePredictionId = dbPredictionId;

    // Publish to repository using existing function (will fetch market and event from DB)
    const fileUrl = await publishPrediction({
      predictionId: filePredictionId,
      experimentId,
      experimentName,
      marketId,
      result,
    });

    return fileUrl;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ dbPredictionId, error: errorMsg }, 'Failed to publish existing prediction');
    throw new Error(`Failed to publish existing prediction: ${errorMsg}`);
  }
}

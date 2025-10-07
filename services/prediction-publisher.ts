import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
import { PolymarketMarket } from './polymarket.js';
import { ExperimentRunResult } from './experiment-runner.js';

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

    // Create gist using gh CLI under better-labs organization
    const { stdout, stderr } = await execAsync(
      `gh gist create "${tmpFile}" --desc "Prediction ${predictionId} - ${options.market.question}" --public --org better-labs`
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

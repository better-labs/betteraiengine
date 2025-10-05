import { logger } from '../../utils/logger.js';
import { ChatOpenAI } from '@langchain/openai';

export interface ExperimentResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Experiment 001: Baseline prediction experiment using OpenRouter via LangChain
 * Entry point for running this experiment
 */
export async function run(marketId: string): Promise<ExperimentResult> {
  logger.info({ experimentId: '001', marketId }, 'Starting experiment 001');

  try {
    // Initialize LangChain with OpenRouter
    const model = new ChatOpenAI({
      modelName: 'openai/gpt-4o',
      openAIApiKey: process.env.OPENROUTER_API_KEY,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
          'X-Title': process.env.SITE_NAME || 'BetterAI Engine',
        },
      },
    });

    logger.info({ experimentId: '001', marketId }, 'Calling OpenRouter via LangChain');

    // Simple test prompt
    const response = await model.invoke([
      {
        role: 'user',
        content: `Analyze market ${marketId} and provide a brief prediction insight.`,
      },
    ]);

    logger.info({ experimentId: '001', marketId, response: response.content }, 'Experiment 001 completed');

    return {
      success: true,
      data: {
        marketId,
        response: response.content,
        model: 'openai/gpt-4o',
      },
    };
  } catch (error) {
    logger.error(
      { experimentId: '001', marketId, error: error instanceof Error ? error.message : String(error) },
      'Experiment 001 failed'
    );

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

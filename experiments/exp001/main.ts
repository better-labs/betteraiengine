import { logger } from '../../utils/logger.js';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { PolymarketMarket } from '../../services/polymarket.js';
import { savePrediction, saveFailedPrediction } from '../../services/prediction-storage.js';

export interface ExperimentResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Build the system prompt for market prediction
 */
function buildSystemPrompt(): string {
  return `You are an expert prediction analyst for Polymarket markets. Your role is to analyze market questions and provide structured, data-driven predictions.

Guidelines:
- Analyze the question carefully and consider all available information
- Provide a clear outcome prediction: YES, NO, or UNCERTAIN
- Assign a confidence level (0-100) based on the strength of available evidence
- Estimate a probability (0-100) for the YES outcome
- Provide detailed reasoning for your prediction
- Identify key factors that influence the outcome
- Assess the quality of available data

Be objective, balanced, and transparent about uncertainty. Focus on verifiable information over speculation.`;
}

/**
 * Build the context prompt from market data
 */
function buildContextPrompt(market: PolymarketMarket): string {
  const marketInfo = `
Market Question: ${market.question}

Description: ${market.description || 'No description available'}

Market Details:
- Market ID: ${market.id}
- Condition ID: ${market.conditionId}
- Active: ${market.active ? 'Yes' : 'No'}
- Closed: ${market.closed ? 'Yes' : 'No'}
- Current Volume: ${market.volume || 'N/A'}
- Current Liquidity: ${market.liquidity || 'N/A'}

Please analyze this market and provide a structured prediction following this JSON format:
{
  "marketId": "${market.id}",
  "question": "${market.question}",
  "prediction": {
    "outcome": "YES" | "NO" | "UNCERTAIN",
    "confidence": <number 0-100>,
    "probability": <number 0-100>,
    "reasoning": "<detailed explanation>"
  },
  "keyFactors": ["<factor 1>", "<factor 2>", ...],
  "dataQuality": "HIGH" | "MEDIUM" | "LOW",
  "lastUpdated": "<ISO timestamp>"
}`;

  return marketInfo;
}

/**
 * Experiment 001: Baseline prediction experiment using OpenRouter via LangChain
 * Entry point for running this experiment
 */
export async function run(market: PolymarketMarket): Promise<ExperimentResult> {
  try {
    // Initialize LangChain with OpenRouter
    const model = new ChatOpenAI({
      model: 'openai/gpt-4o',
      temperature: 0.7,
      apiKey: process.env.OPENROUTER_API_KEY,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
          'X-Title': process.env.SITE_NAME || 'BetterAI Engine',
        },
      },
    });

    // Build prompts
    const systemPrompt = buildSystemPrompt();
    const contextPrompt = buildContextPrompt(market);

    // Prepare messages
    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(contextPrompt),
    ];

    // Invoke the model
    const response = await model.invoke(messages);

    // Parse the response - try to extract JSON if available
    let predictionData;
    try {
      let content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

      // Remove markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        content = jsonMatch[1].trim();
      }

      // Try to parse as JSON
      predictionData = JSON.parse(content);
    } catch {
      // If not JSON, store as text response
      predictionData = {
        marketId: market.id,
        question: market.question,
        response: response.content,
        format: 'text',
      };
    }

    // Save prediction to database
    await savePrediction({
      marketId: market.id,
      experimentId: '001',
      prediction: predictionData,
      rawRequest: {
        experimentId: '001',
        messages: messages.map(msg => ({
          role: msg._getType(),
          content: msg.content,
        })),
        model: 'openai/gpt-4o',
        temperature: 0.7,
      },
      rawResponse: response,
      model: 'openai/gpt-4o',
      promptTokens: response.response_metadata?.tokenUsage?.promptTokens,
      completionTokens: response.response_metadata?.tokenUsage?.completionTokens,
    });

    return {
      success: true,
      data: {
        marketId: market.id,
        response: response.content,
        model: 'openai/gpt-4o',
        prediction: predictionData,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      { experimentId: '001', marketId: market.id, error: errorMessage },
      'Experiment 001 failed'
    );

    // Save failed prediction job
    await saveFailedPrediction(market.id, errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

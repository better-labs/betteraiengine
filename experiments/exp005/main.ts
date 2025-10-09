import { logger } from '../../utils/logger.js';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { PolymarketMarket } from '../../services/polymarket.js';
import { savePrediction, saveFailedPrediction } from '../../services/prediction-storage.js';
import {
  calculatePredictionDelta,
  formatOutcomePrices,
} from '../../utils/market-utils.js';
import {
  performExaResearch,
  formatExaResearchContext,
} from '../../services/exa-research.js';

export interface ExperimentResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Zod schema for structured prediction output with enhanced formatting requirements
 */
const PredictionSchema = z.object({
  marketId: z.string().describe('Polymarket market identifier'),
  question: z.string().describe('Market question being analyzed'),
  prediction: z.object({
    outcome: z.enum(['YES', 'NO', 'UNCERTAIN']).describe('Predicted outcome'),
    outcomeReasoning: z.string().min(10).describe('Detailed reasoning for the predicted outcome with structured formatting'),
    confidence: z.number().min(0).max(100).describe('Confidence level in prediction (0-100)'),
    confidenceReasoning: z.string().min(10).describe('Detailed reasoning for the confidence level with structured formatting'),
    probability: z.number().min(0).max(100).describe('Estimated probability of YES outcome (0-100)'),
  }),
  keyFactors: z.array(z.string()).min(1).describe('Key factors influencing the prediction'),
  dataQuality: z.enum(['HIGH', 'MEDIUM', 'LOW']).describe('Quality of available data for analysis'),
  lastUpdated: z.string().datetime().describe('ISO timestamp of prediction'),
});

export type PredictionOutput = z.infer<typeof PredictionSchema>;

/**
 * Build the system prompt for market prediction with enhanced formatting requirements
 */
function buildSystemPrompt(): string {
  return `You are an expert prediction analyst for Polymarket markets. Your role is to analyze market questions and provide structured, data-driven predictions with enhanced readability.

You have access to comprehensive web research data gathered specifically for this prediction. Use this research to inform your analysis.

Guidelines:
- Carefully analyze the market question and all available information including web research
- Synthesize insights from multiple sources in the research data
- Provide a clear outcome prediction: YES, NO, or UNCERTAIN
- Provide separate, detailed reasoning for your outcome prediction with STRUCTURED FORMATTING
- Assign a confidence level (0-100) based on the strength of available evidence
- Provide separate, detailed reasoning for your confidence level with STRUCTURED FORMATTING
- Estimate a probability (0-100) for the YES outcome
- Identify key factors that influence the outcome
- Assess the quality of available data (including web research)
- Reference specific sources from the research when relevant

FORMATTING REQUIREMENTS FOR REASONING SECTIONS:
- Use numbered points format: (1), (2), (3) for clear enumeration
- Include paragraph breaks between major arguments for readability
- Use bullet points for lists of factors or considerations
- Provide clear source citations with context
- Structure your reasoning in a logical flow that's easy to follow

Be objective, balanced, and transparent about uncertainty. Focus on verifiable information over speculation. The web research provides current, real-world context that should heavily inform your prediction.`;
}

/**
 * Build the context prompt from market data and web research with enhanced formatting instructions
 */
function buildContextPrompt(market: PolymarketMarket, researchContext: string): string {
  const marketInfo = `
# Market Information

## Market Question
${market.question}

## Description
${market.description || 'No description available'}

## Market Details
- Market ID: ${market.id}
- Condition ID: ${market.conditionId}
- Active: ${market.active ? 'Yes' : 'No'}
- Closed: ${market.closed ? 'Yes' : 'No'}
- Current Volume: ${market.volume || 'N/A'}
- Current Liquidity: ${market.liquidity || 'N/A'}
- Current Outcome Prices: ${formatOutcomePrices(market.outcomePrices)}

---

${researchContext}

---

# Task

Please analyze this market using ALL the information above (both market details and web research) and provide a structured prediction following this EXACT JSON format:

{
  "marketId": "${market.id}",
  "question": "${market.question}",
  "prediction": {
    "outcome": "YES" | "NO" | "UNCERTAIN",
    "outcomeReasoning": "<Use clear structure with numbered points (1), (2), etc. Include paragraph breaks for readability. Cite specific research sources with context. Format as multiple paragraphs with clear enumeration.>",
    "confidence": <number 0-100>,
    "confidenceReasoning": "<Use clear structure with numbered points (1), (2), etc. Include paragraph breaks for readability. Reference data quality and source reliability with specific examples. Format as multiple paragraphs with clear enumeration.>",
    "probability": <number 0-100>
  },
  "keyFactors": ["<factor 1>", "<factor 2>", ...],
  "dataQuality": "HIGH" | "MEDIUM" | "LOW",
  "lastUpdated": "<ISO 8601 timestamp>"
}

IMPORTANT FORMATTING REQUIREMENTS:
- Respond ONLY with valid JSON
- Do not include markdown code blocks or any other text
- The probability field should be your estimated probability of the YES outcome (0-100)
- For outcomeReasoning and confidenceReasoning:
  * Use numbered points format: (1), (2), (3) for clear enumeration
  * Include paragraph breaks between major arguments
  * Use bullet points for lists of factors or considerations
  * Provide clear source citations with context
  * Structure reasoning in logical flow that's easy to follow
- Reference specific research sources in your reasoning
- Consider the recency and reliability of sources when assessing data quality
- Ensure all required fields are included`;

  return marketInfo;
}

/**
 * Experiment 005: Enhanced Prediction Formatting
 * Builds on exp004 with enhanced reasoning formatting for better human readability
 */
export async function run(market: PolymarketMarket): Promise<ExperimentResult> {
  try {
    logger.info({ experimentId: '005', marketId: market.id }, 'Starting experiment 005 with enhanced formatting');

    // Step 1: Perform web research using Exa AI
    logger.info({ experimentId: '005', marketId: market.id, question: market.question }, 'Fetching web research data from Exa AI');

    const researchResult = await performExaResearch({
      query: market.question,
      numResults: 8,
      useAutoprompt: true,
      type: 'neural',
      contents: {
        text: { maxCharacters: 2000 },
        highlights: { numSentences: 3, highlightsPerUrl: 3 },
        summary: true,
      },
    });

    if (!researchResult.success) {
      logger.error(
        { experimentId: '005', marketId: market.id, error: researchResult.error },
        'Exa AI research failed - proceeding without enrichment'
      );
      // Continue with empty research context rather than failing completely
    }

    const researchContext = researchResult.success && researchResult.data
      ? formatExaResearchContext(researchResult.data.contents)
      : 'No additional research data available due to API error.';

    logger.info(
      {
        experimentId: '005',
        marketId: market.id,
        researchSuccess: researchResult.success,
        numSources: researchResult.data?.contents.length || 0,
        totalCharacters: researchResult.data?.totalCharacters || 0,
      },
      'Web research data prepared'
    );

    // Step 2: Initialize LangChain with OpenRouter (Claude Sonnet 4.5)
    const model = new ChatOpenAI({
      model: 'anthropic/claude-sonnet-4.5',
      temperature: 0.7,
      apiKey: process.env.OPENROUTER_API_KEY,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://betterai.tools',
          'X-Title': 'BetterAI Engine',
        },
      },
    });

    // Build prompts with enriched research context and enhanced formatting requirements
    const systemPrompt = buildSystemPrompt();
    const contextPrompt = buildContextPrompt(market, researchContext);

    // Prepare messages
    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(contextPrompt),
    ];

    logger.info({ experimentId: '005', marketId: market.id }, 'Invoking AI model with enhanced formatting requirements');

    // Invoke the model
    const response = await model.invoke(messages);

    // Parse the response - extract JSON and validate with Zod
    let predictionData: PredictionOutput;
    try {
      let content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

      // Remove markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        content = jsonMatch[1].trim();
      }

      // Try to parse as JSON
      const parsed = JSON.parse(content);

      // Validate with Zod schema
      predictionData = PredictionSchema.parse(parsed);
    } catch (parseError) {
      const parseErrorMessage = parseError instanceof Error ? parseError.message : String(parseError);
      logger.error(
        {
          experimentId: '005',
          marketId: market.id,
          error: parseErrorMessage,
          responseContent: response.content,
        },
        'Failed to parse or validate prediction response'
      );
      throw new Error(`Failed to parse prediction: ${parseErrorMessage}`);
    }

    logger.info(
      {
        experimentId: '005',
        marketId: market.id,
        outcome: predictionData.prediction.outcome,
        confidence: predictionData.prediction.confidence,
        probability: predictionData.prediction.probability,
      },
      'Structured prediction generated and validated with enhanced formatting'
    );

    // Calculate prediction delta
    const deltaResult = calculatePredictionDelta(
      market.outcomePrices,
      predictionData.prediction.probability
    );

    let predictionDelta: number | undefined;
    if (deltaResult.success && deltaResult.value !== undefined) {
      predictionDelta = deltaResult.value;
      logger.info(
        {
          experimentId: '005',
          marketId: market.id,
          delta: predictionDelta,
          marketPrice: market.outcomePrices,
          predictedProbability: predictionData.prediction.probability,
        },
        'Prediction delta calculated'
      );
    } else {
      logger.warn(
        {
          experimentId: '005',
          marketId: market.id,
          error: deltaResult.error,
        },
        'Failed to calculate prediction delta - will save prediction without delta'
      );
    }

    // Save prediction to database with enrichment metadata
    await savePrediction({
      marketId: market.id,
      experimentId: '005',
      prediction: {
        ...predictionData,
        enrichmentMetadata: {
          exaResearchSuccess: researchResult.success,
          numSources: researchResult.data?.contents.length || 0,
          totalCharacters: researchResult.data?.totalCharacters || 0,
          truncated: researchResult.data?.truncated || false,
          enhancedFormatting: true,
        },
      },
      rawRequest: {
        experimentId: '005',
        messages: messages.map(msg => ({
          role: msg._getType(),
          content: msg.content,
        })),
        model: 'anthropic/claude-sonnet-4.5',
        temperature: 0.7,
        enrichment: 'exa-ai-research',
        formatting: 'enhanced-structured',
      },
      rawResponse: response,
      model: 'anthropic/claude-sonnet-4.5',
      predictionDelta,
      promptTokens: response.response_metadata?.tokenUsage?.promptTokens,
      completionTokens: response.response_metadata?.tokenUsage?.completionTokens,
      researchContext,
    });

    return {
      success: true,
      data: {
        marketId: market.id,
        prediction: predictionData,
        predictionDelta,
        model: 'anthropic/claude-sonnet-4.5',
        rawRequest: {
          experimentId: '005',
          messages: messages.map(msg => ({
            role: msg._getType(),
            content: msg.content,
          })),
          model: 'anthropic/claude-sonnet-4.5',
          temperature: 0.7,
          enrichment: 'exa-ai-research',
          formatting: 'enhanced-structured',
        },
        rawResponse: response,
        promptTokens: response.response_metadata?.tokenUsage?.promptTokens,
        completionTokens: response.response_metadata?.tokenUsage?.completionTokens,
        researchContext,
        enrichment: {
          source: 'exa-ai',
          numSources: researchResult.data?.contents.length || 0,
          totalCharacters: researchResult.data?.totalCharacters || 0,
        },
        formatting: 'enhanced-structured',
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      { experimentId: '005', marketId: market.id, error: errorMessage },
      'Experiment 005 failed'
    );

    // Save failed prediction job
    await saveFailedPrediction(market.id, errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

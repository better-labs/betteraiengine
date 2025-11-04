import { logger } from '../../utils/logger.js';
import { MODEL_IDS } from '../../config/models.js';
import { PredictionSchema, type PredictionOutput } from './schemas.js';

export interface GeneratePredictionOptions {
  marketId: string;
  systemPrompt: string;
  contextPrompt: string;
  model?: string;
  temperature?: number;
}

export interface GeneratePredictionResult {
  success: boolean;
  prediction?: PredictionOutput;
  rawResponse?: any;
  error?: string;
}

/**
 * Generate a prediction by calling the AI model and parsing the response
 * Used by exp006 to generate structured predictions
 */
export async function generatePrediction(
  options: GeneratePredictionOptions
): Promise<GeneratePredictionResult> {
  const {
    marketId,
    systemPrompt,
    contextPrompt,
    model = MODEL_IDS.OPENAI_GPT_5,
    temperature = 0.7,
  } = options;

  try {
    logger.info(
      { experimentId: '006', marketId },
      'Invoking AI model with enhanced formatting requirements'
    );

    const apiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://betterai.tools',
        'X-Title': 'BetterAI Engine',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextPrompt },
        ],
        temperature,
      }),
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`OpenRouter API error: ${apiResponse.status} - ${errorText}`);
    }

    const response: any = await apiResponse.json();
    const messageContent = response.choices?.[0]?.message?.content || '';

    // Parse the response - extract JSON and validate with Zod
    let predictionData: PredictionOutput;
    try {
      let content = messageContent;

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
          experimentId: '006',
          marketId,
          error: parseErrorMessage,
          responseContent: messageContent,
        },
        'Failed to parse or validate prediction response'
      );
      throw new Error(`Failed to parse prediction: ${parseErrorMessage}`);
    }

    logger.info(
      {
        experimentId: '006',
        marketId,
        outcome: predictionData.outcome,
        confidence: predictionData.confidence,
        probability: predictionData.probability,
      },
      'Structured prediction generated and validated with enhanced formatting'
    );

    return {
      success: true,
      prediction: predictionData,
      rawResponse: response,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        experimentId: '006',
        marketId,
        error: errorMessage,
      },
      'Failed to generate prediction'
    );

    return {
      success: false,
      error: errorMessage,
    };
  }
}

import { z } from 'zod';

/**
 * Zod schema for structured prediction output
 * Flattened structure without marketId/question (provided by context)
 *
 * This is the single source of truth for the prediction schema.
 * The JSON format shown to the AI model is auto-generated from this schema.
 */
export const PredictionSchema = z.object({
  outcome: z.enum(['YES', 'NO', 'UNCERTAIN']).describe('Predicted outcome'),
  outcomeReasoning: z.string().min(10).describe('Detailed reasoning for the predicted outcome'),
  confidence: z.number().min(0).max(100).describe('Confidence level in prediction (0-100)'),
  confidenceReasoning: z.string().min(10).describe('Detailed reasoning for the confidence level'),
  probability: z.number().min(0).max(100).describe('Estimated probability of YES outcome (0-100)'),
  keyFactors: z.array(z.string()).min(1).describe('Key factors influencing the prediction'),
  dataQuality: z.enum(['HIGH', 'MEDIUM', 'LOW']).describe('Quality of available data for analysis'),
  lastUpdated: z.string().datetime().describe('ISO timestamp of prediction'),
});

export type PredictionOutput = z.infer<typeof PredictionSchema>;

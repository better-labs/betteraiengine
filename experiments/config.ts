import { ExperimentRegistry } from './types.js';

/**
 * Central registry of all experiments
 *
 * To add a new experiment:
 * 1. Create a new folder: experiments/expXXX/
 * 2. Create main.ts with a run() function
 * 3. Add configuration entry below
 * 4. Set enabled: true when ready to use
 */
export const experimentRegistry: ExperimentRegistry = {
  '001': {
    id: '001',
    name: 'Baseline OpenRouter Prediction',
    description: 'Baseline prediction experiment using OpenRouter (GPT-4) via LangChain. Sends market question and description to the model for analysis.',
    version: '1.0.0',
    author: 'BetterAI Team',
    enabled: true,
    tags: ['baseline', 'openrouter', 'gpt-4', 'langchain'],
    createdAt: '2025-10-05',
    updatedAt: '2025-10-05',
    loader: () => import('./exp001/main.js'),
  },

  // Example: Future experiment (disabled)
  // '002': {
  //   id: '002',
  //   name: 'Advanced Multi-Model Ensemble',
  //   description: 'Combines predictions from multiple models using weighted ensemble.',
  //   version: '1.0.0',
  //   author: 'BetterAI Team',
  //   enabled: false,
  //   tags: ['ensemble', 'advanced', 'multi-model'],
  //   createdAt: '2025-10-06',
  //   loader: () => import('./exp002/main.js'),
  // },
};

/**
 * Get list of all experiment IDs
 */
export function getExperimentIds(): string[] {
  return Object.keys(experimentRegistry);
}

/**
 * Get list of enabled experiment IDs
 */
export function getEnabledExperimentIds(): string[] {
  return Object.keys(experimentRegistry).filter(id => experimentRegistry[id].enabled);
}

/**
 * Get metadata for a specific experiment
 */
export function getExperimentMetadata(experimentId: string) {
  const config = experimentRegistry[experimentId];
  if (!config) {
    return null;
  }

  // Return metadata without the loader function
  const { loader, ...metadata } = config;
  return metadata;
}

/**
 * Get metadata for all experiments
 */
export function getAllExperimentMetadata() {
  return getExperimentIds().map(id => getExperimentMetadata(id)).filter(Boolean);
}

/**
 * Check if an experiment exists and is enabled
 */
export function isExperimentAvailable(experimentId: string): boolean {
  const config = experimentRegistry[experimentId];
  return Boolean(config && config.enabled);
}

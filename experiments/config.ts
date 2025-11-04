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
  '006': {
    id: '006',
    name: 'Experiment 006',
    description: 'New experiment based on exp005 with enhanced formatting.',
    version: '1.0.0',
    author: 'BetterAI Team',
    enabled: true,
    tags: ['claude', 'sonnet-4.5', 'exa-ai', 'grok-ai', 'dual-source', 'web-research', 'enrichment', 'structured-output', 'zod', 'delta', 'enhanced-formatting'],
    createdAt: '2025-11-04',
    updatedAt: '2025-11-04',
    loader: () => import('./exp006/main.js'),
  },
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

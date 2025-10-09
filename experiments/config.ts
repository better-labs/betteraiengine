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
  '003': {
    id: '003',
    name: 'Claude Sonnet 4.5 Separated Reasoning',
    description: 'Builds on exp002 with separated reasoning fields: outcomeReasoning (why YES/NO/UNCERTAIN) and confidenceReasoning (why specific confidence level).',
    version: '1.0.0',
    author: 'BetterAI Team',
    enabled: true,
    tags: ['claude', 'sonnet-4.5', 'structured-output', 'zod', 'delta', 'separated-reasoning'],
    createdAt: '2025-10-07',
    updatedAt: '2025-10-07',
    loader: () => import('./exp003/main.js'),
  },

  '004': {
    id: '004',
    name: 'Exa AI Web Research Enrichment',
    description: 'Enriches predictions with real-time web research data from Exa AI. Uses Search + Contents APIs to gather relevant sources, then passes enriched context to Claude Sonnet 4.5 for structured prediction with source citations.',
    version: '1.0.0',
    author: 'BetterAI Team',
    enabled: true,
    tags: ['claude', 'sonnet-4.5', 'exa-ai', 'web-research', 'enrichment', 'structured-output', 'zod', 'delta'],
    createdAt: '2025-10-07',
    updatedAt: '2025-10-07',
    loader: () => import('./exp004/main.js'),
  },

  '005': {
    id: '005',
    name: 'Dual-Source Research with Enhanced Formatting',
    description: 'Dual-source web research (Exa AI + Grok AI) with enhanced formatting. Removes LangChain for direct API calls, implements parallel research fetching, and passes market context for improved search accuracy.',
    version: '2.0.0',
    author: 'BetterAI Team',
    enabled: true,
    tags: ['claude', 'sonnet-4.5', 'exa-ai', 'grok-ai', 'dual-source', 'web-research', 'enrichment', 'structured-output', 'zod', 'delta', 'enhanced-formatting', 'no-langchain'],
    createdAt: '2025-01-15',
    updatedAt: '2025-06-17',
    loader: () => import('./exp005/main.js'),
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

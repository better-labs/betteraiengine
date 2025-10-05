import { PolymarketMarket } from '../services/polymarket.js';

/**
 * Result returned by an experiment
 */
export interface ExperimentResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Core interface that all experiments must implement
 */
export interface ExperimentModule {
  run(market: PolymarketMarket): Promise<ExperimentResult>;
}

/**
 * Metadata about an experiment
 */
export interface ExperimentMetadata {
  /** Unique experiment ID (e.g., "001") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Detailed description of what the experiment does */
  description: string;
  /** Version string (semver recommended) */
  version: string;
  /** Author name or team */
  author?: string;
  /** Whether this experiment is enabled and can be run */
  enabled: boolean;
  /** Tags for categorization */
  tags?: string[];
  /** Date the experiment was created */
  createdAt?: string;
  /** Date the experiment was last modified */
  updatedAt?: string;
}

/**
 * Configuration entry for an experiment
 */
export interface ExperimentConfig extends ExperimentMetadata {
  /** Async loader function that imports the experiment module */
  loader: () => Promise<ExperimentModule>;
}

/**
 * Registry of all available experiments
 */
export type ExperimentRegistry = Record<string, ExperimentConfig>;

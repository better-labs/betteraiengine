import { logger } from '../../utils/logger.js';
import { PolymarketMarket } from '../../services/polymarket.js';
import {
  performExaResearch,
  formatExaResearchContext,
} from '../../services/exa-research.js';
import {
  performGrokSearch,
  formatGrokSearchContext,
} from '../../services/grok-search.js';

export interface ResearchResult {
  success: boolean;
  researchContext: string;
  metadata: {
    exaSuccess: boolean;
    grokSuccess: boolean;
    exaSources: number;
    grokSources: number;
    exaCharacters: number;
    grokCharacters: number;
  };
  error?: string;
}

/**
 * Perform parallel web research using Exa AI and Grok
 * Used by exp006 to gather context for market predictions
 */
export async function performMarketResearch(
  market: PolymarketMarket
): Promise<ResearchResult> {
  try {
    logger.info(
      { experimentId: '006', marketId: market.id, question: market.question },
      'Fetching web research data from Exa AI and Grok'
    );

    // Build market context for enhanced research
    const events = market.events as any[] | undefined;
    const marketContext = {
      question: market.question,
      description: market.description,
      closeTime: market.endDate ? String(market.endDate) : undefined,
      eventTitle: events?.[0]?.title || market.groupItemTitle,
    };

    const [exaResult, grokResult] = await Promise.all([
      performExaResearch({
        query: market.question,
        numResults: 10,
        useAutoprompt: true,
        type: 'neural',
        market: marketContext,
        contents: {
          text: { maxCharacters: 1500 },
          highlights: { numSentences: 3, highlightsPerUrl: 3 },
          summary: true,
        },
      }),
      performGrokSearch({
        query: market.question,
        maxResults: 10,
        market: marketContext,
      }),
    ]);

    // Format research contexts
    const exaContext = exaResult.success && exaResult.data
      ? formatExaResearchContext(exaResult.data.contents)
      : '';

    const grokContext = grokResult.success && grokResult.data
      ? formatGrokSearchContext(grokResult.data.results)
      : '';

    // Merge research contexts
    const researchParts: string[] = [];
    if (exaContext) researchParts.push(exaContext);
    if (grokContext) researchParts.push(grokContext);

    const researchContext = researchParts.length > 0
      ? researchParts.join('\n\n---\n\n')
      : 'No additional research data available due to API errors.';

    const metadata = {
      exaSuccess: exaResult.success,
      grokSuccess: grokResult.success,
      exaSources: exaResult.data?.contents.length || 0,
      grokSources: grokResult.data?.results.length || 0,
      exaCharacters: exaResult.data?.totalCharacters || 0,
      grokCharacters: grokResult.data?.totalCharacters || 0,
    };

    logger.info(
      {
        experimentId: '006',
        marketId: market.id,
        ...metadata,
      },
      'Web research data prepared from multiple sources'
    );

    return {
      success: true,
      researchContext,
      metadata,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        experimentId: '006',
        marketId: market.id,
        error: errorMessage,
      },
      'Failed to perform market research'
    );

    return {
      success: false,
      researchContext: 'No additional research data available due to API errors.',
      metadata: {
        exaSuccess: false,
        grokSuccess: false,
        exaSources: 0,
        grokSources: 0,
        exaCharacters: 0,
        grokCharacters: 0,
      },
      error: errorMessage,
    };
  }
}

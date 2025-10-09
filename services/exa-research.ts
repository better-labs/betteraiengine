import { logger } from '../utils/logger.js';

/**
 * Exa AI Research Service
 * Provides web research capabilities using Exa AI's Search and Contents APIs
 */

export interface ExaSearchResult {
  id: string;
  url: string;
  title: string;
  publishedDate?: string;
  author?: string;
  score?: number;
}

export interface ExaContentResult {
  url: string;
  title: string;
  text?: string;
  summary?: string;
  highlights?: string[];
  publishedDate?: string;
  author?: string;
}

export interface ExaResearchOptions {
  query: string;
  numResults?: number;
  useAutoprompt?: boolean;
  type?: 'neural' | 'keyword';
  market?: {
    question: string;
    description?: string;
    closeTime?: string;
    eventTitle?: string;
  };
  contents?: {
    text?: boolean | { maxCharacters?: number };
    highlights?: boolean | { numSentences?: number; highlightsPerUrl?: number };
    summary?: boolean | { query?: string };
  };
}

export interface ExaResearchResult {
  success: boolean;
  data?: {
    searchResults: ExaSearchResult[];
    contents: ExaContentResult[];
    totalCharacters: number;
    truncated: boolean;
  };
  error?: string;
}

interface ExaSearchApiContent {
  text?: string;
  summary?: string;
  highlights?: unknown;
  publishedDate?: string;
  author?: string;
}

interface ExaSearchApiResult {
  id: string;
  url: string;
  title: string;
  publishedDate?: string;
  author?: string;
  score?: number;
  text?: unknown;
  summary?: unknown;
  highlights?: unknown;
  contents?: ExaSearchApiContent;
  content?: ExaSearchApiContent;
}

interface ExaSearchResponse {
  results?: ExaSearchApiResult[];
}

const EXA_API_BASE = 'https://api.exa.ai';
const MAX_CHARACTERS = 25000; // Half of total 50K budget, sharing with Grok
const DEFAULT_NUM_RESULTS = 8; // Default number of search results to return
const DEFAULT_TEXT_MAX_CHARS = 1000; // Max characters per result text content
const STRING_FALLBACK_KEYS = ['text', 'summary', 'content', 'snippet', 'value'];

function extractString(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    const joined = value
      .map(item => (typeof item === 'string' ? item : extractString(item)))
      .filter((item): item is string => Boolean(item))
      .join(' ')
      .trim();
    return joined.length > 0 ? joined : undefined;
  }

  if (typeof value === 'object') {
    for (const key of STRING_FALLBACK_KEYS) {
      const candidate = (value as Record<string, unknown>)[key];
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
    }
  }

  return undefined;
}

function extractHighlights(highlights: unknown): string[] | undefined {
  if (!highlights) {
    return undefined;
  }

  if (typeof highlights === 'string') {
    return [highlights];
  }

  if (!Array.isArray(highlights)) {
    const single = extractString(highlights);
    return single ? [single] : undefined;
  }

  const normalized = highlights
    .map(item => {
      if (typeof item === 'string') {
        return item;
      }
      if (item && typeof item === 'object') {
        return extractString(item);
      }
      return undefined;
    })
    .filter((item): item is string => Boolean(item && item.trim().length));

  return normalized.length > 0 ? normalized : undefined;
}

/**
 * Perform web research using Exa AI's Search + Contents APIs
 */
export async function performExaResearch(options: ExaResearchOptions): Promise<ExaResearchResult> {
  const apiKey = process.env.EXA_API_KEY;

  if (!apiKey) {
    logger.error('EXA_API_KEY not found in environment variables');
    return {
      success: false,
      error: 'EXA_API_KEY not configured',
    };
  }

  try {
    const {
      query,
      numResults = DEFAULT_NUM_RESULTS,
      useAutoprompt = true,
      type = 'neural',
      market,
      contents: contentsConfig = {
        text: { maxCharacters: DEFAULT_TEXT_MAX_CHARS },
        highlights: { numSentences: 3, highlightsPerUrl: 3 },
        summary: true,
      },
    } = options;

    logger.info({ query, numResults, type, hasMarketContext: !!market }, 'Starting Exa AI research');

    // Build enhanced query with market context for better autoprompt results
    let enhancedQuery = query;
    if (market && useAutoprompt) {
      enhancedQuery = `${query}`;
      if (market.eventTitle) {
        enhancedQuery += ` (${market.eventTitle})`;
      }
      if (market.description) {
        // Add key resolution criteria keywords to improve search relevance
        enhancedQuery += `. Resolution: ${market.description.substring(0, 200)}`;
      }
    }

    // Build the search request with contents and optional date filtering
    const searchPayload: any = {
      query: enhancedQuery,
      numResults,
      useAutoprompt,
      type,
      contents: contentsConfig,
      // Exclude Polymarket to avoid circular references (searching for external information)
      excludeDomains: ['polymarket.com'],
    };

    // Add date filtering if market has closeTime
    if (market?.closeTime) {
      const closeDate = new Date(market.closeTime);
      if (!isNaN(closeDate.getTime())) {
        // Search for content published before market close time
        searchPayload.endPublishedDate = closeDate.toISOString();
        logger.info({ endPublishedDate: searchPayload.endPublishedDate }, 'Using date filter for Exa search');
      }
    }

    // Call Exa Search API with contents parameter
    const response = await fetch(`${EXA_API_BASE}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(searchPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { status: response.status, error: errorText },
        'Exa AI search request failed'
      );
      return {
        success: false,
        error: `Exa AI API error: ${response.status} - ${errorText}`,
      };
    }

    const data = (await response.json()) as ExaSearchResponse;
    const results = data.results ?? [];

    // Extract search results
    const searchResults: ExaSearchResult[] = results.map(result => ({
      id: result.id,
      url: result.url,
      title: result.title,
      publishedDate: result.publishedDate,
      author: result.author,
      score: result.score,
    }));

    // Extract contents
    const contentResults: ExaContentResult[] = results.map(result => {
      const resultContents = result.contents ?? result.content ?? {};

      return {
        url: result.url,
        title: result.title || 'Untitled Source',
        text: extractString(result.text ?? resultContents.text),
        summary: extractString(result.summary ?? resultContents.summary),
        highlights: extractHighlights(result.highlights ?? resultContents.highlights),
        publishedDate: result.publishedDate ?? resultContents.publishedDate,
        author: result.author ?? resultContents.author,
      };
    });

    // Calculate total characters and truncate if needed
    let totalCharacters = 0;
    let truncated = false;
    const truncatedContents: ExaContentResult[] = [];

    for (const content of contentResults) {
      const segments = [
        content.title,
        content.summary,
        content.text,
        content.highlights?.join(' '),
      ].filter((segment): segment is string => Boolean(segment));

      const contentLength = segments.join(' ').length;

      if (totalCharacters + contentLength <= MAX_CHARACTERS) {
        truncatedContents.push(content);
        totalCharacters += contentLength;
      } else {
        truncated = true;
        logger.warn(
          { totalCharacters, maxCharacters: MAX_CHARACTERS },
          'Content truncated to stay within token limits'
        );
        break;
      }
    }

    logger.info(
      {
        numResults: searchResults.length,
        numContents: truncatedContents.length,
        totalCharacters,
        truncated,
      },
      'Exa AI research completed'
    );

    return {
      success: true,
      data: {
        searchResults,
        contents: truncatedContents,
        totalCharacters,
        truncated,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, 'Exa AI research failed');

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Format Exa research results into a readable context string for AI models
 */
export function formatExaResearchContext(contents: ExaContentResult[]): string {
  if (contents.length === 0) {
    return 'No additional research data available.';
  }

  const sections = contents.map((content, index) => {
    const parts: string[] = [];

    parts.push(`## Source ${index + 1}: ${content.title}`);
    parts.push(`URL: ${content.url}`);

    if (content.publishedDate) {
      parts.push(`Published: ${content.publishedDate}`);
    }

    if (content.author) {
      parts.push(`Author: ${content.author}`);
    }

    if (content.summary) {
      parts.push(`\n### Summary\n${content.summary}`);
    }

    if (content.highlights && content.highlights.length > 0) {
      parts.push(
        `\n### Key Highlights\n${content.highlights
          .map(highlight => `- ${highlight.trim()}`)
          .join('\n')}`
      );
    }

    if (content.text) {
      parts.push(`\n### Content\n${content.text}`);
    }

    return parts.join('\n');
  });

  return `# Web Research Data\n\nThe following information was gathered from web research to provide context for this prediction:\n\n${sections.join('\n\n---\n\n')}`;
}

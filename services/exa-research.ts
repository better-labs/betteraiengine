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

const EXA_API_BASE = 'https://api.exa.ai';
const MAX_CHARACTERS = 200000; // ~50k tokens limit

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
      numResults = 8,
      useAutoprompt = true,
      type = 'neural',
      contents = {
        text: { maxCharacters: 2000 },
        highlights: { numSentences: 3, highlightsPerUrl: 3 },
        summary: true,
      },
    } = options;

    logger.info({ query, numResults, type }, 'Starting Exa AI research');

    // Build the search request with contents
    const searchPayload = {
      query,
      numResults,
      useAutoprompt,
      type,
      contents,
    };

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

    const data = await response.json();

    // Extract search results
    const searchResults: ExaSearchResult[] = (data.results || []).map((result: any) => ({
      id: result.id,
      url: result.url,
      title: result.title,
      publishedDate: result.publishedDate,
      author: result.author,
      score: result.score,
    }));

    // Extract contents
    const contents: ExaContentResult[] = (data.results || []).map((result: any) => ({
      url: result.url,
      title: result.title,
      text: result.text,
      summary: result.summary,
      highlights: result.highlights,
      publishedDate: result.publishedDate,
      author: result.author,
    }));

    // Calculate total characters and truncate if needed
    let totalCharacters = 0;
    let truncated = false;
    const truncatedContents: ExaContentResult[] = [];

    for (const content of contents) {
      const contentText = [
        content.title,
        content.summary,
        content.text,
        ...(content.highlights || []),
      ]
        .filter(Boolean)
        .join(' ');

      const contentLength = contentText.length;

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
      parts.push(`\n### Key Highlights\n${content.highlights.map(h => `- ${h}`).join('\n')}`);
    }

    if (content.text) {
      parts.push(`\n### Content\n${content.text}`);
    }

    return parts.join('\n');
  });

  return `# Web Research Data\n\nThe following information was gathered from web research to provide context for this prediction:\n\n${sections.join('\n\n---\n\n')}`;
}

import { logger } from '../utils/logger.js';

/**
 * Grok Search Service
 * Provides web search capabilities using Grok AI via OpenRouter with real-time web access
 */

export interface GrokSearchResult {
  url: string;
  title: string;
  snippet?: string;
  publishedDate?: string;
  source?: string;
}

export interface GrokSearchOptions {
  query: string;
  maxResults?: number;
}

export interface GrokSearchResponse {
  success: boolean;
  data?: {
    results: GrokSearchResult[];
    totalCharacters: number;
    truncated: boolean;
  };
  error?: string;
}

const MAX_CHARACTERS = 25000; // Half of total 50K budget, sharing with Exa

/**
 * Perform web search using Grok via OpenRouter
 */
export async function performGrokSearch(options: GrokSearchOptions): Promise<GrokSearchResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    logger.error('OPENROUTER_API_KEY not found in environment variables');
    return {
      success: false,
      error: 'OPENROUTER_API_KEY not configured',
    };
  }

  try {
    const { query, maxResults = 10 } = options;

    logger.info({ query, maxResults }, 'Starting Grok web search via OpenRouter');

    // Call OpenRouter with Grok model for web search with real-time data
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://betterai.tools',
        'X-Title': 'BetterAI Engine',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: `Perform a comprehensive web search to find the latest information about: "${query}"

Search for the most recent, relevant information including:
- Latest news and developments
- Current data and statistics
- Expert opinions and analysis
- Recent discussions and trends
- Official announcements or statements

Return up to ${maxResults} high-quality results formatted as a JSON array. Each result must include:
- url: The source URL
- title: Headline or title
- snippet: Brief excerpt or summary (2-3 sentences)
- publishedDate: Date if available (ISO format preferred)
- source: Publication or website name

Respond ONLY with a valid JSON array, no additional text or markdown formatting.`,
          },
        ],
        model: 'x-ai/grok-3-mini',
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { status: response.status, error: errorText },
        'Grok search request failed'
      );
      return {
        success: false,
        error: `Grok API error: ${response.status} - ${errorText}`,
      };
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      logger.error('No content in Grok response');
      return {
        success: false,
        error: 'No content returned from Grok API',
      };
    }

    // Parse the JSON response from Grok
    let results: GrokSearchResult[] = [];
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      const jsonContent = jsonMatch ? jsonMatch[1].trim() : content;
      const parsed = JSON.parse(jsonContent);
      results = Array.isArray(parsed) ? parsed : parsed.results || [];
    } catch (parseError) {
      logger.warn({ parseError, content }, 'Failed to parse Grok JSON response');
      // Fallback: try to extract URLs and titles from text
      results = extractResultsFromText(content);
    }

    // Calculate total characters and truncate if needed
    let totalCharacters = 0;
    let truncated = false;
    const truncatedResults: GrokSearchResult[] = [];

    for (const result of results) {
      const resultLength =
        (result.title?.length || 0) +
        (result.snippet?.length || 0) +
        (result.url?.length || 0) +
        (result.publishedDate?.length || 0) +
        (result.source?.length || 0);

      if (totalCharacters + resultLength <= MAX_CHARACTERS) {
        truncatedResults.push(result);
        totalCharacters += resultLength;
      } else {
        truncated = true;
        logger.warn(
          { totalCharacters, maxCharacters: MAX_CHARACTERS },
          'Grok results truncated to stay within character limits'
        );
        break;
      }
    }

    logger.info(
      {
        numResults: truncatedResults.length,
        totalCharacters,
        truncated,
      },
      'Grok search completed'
    );

    return {
      success: true,
      data: {
        results: truncatedResults,
        totalCharacters,
        truncated,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, 'Grok search failed');

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Fallback: Extract search results from unstructured text
 */
function extractResultsFromText(text: string): GrokSearchResult[] {
  const results: GrokSearchResult[] = [];

  // Simple pattern matching for URLs and surrounding context
  const urlPattern = /https?:\/\/[^\s<>"]+/g;
  const urls = text.match(urlPattern) || [];

  for (const url of urls.slice(0, 10)) {
    results.push({
      url,
      title: `Search result: ${url.split('/')[2] || url}`,
      snippet: 'No snippet available',
    });
  }

  return results;
}

/**
 * Format Grok search results into a readable context string for AI models
 */
export function formatGrokSearchContext(results: GrokSearchResult[]): string {
  if (results.length === 0) {
    return 'No Grok search results available.';
  }

  const sections = results.map((result, index) => {
    const parts: string[] = [];

    parts.push(`## Result ${index + 1}: ${result.title}`);
    parts.push(`URL: ${result.url}`);

    if (result.source) {
      parts.push(`Source: ${result.source}`);
    }

    if (result.publishedDate) {
      parts.push(`Published: ${result.publishedDate}`);
    }

    if (result.snippet) {
      parts.push(`\n${result.snippet}`);
    }

    return parts.join('\n');
  });

  return `# Grok Web Search Results\n\nThe following search results provide additional real-time context:\n\n${sections.join('\n\n---\n\n')}`;
}

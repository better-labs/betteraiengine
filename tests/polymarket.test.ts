import { describe, it, expect } from 'vitest';
import { fetchEventBySlug, fetchMarketBySlug } from '../services/polymarket.js';

describe('Polymarket API', () => {
  describe('fetchMarketBySlug', () => {
    it('should fetch a market by slug and return valid data', async () => {
      // Using a known market slug from the Polymarket API
      const marketSlug = 'will-joe-biden-get-coronavirus-before-the-election';

      const market = await fetchMarketBySlug(marketSlug);

      expect(market).toBeDefined();
      expect(market.id).toBeDefined();
      expect(market.slug).toBe(marketSlug);
      expect(market.question).toBeDefined();
      expect(market.conditionId).toBeDefined();
      expect(typeof market.id).toBe('string');
      expect(typeof market.question).toBe('string');
    });

    it('should fetch Georgia Tech 2026 Championship market', async () => {
      const marketSlug = 'will-georgia-tech-win-the-2026-college-football-national-championship';

      const market = await fetchMarketBySlug(marketSlug);

      expect(market).toBeDefined();
      expect(market.id).toBeDefined();
      expect(market.slug).toBe(marketSlug);
      expect(market.question).toContain('Georgia Tech');
      expect(market.conditionId).toBeDefined();
    });
  });

});

import { TrieMatcher } from './pattern-matcher.layer';

describe('TrieMatcher', () => {
  let matcher: TrieMatcher;

  beforeEach(() => {
    matcher = new TrieMatcher();
  });

  describe('addTerm / size', () => {
    it('should report correct size after adding terms', () => {
      matcher.addTerm('porn', { category: 'adult', severity: 'SEVERE' });
      matcher.addTerm('drugs', { category: 'drugs', severity: 'MODERATE' });
      expect(matcher.size).toBe(2);
    });

    it('should not double-count the same term added twice', () => {
      matcher.addTerm('porn', { category: 'adult', severity: 'SEVERE' });
      matcher.addTerm('porn', { category: 'adult', severity: 'SEVERE' });
      expect(matcher.size).toBe(1);
    });
  });

  describe('clear()', () => {
    it('should empty the trie and reset size', () => {
      matcher.addTerm('porn', { category: 'adult', severity: 'SEVERE' });
      matcher.addTerm('drugs', { category: 'drugs', severity: 'MODERATE' });
      matcher.clear();
      expect(matcher.size).toBe(0);
      expect(matcher.match('porn drugs')).toEqual([]);
    });
  });

  describe('match()', () => {
    it('should return empty array for empty text', () => {
      matcher.addTerm('porn', { category: 'adult', severity: 'SEVERE' });
      expect(matcher.match('')).toEqual([]);
    });

    it('should return empty array for clean text', () => {
      matcher.addTerm('porn', { category: 'adult', severity: 'SEVERE' });
      expect(matcher.match('this is a perfectly clean sentence')).toEqual([]);
    });

    it('should match exact single-word term', () => {
      matcher.addTerm('porn', { category: 'adult', severity: 'SEVERE' });
      const results = matcher.match('buy porn here');
      expect(results).toHaveLength(1);
      expect(results[0].term).toBe('porn');
      expect(results[0].category).toBe('adult');
      expect(results[0].severity).toBe('SEVERE');
    });

    it('should track position correctly for single-word match', () => {
      matcher.addTerm('porn', { category: 'adult', severity: 'SEVERE' });
      const results = matcher.match('buy porn here');
      // 'buy ' is 4 chars, 'porn' starts at 4, ends at 7
      expect(results[0].position.start).toBe(4);
      expect(results[0].position.end).toBe(7);
    });

    it('should find term as substring (porn inside pornography)', () => {
      matcher.addTerm('porn', { category: 'adult', severity: 'SEVERE' });
      const results = matcher.match('watching pornography');
      expect(results).toHaveLength(1);
      expect(results[0].term).toBe('porn');
      expect(results[0].position.start).toBe(9);
      expect(results[0].position.end).toBe(12);
    });

    it('should match multi-word term with exact sequence', () => {
      matcher.addTerm('sex toy', { category: 'adult', severity: 'MODERATE' });
      const results = matcher.match('selling a sex toy here');
      expect(results).toHaveLength(1);
      expect(results[0].term).toBe('sex toy');
      expect(results[0].position.start).toBe(10);
      expect(results[0].position.end).toBe(16);
    });

    it('should not match partial multi-word term', () => {
      matcher.addTerm('sex toy', { category: 'adult', severity: 'MODERATE' });
      const results = matcher.match('this is about sex education');
      expect(results).toHaveLength(0);
    });

    it('should return multiple matches in one text', () => {
      matcher.addTerm('porn', { category: 'adult', severity: 'SEVERE' });
      matcher.addTerm('drugs', { category: 'drugs', severity: 'MODERATE' });
      const results = matcher.match('no porn and no drugs allowed');
      expect(results).toHaveLength(2);
      const terms = results.map((r) => r.term);
      expect(terms).toContain('porn');
      expect(terms).toContain('drugs');
    });

    it('should match same term at multiple positions', () => {
      matcher.addTerm('bad', { category: 'profanity', severity: 'MILD' });
      const results = matcher.match('bad is bad');
      expect(results).toHaveLength(2);
      expect(results[0].position.start).toBe(0);
      expect(results[1].position.start).toBe(7);
    });

    it('should be case insensitive', () => {
      matcher.addTerm('porn', { category: 'adult', severity: 'SEVERE' });
      const results = matcher.match('Watching PORNOGRAPHY is wrong');
      expect(results).toHaveLength(1);
      expect(results[0].term).toBe('porn');
    });

    it('should deduplicate overlapping matches at the same position', () => {
      matcher.addTerm('porn', { category: 'adult', severity: 'SEVERE' });
      const results = matcher.match('porn porn');
      expect(results).toHaveLength(2);
      // positions must differ
      expect(results[0].position.start).not.toBe(results[1].position.start);
    });
  });

  describe('performance', () => {
    it('should build a trie from 5000 terms in under 100ms', () => {
      const start = Date.now();
      for (let i = 0; i < 5000; i++) {
        matcher.addTerm(`term${i}`, { category: 'profanity', severity: 'MILD' });
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
      expect(matcher.size).toBe(5000);
    });

    it('should match against 500-char text in under 2ms after large trie', () => {
      for (let i = 0; i < 5000; i++) {
        matcher.addTerm(`term${i}`, { category: 'profanity', severity: 'MILD' });
      }
      // plant one real match
      matcher.addTerm('porn', { category: 'adult', severity: 'SEVERE' });

      const filler = 'clean text without matches ';
      const base = filler.repeat(20);
      // embed 'porn' at a known position well within 500 chars, then pad to 500
      const text = (base.slice(0, 480) + 'porn' + '......').slice(0, 500);
      const start = Date.now();
      const results = matcher.match(text);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(2);
      expect(results.some((r) => r.term === 'porn')).toBe(true);
    });
  });
});

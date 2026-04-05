import { scoreSeverity } from './severity-scorer.layer';
import { MatchResult } from './pattern-matcher.layer';

function makeMatch(
  term: string,
  category: string,
  severity: string,
  start = 0,
): MatchResult {
  return { term, category, severity, position: { start, end: start + term.length - 1 } };
}

describe('scoreSeverity', () => {
  it('no matches → clean=true, NONE, ALLOW, empty message', () => {
    const result = scoreSeverity([]);
    expect(result.clean).toBe(true);
    expect(result.severity).toBe('NONE');
    expect(result.action).toBe('ALLOW');
    expect(result.matches).toEqual([]);
    expect(result.userMessage).toBe('');
  });

  it('single SEVERE match → REJECT with generic message', () => {
    const matches = [makeMatch('badword', 'hate_speech', 'SEVERE')];
    const result = scoreSeverity(matches);
    expect(result.clean).toBe(false);
    expect(result.severity).toBe('SEVERE');
    expect(result.action).toBe('REJECT');
    expect(result.userMessage).toBe(
      'Content violates our community guidelines. Please revise.',
    );
  });

  it('single MODERATE match → FLAG with category-specific message', () => {
    const matches = [makeMatch('someterm', 'adult', 'MODERATE')];
    const result = scoreSeverity(matches);
    expect(result.clean).toBe(false);
    expect(result.severity).toBe('MODERATE');
    expect(result.action).toBe('FLAG');
    expect(result.userMessage).toContain('adult');
    expect(result.userMessage).toContain('reviewed before publishing');
  });

  it('single MILD match → ALLOW, clean=false, no message', () => {
    const matches = [makeMatch('mildterm', 'profanity', 'MILD')];
    const result = scoreSeverity(matches);
    expect(result.clean).toBe(false);
    expect(result.severity).toBe('MILD');
    expect(result.action).toBe('ALLOW');
    expect(result.userMessage).toBe('');
  });

  it('mixed MILD + SEVERE → highest wins → SEVERE / REJECT', () => {
    const matches = [
      makeMatch('mildterm', 'profanity', 'MILD', 0),
      makeMatch('severeterm', 'hate_speech', 'SEVERE', 10),
    ];
    const result = scoreSeverity(matches);
    expect(result.severity).toBe('SEVERE');
    expect(result.action).toBe('REJECT');
  });

  it('multiple MODERATE categories → message lists all categories', () => {
    const matches = [
      makeMatch('term1', 'adult', 'MODERATE', 0),
      makeMatch('term2', 'drugs', 'MODERATE', 10),
      makeMatch('term3', 'adult', 'MODERATE', 20), // duplicate category — should appear once
    ];
    const result = scoreSeverity(matches);
    expect(result.severity).toBe('MODERATE');
    expect(result.action).toBe('FLAG');
    expect(result.userMessage).toContain('adult');
    expect(result.userMessage).toContain('drugs');
    // "adult" should appear only once in the categories list
    const categoriesPart = result.userMessage.match(/'([^']+)'/)?.[1] ?? '';
    const parts = categoriesPart.split(', ');
    expect(parts.filter((p) => p === 'adult').length).toBe(1);
  });

  it('matches array is passed through to result', () => {
    const matches = [
      makeMatch('term', 'scam', 'MILD', 5),
    ];
    const result = scoreSeverity(matches);
    expect(result.matches).toBe(matches);
  });
});

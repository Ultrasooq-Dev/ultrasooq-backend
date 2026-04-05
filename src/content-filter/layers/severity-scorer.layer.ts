import { MatchResult } from './pattern-matcher.layer';

export interface ScoredResult {
  clean: boolean;
  severity: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE';
  action: 'ALLOW' | 'FLAG' | 'REJECT';
  matches: MatchResult[];
  userMessage: string;
}

const SEVERITY_RANK: Record<string, number> = {
  NONE: 0,
  MILD: 1,
  MODERATE: 2,
  SEVERE: 3,
};

function topSeverity(matches: MatchResult[]): 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE' {
  let top: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE' = 'NONE';
  for (const m of matches) {
    const sev = m.severity as 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE';
    if (SEVERITY_RANK[sev] > SEVERITY_RANK[top]) {
      top = sev;
    }
  }
  return top;
}

export function scoreSeverity(matches: MatchResult[]): ScoredResult {
  if (matches.length === 0) {
    return {
      clean: true,
      severity: 'NONE',
      action: 'ALLOW',
      matches: [],
      userMessage: '',
    };
  }

  const severity = topSeverity(matches);

  if (severity === 'SEVERE') {
    return {
      clean: false,
      severity: 'SEVERE',
      action: 'REJECT',
      matches,
      userMessage: 'Content violates our community guidelines. Please revise.',
    };
  }

  if (severity === 'MODERATE') {
    const categories = [
      ...new Set(
        matches
          .filter((m) => m.severity === 'MODERATE')
          .map((m) => m.category),
      ),
    ].join(', ');

    return {
      clean: false,
      severity: 'MODERATE',
      action: 'FLAG',
      matches,
      userMessage: `Your submission contains content flagged as '${categories}'. It will be reviewed before publishing.`,
    };
  }

  // MILD
  return {
    clean: false,
    severity: 'MILD',
    action: 'ALLOW',
    matches,
    userMessage: '',
  };
}

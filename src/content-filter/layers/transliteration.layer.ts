/**
 * Layer 3 — Arabic Transliteration
 *
 * Maps Latin-scripted Arabic slang/profanity to Arabic script equivalents.
 * Returns the original text plus any Arabic variants found as substrings.
 */

interface TransliterationRule {
  /** Latin patterns to detect (case-insensitive substrings) */
  patterns: string[];
  /** Arabic script equivalents to include in the output variants */
  arabic: string[];
}

const RULES: TransliterationRule[] = [
  {
    patterns: ['sharmouta', 'sharmota', 'sharmout'],
    arabic: ['شرموطة', 'شرموط'],
  },
  {
    patterns: ['kos', 'koss'],
    arabic: ['كس'],
  },
  {
    patterns: ['zeb', 'zebi'],
    arabic: ['زب', 'زبي'],
  },
  {
    patterns: ['manyak', 'manyok'],
    arabic: ['منيك', 'منياك', 'منيوك'],
  },
  {
    patterns: ['teez', 'tiz'],
    arabic: ['طيز'],
  },
  {
    patterns: ['a7a', 'aha'],
    arabic: ['احا'],
  },
  {
    patterns: ['ya kalb'],
    arabic: ['يا كلب'],
  },
  {
    patterns: ['ya 7mar', 'ya hmar'],
    arabic: ['يا حمار'],
  },
  {
    patterns: ['khara', 'khra'],
    arabic: ['خرا', 'خره'],
  },
  {
    patterns: ['hashish', '7ashish'],
    arabic: ['حشيش'],
  },
  {
    patterns: ['mokhadarat'],
    arabic: ['مخدرات'],
  },
  {
    patterns: ['ibn el sharmouta'],
    arabic: ['ابن الشرموطة'],
  },
  {
    patterns: ['7ayawan'],
    arabic: ['حيوان'],
  },
  {
    patterns: ['waskha'],
    arabic: ['وسخة'],
  },
  {
    patterns: ['ga7ba', 'kahba'],
    arabic: ['قحبة'],
  },
  {
    patterns: ['motakhalef'],
    arabic: ['متخلف'],
  },
];

export function transliterate(text: string): string[] {
  if (!text) return [''];

  const lower = text.toLowerCase();
  const arabicVariants = new Set<string>();

  for (const rule of RULES) {
    const matched = rule.patterns.some((pattern) =>
      lower.includes(pattern.toLowerCase()),
    );
    if (matched) {
      for (const arabicForm of rule.arabic) {
        arabicVariants.add(arabicForm);
      }
    }
  }

  if (arabicVariants.size === 0) {
    return [text];
  }

  return [text, ...arabicVariants];
}

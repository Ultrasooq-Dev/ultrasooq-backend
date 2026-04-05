export interface PriceConstraint {
  min: number | null;
  max: number | null;
}

const PRICE_REGEXES: Array<{ pattern: RegExp; extract: (m: RegExpMatchArray) => PriceConstraint }> = [
  { pattern: /(?:under|below|less\s+than|max|upto|up\s+to)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i,
    extract: (m) => ({ min: null, max: parseFloat(m[1]) }) },
  { pattern: /(?:over|above|more\s+than|min|from|starting)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i,
    extract: (m) => ({ min: parseFloat(m[1]), max: null }) },
  { pattern: /\$?\s*(\d+(?:\.\d{1,2})?)\s*[-–—to]+\s*\$?\s*(\d+(?:\.\d{1,2})?)/i,
    extract: (m) => ({ min: parseFloat(m[1]), max: parseFloat(m[2]) }) },
  { pattern: /between\s*\$?\s*(\d+(?:\.\d{1,2})?)\s*and\s*\$?\s*(\d+(?:\.\d{1,2})?)/i,
    extract: (m) => ({ min: parseFloat(m[1]), max: parseFloat(m[2]) }) },
];

export function extractPrice(term: string): { price: PriceConstraint | null; cleanedTerm: string } {
  for (const { pattern, extract } of PRICE_REGEXES) {
    const match = term.match(pattern);
    if (match) {
      const price = extract(match);
      const cleaned = term.replace(pattern, '').replace(/\s+/g, ' ').trim();
      return { price, cleanedTerm: cleaned };
    }
  }
  return { price: null, cleanedTerm: term };
}

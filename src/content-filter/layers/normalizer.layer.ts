/**
 * Layer 1 — Unicode Normalizer
 *
 * Pure function. No NestJS dependencies. No imports from other layers.
 *
 * Pipeline (in order):
 *  1. Guard: null / undefined / empty → return ''
 *  2. Remove zero-width / invisible characters
 *  3. Replace Unicode confusables with ASCII (circled letters, fullwidth Latin,
 *     mathematical bold/italic variants)
 *  4. NFD decompose + strip combining diacritics (ù → u, ç → c, etc.)
 *  5. Lowercase
 *  6. Collapse 3+ repeated identical chars to 2 (fuuuuuck → fuuck)
 *  7. Normalize whitespace (tabs, multiple spaces → single space, trim)
 *  8. Remove separator chars between single characters (f.u.c.k → fuck)
 */

// ---------------------------------------------------------------------------
// 2. Zero-width / invisible character regex
// ---------------------------------------------------------------------------
const ZERO_WIDTH_RE = new RegExp(
  '[' +
    '\u200B' + // zero-width space
    '\u200C' + // zero-width non-joiner
    '\u200D' + // zero-width joiner
    '\u200E' + // left-to-right mark
    '\u200F' + // right-to-left mark
    '\uFEFF' + // BOM / zero-width no-break space
    '\u00AD' + // soft hyphen
    '\u034F' + // combining grapheme joiner
    '\u061C' + // Arabic letter mark
    '\u115F' + // Hangul choseong filler
    '\u1160' + // Hangul jungseong filler
    '\u17B4' + // Khmer vowel inherent Aq
    '\u17B5' + // Khmer vowel inherent Aa
    '\u180E' + // Mongolian vowel separator
    '\u2060-\u2064' + // word joiner … invisible plus
    '\u206A-\u206F' + // inhibit symmetric swapping … nominal digit shapes
    '\uFFA0' + // halfwidth Hangul filler
  ']',
  'g',
);

// ---------------------------------------------------------------------------
// 3. Unicode confusable → ASCII map
// ---------------------------------------------------------------------------

/** Build a character-level replacement map from a contiguous Unicode block. */
function buildRangeMap(
  startCode: number,
  ascii: string,
): Array<[string, string]> {
  return Array.from(ascii).map((ch, i) => [
    String.fromCodePoint(startCode + i),
    ch,
  ]);
}

// Circled lowercase letters ⓐ–ⓩ  (U+24D0–U+24E9)
const CIRCLED_MAP = buildRangeMap(0x24d0, 'abcdefghijklmnopqrstuvwxyz');

// Fullwidth lowercase Latin ａ–ｚ  (U+FF41–U+FF5A)
const FULLWIDTH_LOWER_MAP = buildRangeMap(0xff41, 'abcdefghijklmnopqrstuvwxyz');

// Fullwidth uppercase Latin Ａ–Ｚ  (U+FF21–U+FF3A)
const FULLWIDTH_UPPER_MAP = buildRangeMap(0xff21, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');

// Mathematical bold lowercase 𝐚–𝐳  (U+1D41A–U+1D433)
const MATH_BOLD_LOWER_MAP = buildRangeMap(
  0x1d41a,
  'abcdefghijklmnopqrstuvwxyz',
);

// Mathematical italic lowercase 𝑎–𝑧  (U+1D44E–U+1D467, skips dotless i/j)
// The block is not perfectly contiguous but we map the 26 most common positions.
const MATH_ITALIC_LOWER_MAP = buildRangeMap(
  0x1d44e,
  'abcdefghijklmnopqrstuvwxyz',
);

// Mathematical bold italic lowercase 𝒂–𝒛  (U+1D482–U+1D49B)
const MATH_BOLD_ITALIC_LOWER_MAP = buildRangeMap(
  0x1d482,
  'abcdefghijklmnopqrstuvwxyz',
);

// Mathematical script lowercase 𝒶–𝓏  (U+1D4B6 area — use bold script U+1D4EA)
const MATH_BOLD_SCRIPT_LOWER_MAP = buildRangeMap(
  0x1d4ea,
  'abcdefghijklmnopqrstuvwxyz',
);

// Mathematical double-struck lowercase 𝕒–𝕫  (U+1D552–U+1D56B)
const MATH_DOUBLE_STRUCK_LOWER_MAP = buildRangeMap(
  0x1d552,
  'abcdefghijklmnopqrstuvwxyz',
);

// Mathematical sans-serif lowercase 𝗮–𝘇  (U+1D5EE is bold, use regular U+1D5BA)
const MATH_SS_LOWER_MAP = buildRangeMap(0x1d5ba, 'abcdefghijklmnopqrstuvwxyz');

// Mathematical monospace lowercase 𝚊–𝚣  (U+1D68A–U+1D6A3)
const MATH_MONO_LOWER_MAP = buildRangeMap(
  0x1d68a,
  'abcdefghijklmnopqrstuvwxyz',
);

// Combine all pairs into a single Map for O(1) lookup
const CONFUSABLE_MAP = new Map<string, string>([
  ...CIRCLED_MAP,
  ...FULLWIDTH_LOWER_MAP,
  ...FULLWIDTH_UPPER_MAP,
  ...MATH_BOLD_LOWER_MAP,
  ...MATH_ITALIC_LOWER_MAP,
  ...MATH_BOLD_ITALIC_LOWER_MAP,
  ...MATH_BOLD_SCRIPT_LOWER_MAP,
  ...MATH_DOUBLE_STRUCK_LOWER_MAP,
  ...MATH_SS_LOWER_MAP,
  ...MATH_MONO_LOWER_MAP,
]);

// Pre-build a regex that matches any confusable character (handles surrogates)
const CONFUSABLE_RE = new RegExp(
  Array.from(CONFUSABLE_MAP.keys())
    .map((ch) => {
      // Escape for regex; surrogate pairs need the 'u' flag
      const cp = ch.codePointAt(0)!;
      return cp > 0xffff
        ? `\\u{${cp.toString(16)}}`
        : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('|'),
  'gu',
);

function replaceConfusables(text: string): string {
  return text.replace(CONFUSABLE_RE, (ch) => CONFUSABLE_MAP.get(ch) ?? ch);
}

// ---------------------------------------------------------------------------
// 4. NFD + diacritic strip
// ---------------------------------------------------------------------------
const DIACRITIC_RE = /[\u0300-\u036f]/g;

// ---------------------------------------------------------------------------
// 6. Collapse repeated chars (3+ → 2)
// ---------------------------------------------------------------------------
const REPEAT_RE = /(.)\1{2,}/gu;

// ---------------------------------------------------------------------------
// 7. Whitespace normalisation
// ---------------------------------------------------------------------------
const WHITESPACE_RE = /[ \t]+/g;

// ---------------------------------------------------------------------------
// 8. Separator removal between single letters
//    Matches patterns like  f.u.c.k  f-u-c-k  f_u_c_k  f*u*c*k
//
//    Rule: a "token" is a maximal run of non-space characters.  Within each
//    token, if EVERY segment between separators is exactly one character long,
//    strip all separators and return the letters joined together.
//    Otherwise leave the token unchanged.
//
//    Separator set:  . - _ * | / \
// ---------------------------------------------------------------------------

const SEP_CHARS = /[.\-_*|/\\]/;
const SEP_CHARS_G = /[.\-_*|/\\]/g;
// A token is a maximal run of non-whitespace characters that contains at
// least one separator and at least two non-separator chars.
const TOKEN_RE = /[^\s]+/g;

/**
 * Strips separator chars that appear between single characters.
 * E.g. "f.u.c.k" → "fuck", "s-h-i-t" → "shit".
 * Leaves multi-char segments intact: "go.to" stays "go.to".
 */
function removeSeparators(text: string): string {
  return text.replace(TOKEN_RE, (token) => {
    // Only attempt collapse if the token actually contains a separator
    if (!SEP_CHARS.test(token)) return token;
    const parts = token.split(SEP_CHARS_G);
    // All parts must be exactly 1 character long
    if (parts.every((p) => p.length === 1)) {
      return parts.join('');
    }
    return token;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalise `text` through the full Layer 1 pipeline.
 * Returns an empty string for null / undefined / empty input.
 */
export function normalize(text: string): string {
  if (!text) return '';

  // Step 2 — remove zero-width / invisible chars
  let s = text.replace(ZERO_WIDTH_RE, '');

  // Step 3 — replace Unicode confusables with ASCII
  s = replaceConfusables(s);

  // Step 4 — NFD decompose + strip combining diacritics
  s = s.normalize('NFD').replace(DIACRITIC_RE, '');

  // Step 5 — lowercase
  s = s.toLowerCase();

  // Step 6 — collapse 3+ repeated chars to 2
  s = s.replace(REPEAT_RE, '$1$1');

  // Step 7 — normalise whitespace
  s = s.replace(WHITESPACE_RE, ' ').trim();

  // Step 8 — remove separators between single letters
  s = removeSeparators(s);

  return s;
}

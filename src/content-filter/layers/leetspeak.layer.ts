import * as fs from 'fs';
import * as path from 'path';

const mapPath = path.join(__dirname, '../data/leetspeak-map.json');
const leetspeakMap: Record<string, string> = JSON.parse(
  fs.readFileSync(mapPath, 'utf-8'),
);

// Sort keys longest-first so multi-char substitutions match before single chars
const sortedEntries: [string, string][] = Object.entries(leetspeakMap).sort(
  ([a], [b]) => b.length - a.length,
);

export function decodeLeetspeak(text: string): string {
  if (!text) return text;

  let result = text;
  for (const [leet, letter] of sortedEntries) {
    // Escape special regex characters in the leet key
    const escaped = leet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'gi'), letter);
  }
  return result;
}

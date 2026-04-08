import { Injectable, Logger } from '@nestjs/common';

// ─── Phrase map: conversational patterns → product search terms ──────────────
// Organized by category. Each entry maps a regex to a replacement string.
// The regex is tested against the full query; if it matches, the replacement is used.
// An empty replacement means "strip the matched prefix and keep the rest."

const PHRASE_MAP: Array<{ pattern: RegExp; replacement: string; category: string }> = [
  // ── Cleaning ────────────────────────────────────────────────────────────────
  { pattern: /clean(?:ing)?\s+(?:my\s+)?(?:laptop|computer)\s*(?:screen)?/i, replacement: 'laptop screen cleaning kit', category: 'cleaning' },
  { pattern: /clean(?:ing)?\s+(?:my\s+)?phone\s*(?:screen)?/i, replacement: 'phone screen cleaner', category: 'cleaning' },
  { pattern: /clean(?:ing)?\s+(?:my\s+)?(?:keyboard|keys)/i, replacement: 'keyboard cleaning kit', category: 'cleaning' },
  { pattern: /clean(?:ing)?\s+(?:my\s+)?(?:earbuds|airpods|headphones)/i, replacement: 'earbuds cleaning kit', category: 'cleaning' },
  { pattern: /clean(?:ing)?\s+(?:my\s+)?(?:camera|lens)/i, replacement: 'camera lens cleaning kit', category: 'cleaning' },
  { pattern: /(?:dust|dirt)\s+(?:from|off|on)\s+(?:my\s+)?(?:pc|computer|desktop)/i, replacement: 'compressed air duster computer', category: 'cleaning' },
  { pattern: /(?:remove|clean)\s+(?:smudge|fingerprint|stain)s?\s+(?:from|on|off)/i, replacement: 'microfiber cleaning cloth', category: 'cleaning' },

  // ── Charging ────────────────────────────────────────────────────────────────
  { pattern: /charge?\s+(?:my\s+)?(?:phone|iphone|android)\s*(?:fast(?:er)?)?/i, replacement: 'fast charger USB-C', category: 'charging' },
  { pattern: /charge?\s+(?:my\s+)?laptop/i, replacement: 'laptop charger', category: 'charging' },
  { pattern: /charge?\s+(?:my\s+)?(?:watch|smartwatch|apple\s*watch)/i, replacement: 'smartwatch charger', category: 'charging' },
  { pattern: /charge?\s+(?:my\s+)?(?:tablet|ipad)/i, replacement: 'tablet charger USB-C', category: 'charging' },
  { pattern: /charge?\s+(?:multiple|many|several)\s+(?:device|phone|gadget)s?/i, replacement: 'multi-port charging station', category: 'charging' },
  { pattern: /(?:wireless(?:ly)?|without\s+cable)\s+charg(?:e|ing)/i, replacement: 'wireless charger Qi', category: 'charging' },
  { pattern: /(?:portable|on\s+the\s+go)\s+(?:charg(?:e|er|ing)|power|battery)/i, replacement: 'power bank portable charger', category: 'charging' },
  { pattern: /(?:car|vehicle)\s+charg(?:e|er|ing)/i, replacement: 'car charger USB', category: 'charging' },

  // ── Protection ──────────────────────────────────────────────────────────────
  { pattern: /protect\s+(?:my\s+)?(?:iphone|phone)/i, replacement: 'phone protective case', category: 'protection' },
  { pattern: /protect\s+(?:my\s+)?(?:laptop|macbook)/i, replacement: 'laptop sleeve case', category: 'protection' },
  { pattern: /protect\s+(?:my\s+)?(?:ipad|tablet)/i, replacement: 'tablet protective case', category: 'protection' },
  { pattern: /protect\s+(?:my\s+)?(?:screen|display)/i, replacement: 'tempered glass screen protector', category: 'protection' },
  { pattern: /(?:scratch|crack|shatter)\s+(?:proof|resistant|protection)/i, replacement: 'tempered glass screen protector', category: 'protection' },
  { pattern: /(?:waterproof|water\s*resistant)\s+(?:case|pouch|bag)/i, replacement: 'waterproof phone pouch', category: 'protection' },
  { pattern: /(?:drop|shock)\s+(?:proof|resistant|protection)/i, replacement: 'rugged protective case', category: 'protection' },

  // ── Storage ─────────────────────────────────────────────────────────────────
  { pattern: /(?:run(?:ning)?\s+out\s+of|need\s+more)\s+(?:storage|space|memory)/i, replacement: 'external hard drive SSD', category: 'storage' },
  { pattern: /back\s*up\s+(?:my\s+)?(?:files|data|photos)/i, replacement: 'external hard drive backup', category: 'storage' },
  { pattern: /(?:store|save|keep)\s+(?:my\s+)?(?:photos|pictures|videos)/i, replacement: 'external SSD storage', category: 'storage' },
  { pattern: /(?:expand|increase|add)\s+(?:phone|mobile)\s+(?:storage|memory)/i, replacement: 'microSD card', category: 'storage' },
  { pattern: /(?:usb|thumb|flash)\s+(?:drive|stick)\s+(?:for|to)\s+(?:transfer|move|copy)/i, replacement: 'USB flash drive', category: 'storage' },

  // ── Connectivity ────────────────────────────────────────────────────────────
  { pattern: /connect\s+(?:my\s+)?(?:phone|laptop)\s+to\s+(?:tv|television|monitor)/i, replacement: 'HDMI cable adapter', category: 'connectivity' },
  { pattern: /(?:wireless|wifi)\s+(?:for|in)\s+(?:my\s+)?(?:home|house|apartment)/i, replacement: 'WiFi router mesh', category: 'connectivity' },
  { pattern: /(?:extend|boost|improve)\s+(?:my\s+)?(?:wifi|internet|signal)/i, replacement: 'WiFi range extender', category: 'connectivity' },
  { pattern: /(?:bluetooth|wireless)\s+(?:connect|pair|link)\s+(?:to|with)/i, replacement: 'Bluetooth adapter', category: 'connectivity' },
  { pattern: /(?:share|cast|mirror|stream)\s+(?:my\s+)?(?:screen|display)/i, replacement: 'screen mirroring adapter', category: 'connectivity' },
  { pattern: /(?:ethernet|wired)\s+(?:connection|internet)\s+(?:for|to)/i, replacement: 'ethernet adapter USB', category: 'connectivity' },

  // ── Audio ───────────────────────────────────────────────────────────────────
  { pattern: /(?:listen|hear)\s+(?:to\s+)?music\s+(?:without|no)\s+(?:wires?|cables?)/i, replacement: 'wireless Bluetooth earbuds', category: 'audio' },
  { pattern: /(?:noise\s+cancel(?:l?ing)?|block(?:ing)?\s+noise)/i, replacement: 'noise cancelling headphones', category: 'audio' },
  { pattern: /(?:good|best|great)\s+(?:sound|audio)\s+(?:for|while)\s+(?:gaming|games?)/i, replacement: 'gaming headset', category: 'audio' },
  { pattern: /(?:speaker|music)\s+(?:for|in)\s+(?:my\s+)?(?:shower|bathroom)/i, replacement: 'waterproof Bluetooth speaker', category: 'audio' },
  { pattern: /(?:record|recording)\s+(?:my\s+)?(?:voice|audio|podcast|video)/i, replacement: 'USB microphone', category: 'audio' },

  // ── Work from home ──────────────────────────────────────────────────────────
  { pattern: /work\s+from\s+home\s+(?:setup|desk|office)/i, replacement: 'home office desk setup', category: 'wfh' },
  { pattern: /(?:video\s+call|zoom|meeting)\s+(?:camera|webcam)/i, replacement: 'webcam HD 1080p', category: 'wfh' },
  { pattern: /(?:ergonomic|comfortable)\s+(?:chair|seat|seating)/i, replacement: 'ergonomic office chair', category: 'wfh' },
  { pattern: /(?:stand(?:ing)?|sit\s*(?:to\s*)?stand)\s+desk/i, replacement: 'standing desk adjustable', category: 'wfh' },
  { pattern: /(?:second|extra|dual|external)\s+(?:monitor|screen|display)/i, replacement: 'external monitor', category: 'wfh' },

  // ── Kids / Baby ─────────────────────────────────────────────────────────────
  { pattern: /(?:safe|child[- ]?proof)\s+(?:for|my)\s+(?:kids?|child(?:ren)?|baby)/i, replacement: 'child safety products', category: 'kids' },
  { pattern: /(?:educational|learning)\s+(?:toy|game|tablet)\s+(?:for|my)\s+(?:kids?|child(?:ren)?)/i, replacement: 'educational toys children', category: 'kids' },
  { pattern: /(?:entertain|keep\s+busy)\s+(?:my\s+)?(?:kids?|child(?:ren)?)/i, replacement: 'kids activity toys', category: 'kids' },

  // ── Gifts ───────────────────────────────────────────────────────────────────
  { pattern: /gift\s+(?:for|idea)\s+(?:him|boyfriend|husband|dad|father)/i, replacement: 'mens gift ideas', category: 'gift' },
  { pattern: /gift\s+(?:for|idea)\s+(?:her|girlfriend|wife|mom|mother)/i, replacement: 'womens gift ideas', category: 'gift' },
  { pattern: /gift\s+(?:for|idea)\s+(?:teen(?:ager)?|kid|child)/i, replacement: 'teen gift ideas', category: 'gift' },
  { pattern: /(?:birthday|anniversary|wedding)\s+gift/i, replacement: 'gift set premium', category: 'gift' },

  // ── Travel ──────────────────────────────────────────────────────────────────
  { pattern: /(?:travel(?:l?ing)?|trip|flight)\s+(?:with|and)\s+(?:my\s+)?(?:laptop|electronics)/i, replacement: 'travel laptop bag organizer', category: 'travel' },
  { pattern: /(?:travel(?:l?ing)?|trip)\s+(?:adapter|plug|charger)/i, replacement: 'universal travel adapter', category: 'travel' },
  { pattern: /(?:pack|carry|organize)\s+(?:my\s+)?(?:cables|chargers|accessories)/i, replacement: 'cable organizer travel bag', category: 'travel' },

  // ── General intent strippers ────────────────────────────────────────────────
  // These strip conversational prefixes to reveal the actual product intent
  { pattern: /^(?:i\s+)?(?:need|want|looking\s+for)\s+(?:a\s+|an\s+|some\s+)?/i, replacement: '', category: 'general' },
  { pattern: /^(?:something|thing)\s+(?:to|that\s+(?:can|will|helps?))\s+/i, replacement: '', category: 'general' },
  { pattern: /^(?:what(?:'s|\s+is)\s+(?:a\s+good|the\s+best))\s+/i, replacement: '', category: 'general' },
  { pattern: /^(?:can\s+you\s+(?:find|suggest|recommend)\s+(?:me\s+)?(?:a\s+|an\s+)?)/i, replacement: '', category: 'general' },
  { pattern: /^(?:help\s+me\s+(?:find|choose|pick)\s+(?:a\s+|an\s+)?)/i, replacement: '', category: 'general' },
  { pattern: /^(?:where\s+(?:can\s+i|do\s+i)\s+(?:get|buy|find)\s+(?:a\s+|an\s+)?)/i, replacement: '', category: 'general' },
  { pattern: /^(?:how\s+(?:can\s+i|do\s+i|to)\s+)/i, replacement: '', category: 'general' },
  { pattern: /^(?:best|top|good)\s+(?:way\s+to\s+)/i, replacement: '', category: 'general' },
];

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class NaturalLanguageRewriterService {
  private readonly logger = new Logger(NaturalLanguageRewriterService.name);

  /**
   * Rewrite a conversational query into product search terms.
   * Uses a phrase map (no AI cost). Falls through to the original query if no pattern matches.
   *
   * @example
   *   rewrite("something to clean my laptop screen") → { rewritten: "laptop screen cleaning kit", wasRewritten: true }
   *   rewrite("iPhone 15 Pro Max")                   → { rewritten: "iPhone 15 Pro Max", wasRewritten: false }
   */
  rewrite(query: string): { rewritten: string; wasRewritten: boolean } {
    if (!query || query.trim().length === 0) {
      return { rewritten: query, wasRewritten: false };
    }

    const trimmed = query.trim();

    // Try specific category patterns first (they have concrete replacements)
    for (const entry of PHRASE_MAP) {
      if (entry.category === 'general') continue; // Skip general strippers in first pass
      if (entry.pattern.test(trimmed)) {
        this.logger.debug(
          `NLP rewrite [${entry.category}]: "${trimmed}" → "${entry.replacement}"`,
        );
        return { rewritten: entry.replacement, wasRewritten: true };
      }
    }

    // Then try general intent strippers (they remove conversational prefixes)
    for (const entry of PHRASE_MAP) {
      if (entry.category !== 'general') continue;
      if (entry.pattern.test(trimmed)) {
        const stripped = trimmed.replace(entry.pattern, '').trim();
        if (stripped.length > 0 && stripped !== trimmed) {
          this.logger.debug(
            `NLP rewrite [general]: "${trimmed}" → "${stripped}"`,
          );
          return { rewritten: stripped, wasRewritten: true };
        }
      }
    }

    return { rewritten: trimmed, wasRewritten: false };
  }

  // TODO: Future LLM fallback via OpenRouter/MCP for queries that don't match any pattern.
  // When implemented, this will call an LLM endpoint to interpret the query when the
  // phrase map produces no match and the intent is classified as 'natural_language'.
  // This avoids AI cost for the 80%+ of queries that match the phrase map.
}

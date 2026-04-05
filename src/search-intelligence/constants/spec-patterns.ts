export interface SpecPattern {
  key: string;
  pattern: RegExp;
  unit: string | null;
}

export const SPEC_PATTERNS: SpecPattern[] = [
  { key: 'storage', pattern: /\b(\d+)\s*(GB|TB)\b/i, unit: null },
  { key: 'ram', pattern: /\b(\d+)\s*GB\s*(?:RAM|DDR)/i, unit: 'GB' },
  { key: 'battery_capacity', pattern: /\b(\d{3,5})\s*mAh\b/i, unit: 'mAh' },
  { key: 'battery_life', pattern: /\b(\d{1,3})\s*(?:hours?|hrs?)\b/i, unit: 'hours' },
  { key: 'screen_size', pattern: /\b(\d+\.?\d*)\s*(?:inch|"|'')\b/i, unit: 'inches' },
  { key: 'display_type', pattern: /\b(AMOLED|OLED|LCD|IPS|TFT|Retina|Mini-?LED)\b/i, unit: null },
  { key: 'resolution', pattern: /\b(4K|8K|1080p|720p|2K|QHD|FHD|UHD)\b/i, unit: null },
  { key: 'refresh_rate', pattern: /\b(\d{2,3})\s*Hz\b/i, unit: 'Hz' },
  { key: 'connectivity', pattern: /\b(Bluetooth\s*\d?\.?\d?|WiFi\s*\d?[a-z]?|USB-C|Lightning|NFC|5G|4G|LTE)\b/i, unit: null },
  { key: 'camera', pattern: /\b(\d{1,3})\s*MP\b/i, unit: 'MP' },
  { key: 'weight', pattern: /\b(\d+\.?\d*)\s*(kg|g|lb|oz)\b/i, unit: null },
  { key: 'ip_rating', pattern: /\b(IP[X\d]{2,3})\b/i, unit: null },
  { key: 'waterproof', pattern: /\b(waterproof|water[- ]resistant|splash[- ]proof)\b/i, unit: null },
  { key: 'wattage', pattern: /\b(\d+)\s*W\b/i, unit: 'W' },
];

export function extractSpecs(term: string): { specs: Record<string, string>; cleanedTerm: string } {
  const specs: Record<string, string> = {};
  let cleaned = term;
  for (const sp of SPEC_PATTERNS) {
    const match = cleaned.match(sp.pattern);
    if (match) {
      specs[sp.key] = match[0].trim();
      cleaned = cleaned.replace(sp.pattern, '').trim();
    }
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return { specs, cleanedTerm: cleaned };
}

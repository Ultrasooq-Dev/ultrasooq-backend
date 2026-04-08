import { NaturalLanguageRewriterService } from './natural-language-rewriter.service';

describe('NaturalLanguageRewriterService', () => {
  let service: NaturalLanguageRewriterService;

  beforeEach(() => {
    service = new NaturalLanguageRewriterService();
  });

  describe('rewrite', () => {
    // ── Empty/null inputs ─────────────────────────────────────────────
    it('returns wasRewritten=false for empty string', () => {
      const result = service.rewrite('');
      expect(result.wasRewritten).toBe(false);
    });

    it('returns wasRewritten=false for whitespace-only string', () => {
      const result = service.rewrite('   ');
      expect(result.wasRewritten).toBe(false);
    });

    // ── Specific category rewrites ───────────────────────────────────
    it('rewrites cleaning query: "clean my laptop screen"', () => {
      const result = service.rewrite('clean my laptop screen');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('laptop screen cleaning kit');
    });

    it('rewrites cleaning query: "cleaning phone screen"', () => {
      const result = service.rewrite('cleaning phone screen');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('phone screen cleaner');
    });

    it('rewrites charging query: "charge my phone fast"', () => {
      const result = service.rewrite('charge my phone fast');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('fast charger USB-C');
    });

    it('rewrites charging query: "charge my laptop"', () => {
      const result = service.rewrite('charge my laptop');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('laptop charger');
    });

    it('rewrites wireless charging query', () => {
      const result = service.rewrite('wireless charging');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('wireless charger Qi');
    });

    it('rewrites portable charger query', () => {
      const result = service.rewrite('portable charger');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('power bank portable charger');
    });

    it('rewrites protection query: "protect my iphone"', () => {
      const result = service.rewrite('protect my iphone');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('phone protective case');
    });

    it('rewrites protection query: "protect my laptop"', () => {
      const result = service.rewrite('protect my laptop');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('laptop sleeve case');
    });

    it('rewrites storage query: "running out of storage"', () => {
      const result = service.rewrite('running out of storage');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('external hard drive SSD');
    });

    it('rewrites backup query: "backup my photos"', () => {
      const result = service.rewrite('backup my photos');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('external hard drive backup');
    });

    it('rewrites connectivity query: "connect my laptop to tv"', () => {
      const result = service.rewrite('connect my laptop to tv');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('HDMI cable adapter');
    });

    it('rewrites WiFi query: "wifi for my home"', () => {
      const result = service.rewrite('wifi for my home');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('WiFi router mesh');
    });

    it('rewrites audio query: "noise cancelling"', () => {
      const result = service.rewrite('noise cancelling');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('noise cancelling headphones');
    });

    it('rewrites work-from-home query: "work from home setup"', () => {
      const result = service.rewrite('work from home setup');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('home office desk setup');
    });

    it('rewrites gift query: "gift for him"', () => {
      const result = service.rewrite('gift for him');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('mens gift ideas');
    });

    it('rewrites gift query: "gift for her"', () => {
      const result = service.rewrite('gift for her');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('womens gift ideas');
    });

    it('rewrites kids safety query', () => {
      const result = service.rewrite('safe for my kids');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('child safety products');
    });

    it('rewrites travel adapter query', () => {
      const result = service.rewrite('travel adapter');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('universal travel adapter');
    });

    // ── General intent strippers ─────────────────────────────────────
    it('strips "I need" prefix', () => {
      const result = service.rewrite('I need a keyboard');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('keyboard');
    });

    it('strips "looking for" prefix', () => {
      const result = service.rewrite('looking for a good monitor');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('good monitor');
    });

    it('strips "something to" prefix', () => {
      const result = service.rewrite('something to hold my phone');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('hold my phone');
    });

    it('strips "can you find me" prefix', () => {
      const result = service.rewrite('can you find me a mouse pad');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('mouse pad');
    });

    it('strips "where can i get" prefix', () => {
      const result = service.rewrite('where can i get a USB hub');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('USB hub');
    });

    // ── No-rewrite passthrough ───────────────────────────────────────
    it('does NOT rewrite direct product queries: "iPhone 15 Pro Max"', () => {
      const result = service.rewrite('iPhone 15 Pro Max');
      expect(result.wasRewritten).toBe(false);
      expect(result.rewritten).toBe('iPhone 15 Pro Max');
    });

    it('does NOT rewrite brand+model queries: "Samsung Galaxy S24"', () => {
      const result = service.rewrite('Samsung Galaxy S24');
      expect(result.wasRewritten).toBe(false);
      expect(result.rewritten).toBe('Samsung Galaxy S24');
    });

    it('does NOT rewrite spec queries: "laptop 16GB RAM"', () => {
      const result = service.rewrite('laptop 16GB RAM');
      expect(result.wasRewritten).toBe(false);
      expect(result.rewritten).toBe('laptop 16GB RAM');
    });

    // ── Case insensitivity ───────────────────────────────────────────
    it('handles uppercase queries: "CLEAN MY LAPTOP"', () => {
      const result = service.rewrite('CLEAN MY LAPTOP');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('laptop screen cleaning kit');
    });

    it('handles mixed case: "Protect My iPhone"', () => {
      const result = service.rewrite('Protect My iPhone');
      expect(result.wasRewritten).toBe(true);
      expect(result.rewritten).toBe('phone protective case');
    });
  });
});

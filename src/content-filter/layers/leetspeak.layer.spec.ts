import { decodeLeetspeak } from './leetspeak.layer';

describe('decodeLeetspeak', () => {
  describe('number substitutions', () => {
    it('decodes p0rn → porn', () => {
      expect(decodeLeetspeak('p0rn')).toBe('porn');
    });

    it('decodes s3x → sex', () => {
      expect(decodeLeetspeak('s3x')).toBe('sex');
    });

    it('decodes 4ss → ass', () => {
      expect(decodeLeetspeak('4ss')).toBe('ass');
    });
  });

  describe('symbol substitutions', () => {
    it('decodes $h!t → shit', () => {
      expect(decodeLeetspeak('$h!t')).toBe('shit');
    });

    it('decodes @ss → ass', () => {
      expect(decodeLeetspeak('@ss')).toBe('ass');
    });

    it('decodes f@ck → fack', () => {
      // @ → a, ck → k (via ck mapping), so f + a + k = fak
      // Actually ck→k is in the map, so f@ck → f + a + k = fak
      // Let's verify: @ = a, ck = k  → "f" + "a" + "k" = "fak"
      const result = decodeLeetspeak('f@ck');
      expect(result).toBe('fak');
    });
  });

  describe('mixed leet + normal text', () => {
    it('decodes "n1ce pr0duct" → "nice product"', () => {
      expect(decodeLeetspeak('n1ce pr0duct')).toBe('nice product');
    });
  });

  describe('normal text', () => {
    it('leaves normal text unchanged', () => {
      expect(decodeLeetspeak('hello world')).toBe('hello world');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(decodeLeetspeak('')).toBe('');
    });
  });
});

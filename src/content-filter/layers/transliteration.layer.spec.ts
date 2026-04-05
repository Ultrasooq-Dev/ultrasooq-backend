import { transliterate } from './transliteration.layer';

describe('transliterate', () => {
  describe('known transliterations return Arabic variants', () => {
    it('sharmouta → includes شرموطة', () => {
      const result = transliterate('sharmouta');
      expect(result).toContain('sharmouta');
      expect(result).toContain('شرموطة');
      expect(result).toContain('شرموط');
    });

    it('sharmota → includes شرموطة', () => {
      const result = transliterate('sharmota');
      expect(result).toContain('شرموطة');
    });

    it('kos → includes كس', () => {
      const result = transliterate('kos');
      expect(result).toContain('كس');
    });

    it('koss → includes كس', () => {
      const result = transliterate('koss');
      expect(result).toContain('كس');
    });

    it('zeb → includes زب', () => {
      const result = transliterate('zeb');
      expect(result).toContain('زب');
    });

    it('zebi → includes زبي', () => {
      const result = transliterate('zebi');
      expect(result).toContain('زبي');
    });

    it('teez → includes طيز', () => {
      const result = transliterate('teez');
      expect(result).toContain('طيز');
    });

    it('ya kalb → includes يا كلب', () => {
      const result = transliterate('ya kalb');
      expect(result).toContain('يا كلب');
    });

    it('khara → includes خرا', () => {
      const result = transliterate('khara');
      expect(result).toContain('خرا');
    });

    it('hashish → includes حشيش', () => {
      const result = transliterate('hashish');
      expect(result).toContain('حشيش');
    });

    it('ga7ba → includes قحبة', () => {
      const result = transliterate('ga7ba');
      expect(result).toContain('قحبة');
    });

    it('kahba → includes قحبة', () => {
      const result = transliterate('kahba');
      expect(result).toContain('قحبة');
    });

    it('ibn el sharmouta → includes ابن الشرموطة', () => {
      const result = transliterate('ibn el sharmouta');
      expect(result).toContain('ابن الشرموطة');
    });
  });

  describe('multiple transliterations in one text', () => {
    it('text with two slang terms includes both Arabic sets', () => {
      const result = transliterate('sharmouta and kos');
      expect(result[0]).toBe('sharmouta and kos');
      expect(result).toContain('شرموطة');
      expect(result).toContain('كس');
    });

    it('text with three slang terms includes all Arabic variants', () => {
      const result = transliterate('khara teez hashish');
      expect(result).toContain('خرا');
      expect(result).toContain('طيز');
      expect(result).toContain('حشيش');
    });
  });

  describe('non-transliterable text returns just original', () => {
    it('plain English returns [original]', () => {
      const result = transliterate('hello world');
      expect(result).toEqual(['hello world']);
    });

    it('product name returns [original]', () => {
      const result = transliterate('wireless keyboard');
      expect(result).toEqual(['wireless keyboard']);
    });
  });

  describe('edge cases', () => {
    it('empty input returns [""]', () => {
      expect(transliterate('')).toEqual(['']);
    });

    it('first element is always the original text', () => {
      const input = 'sharmouta';
      expect(transliterate(input)[0]).toBe(input);
    });
  });

  describe('case insensitive matching', () => {
    it('SHARMOUTA (uppercase) → includes Arabic variants', () => {
      const result = transliterate('SHARMOUTA');
      expect(result).toContain('شرموطة');
    });

    it('KhArA (mixed case) → includes Arabic variants', () => {
      const result = transliterate('KhArA');
      expect(result).toContain('خرا');
    });

    it('HASHISH (uppercase) → includes حشيش', () => {
      const result = transliterate('HASHISH');
      expect(result).toContain('حشيش');
    });
  });
});

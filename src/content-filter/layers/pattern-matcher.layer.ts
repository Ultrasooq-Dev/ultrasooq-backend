export interface TermMeta {
  category: string; // adult, profanity, hate_speech, drugs, scam, weapons
  severity: string; // MILD, MODERATE, SEVERE
}

export interface MatchResult {
  term: string;
  category: string;
  severity: string;
  position: { start: number; end: number };
}

interface TrieNode {
  children: Map<string, TrieNode>;
  isEnd: boolean;
  meta?: TermMeta;
  term?: string;
}

function createNode(): TrieNode {
  return {
    children: new Map(),
    isEnd: false,
  };
}

export class TrieMatcher {
  private root: TrieNode = createNode();
  private _size = 0;

  addTerm(term: string, meta: TermMeta): void {
    const normalized = term.toLowerCase();
    let node = this.root;

    for (const char of normalized) {
      if (!node.children.has(char)) {
        node.children.set(char, createNode());
      }
      node = node.children.get(char)!;
    }

    if (!node.isEnd) {
      this._size++;
    }

    node.isEnd = true;
    node.meta = meta;
    node.term = normalized;
  }

  match(text: string): MatchResult[] {
    if (!text) return [];

    const lower = text.toLowerCase();
    const results: MatchResult[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < lower.length; i++) {
      let node = this.root;

      for (let j = i; j < lower.length; j++) {
        const char = lower[j];
        if (!node.children.has(char)) break;

        node = node.children.get(char)!;

        if (node.isEnd) {
          const key = `${node.term}@${i}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              term: node.term!,
              category: node.meta!.category,
              severity: node.meta!.severity,
              position: { start: i, end: j },
            });
          }
        }
      }
    }

    return results;
  }

  get size(): number {
    return this._size;
  }

  clear(): void {
    this.root = createNode();
    this._size = 0;
  }
}

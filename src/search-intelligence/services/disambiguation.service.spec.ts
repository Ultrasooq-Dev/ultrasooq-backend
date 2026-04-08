import { DisambiguationService } from './disambiguation.service';
import { KnowledgeGraphService } from './knowledge-graph.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('DisambiguationService', () => {
  let service: DisambiguationService;
  let mockKnowledgeGraph: jest.Mocked<KnowledgeGraphService>;
  let mockPrisma: any;

  beforeEach(() => {
    mockKnowledgeGraph = {
      disambiguate: jest.fn(),
      expandUseCase: jest.fn(),
      findCompatible: jest.fn(),
      getAccessories: jest.fn(),
    } as any;

    mockPrisma = {
      productView: {
        findMany: jest.fn(),
      },
    };

    service = new DisambiguationService(mockKnowledgeGraph, mockPrisma);
  });

  describe('disambiguate', () => {
    it('returns empty result for empty term', async () => {
      const result = await service.disambiguate('');
      expect(result).toEqual({ meanings: [], bestGuess: null });
    });

    it('returns empty result for whitespace-only term', async () => {
      const result = await service.disambiguate('   ');
      expect(result).toEqual({ meanings: [], bestGuess: null });
    });

    it('returns single meaning directly without user lookup', async () => {
      mockKnowledgeGraph.disambiguate.mockResolvedValue([
        { categoryId: 5, meaning: 'computer mouse', priority: 100 },
      ]);

      const result = await service.disambiguate('mouse');

      expect(result.meanings).toHaveLength(1);
      expect(result.bestGuess).toBe(5);
      // Should NOT query productView for a single meaning
      expect(mockPrisma.productView.findMany).not.toHaveBeenCalled();
    });

    it('returns multiple meanings sorted by priority when no user', async () => {
      mockKnowledgeGraph.disambiguate.mockResolvedValue([
        { categoryId: 5, meaning: 'computer mouse', priority: 80 },
        { categoryId: 12, meaning: 'pet mouse', priority: 50 },
      ]);

      const result = await service.disambiguate('mouse');

      expect(result.meanings).toHaveLength(2);
      expect(result.bestGuess).toBe(5); // Higher priority wins
      expect(result.meanings[0].meaning).toBe('computer mouse');
      expect(result.meanings[1].meaning).toBe('pet mouse');
    });

    it('boosts category matching user browsing history', async () => {
      mockKnowledgeGraph.disambiguate.mockResolvedValue([
        { categoryId: 5, meaning: 'computer mouse', priority: 80 },
        { categoryId: 12, meaning: 'pet mouse', priority: 50 },
      ]);

      // User has been browsing pet products (categoryId 12)
      mockPrisma.productView.findMany.mockResolvedValue([
        { product: { categoryId: 12 } },
        { product: { categoryId: 12 } },
        { product: { categoryId: 15 } },
      ]);

      const result = await service.disambiguate('mouse', 123);

      // Computer mouse (80) still wins over pet mouse (50 + 10 = 60)
      // but the boost is applied, changing priority from 50 to 60
      expect(result.bestGuess).toBe(5);
      expect(result.meanings[0].categoryId).toBe(5);
      expect(result.meanings[0].priority).toBe(80);
      expect(result.meanings[1].categoryId).toBe(12);
      expect(result.meanings[1].priority).toBe(60); // 50 + 10 boost
    });

    it('boosts past priority when user history strongly matches', async () => {
      mockKnowledgeGraph.disambiguate.mockResolvedValue([
        { categoryId: 5, meaning: 'computer mouse', priority: 55 },
        { categoryId: 12, meaning: 'pet mouse', priority: 50 },
      ]);

      // User has been browsing pet products
      mockPrisma.productView.findMany.mockResolvedValue([
        { product: { categoryId: 12 } },
      ]);

      const result = await service.disambiguate('mouse', 123);

      // Pet mouse: 50 + 10 = 60, Computer mouse: 55
      expect(result.bestGuess).toBe(12); // Boosted past the original leader
      expect(result.meanings[0].categoryId).toBe(12);
    });

    it('handles null categoryId in product views gracefully', async () => {
      mockKnowledgeGraph.disambiguate.mockResolvedValue([
        { categoryId: 5, meaning: 'computer mouse', priority: 80 },
        { categoryId: 12, meaning: 'pet mouse', priority: 50 },
      ]);

      mockPrisma.productView.findMany.mockResolvedValue([
        { product: { categoryId: null } },
        { product: null },
        { product: { categoryId: 12 } },
      ]);

      const result = await service.disambiguate('mouse', 123);

      expect(result.meanings).toHaveLength(2);
      expect(result.bestGuess).toBe(5); // Null categories filtered out, only 12 boosted
    });

    it('handles database error in user history gracefully', async () => {
      mockKnowledgeGraph.disambiguate.mockResolvedValue([
        { categoryId: 5, meaning: 'computer mouse', priority: 80 },
        { categoryId: 12, meaning: 'pet mouse', priority: 50 },
      ]);

      mockPrisma.productView.findMany.mockRejectedValue(new Error('DB connection failed'));

      // Should not throw — gracefully degrade
      const result = await service.disambiguate('mouse', 123);

      expect(result.meanings).toHaveLength(2);
      expect(result.bestGuess).toBe(5); // Falls back to knowledge graph ordering
    });

    it('returns empty when knowledge graph returns no meanings', async () => {
      mockKnowledgeGraph.disambiguate.mockResolvedValue([]);

      const result = await service.disambiguate('xyzabc');

      expect(result.meanings).toHaveLength(0);
      expect(result.bestGuess).toBeNull();
    });
  });
});

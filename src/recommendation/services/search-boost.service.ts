// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { RecommendationRedisService } from './recommendation-redis.service';

interface BoostResult {
  productId: string;
  boost: number;
}

interface BehaviorProfile {
  categories: Record<string, number>;
  brands: Record<string, number>;
  priceRange: { min: number; max: number; avg: number };
}

@Injectable()
export class SearchBoostService {
  private readonly logger = new Logger(SearchBoostService.name);

  constructor(private recRedis: RecommendationRedisService) {}

  async getBoosts(
    userId: number | null,
    locale: string,
    tradeRole: string,
    products: { id: number; categoryId: number | null; brandId: number | null; price: number }[],
  ): Promise<BoostResult[]> {
    if (products.length === 0) return [];

    let profile: BehaviorProfile | null = null;
    if (userId) {
      profile = await this.recRedis.getJson<BehaviorProfile>(
        this.recRedis.keys.profile(userId),
      );
    }

    const trendingIds = await this.recRedis.getIdList(
      this.recRedis.keys.segTrending(locale, tradeRole),
    );
    const trendingSet = new Set(trendingIds || []);

    return products.map((product) => {
      let boost = 0;

      if (profile) {
        // Category affinity (0.0 - 0.3)
        if (product.categoryId && profile.categories[String(product.categoryId)]) {
          const maxCat = Math.max(...Object.values(profile.categories), 1);
          boost += (profile.categories[String(product.categoryId)] / maxCat) * 0.3;
        }
        // Brand affinity (0.0 - 0.2)
        if (product.brandId && profile.brands[String(product.brandId)]) {
          const maxBrand = Math.max(...Object.values(profile.brands), 1);
          boost += (profile.brands[String(product.brandId)] / maxBrand) * 0.2;
        }
        // Price proximity (0.0 - 0.1)
        if (profile.priceRange.avg > 0 && product.price > 0) {
          const ratio = product.price / profile.priceRange.avg;
          if (ratio >= 0.5 && ratio <= 2.0) {
            boost += (1.0 - Math.abs(1.0 - ratio)) * 0.1;
          }
        }
      }

      // Segment popularity (0.0 - 0.1)
      if (trendingSet.has(product.id)) boost += 0.1;

      return { productId: product.id, boost: Math.round(boost * 1000) / 1000 };
    });
  }
}
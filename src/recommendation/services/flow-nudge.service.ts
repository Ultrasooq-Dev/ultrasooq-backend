import { Injectable, Logger } from '@nestjs/common';
import { RecommendationRedisService } from './recommendation-redis.service';

export interface FlowNudge {
  type: 'rfq' | 'wholesale' | 'services' | 'dropship';
  message: string;
  ctaText: string;
  ctaUrl: string;
  confidence: number; // 0-1
}

export interface BehaviorProfile {
  categories: Record<string, number>;
  brands: Record<string, number>;
  priceRange: { min: number; max: number; avg: number };
  shoppingFlows: Record<string, number>;
  topProducts: number[];
  locale: string;
  tradeRole: string;
}

@Injectable()
export class FlowNudgeService {
  private readonly logger = new Logger(FlowNudgeService.name);

  constructor(private recRedis: RecommendationRedisService) {}

  async getNudges(userId: number): Promise<FlowNudge[]> {
    const profile = await this.recRedis.getJson<BehaviorProfile>(
      this.recRedis.keys.profile(userId),
    );
    if (!profile) return [];

    const nudges: FlowNudge[] = [];

    // Rule 1: High regular usage + industrial categories → suggest RFQ
    const regularUsage = profile.shoppingFlows?.regular || 0;
    const rfqUsage = profile.shoppingFlows?.rfq || 0;
    if (regularUsage > 0.6 && rfqUsage < 0.1 && profile.priceRange.avg > 50) {
      nudges.push({
        type: 'rfq',
        message: 'Businesses like yours save 20-40% with bulk pricing',
        ctaText: 'Try Request for Quote',
        ctaUrl: '/rfq',
        confidence: Math.min(regularUsage, 0.9),
      });
    }

    // Rule 2: High avg order value + COMPANY role → suggest wholesale
    const wholesaleUsage = profile.shoppingFlows?.wholesale || 0;
    if (
      profile.tradeRole === 'COMPANY' &&
      wholesaleUsage < 0.2 &&
      profile.priceRange.avg > 100
    ) {
      nudges.push({
        type: 'wholesale',
        message: 'Get factory-direct pricing for your business',
        ctaText: 'Browse Wholesale',
        ctaUrl: '/wholesale',
        confidence: 0.7,
      });
    }

    // Rule 3: FREELANCER role viewing products → suggest services
    const servicesUsage = profile.shoppingFlows?.services || 0;
    if (profile.tradeRole === 'FREELANCER' && servicesUsage < 0.1) {
      nudges.push({
        type: 'services',
        message: 'Offer your skills on our Services marketplace',
        ctaText: 'List a Service',
        ctaUrl: '/services',
        confidence: 0.6,
      });
    }

    // Sort by confidence descending, return top 3
    return nudges.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }
}

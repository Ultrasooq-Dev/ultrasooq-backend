import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private prisma: PrismaService,
    private recRedis: RecommendationRedisService,
  ) {}

  async trackFeedback(
    data: {
      recId: string;
      productId: string;
      action: string;
      placement?: string;
      position?: number;
      algorithm?: string;
    },
    userId: number | null,
    deviceId: string | null,
  ): Promise<void> {
    // Deduplicate: skip if same recId+action recorded within 5 seconds
    const dedupKey = `rec:dedup:${data.recId}:${data.action}:${userId || deviceId}`;
    try {
      const exists = await this.recRedis.getJson(dedupKey);
      if (exists) return; // Duplicate — skip
      await this.recRedis.setJson(dedupKey, 1, 5); // 5-second dedup window
    } catch {
      // If dedup check fails, proceed anyway
    }

    const algo = data.algorithm || this.extractAlgorithm(data.recId);
    const today = new Date().toISOString().slice(0, 10);

    // Persist to DB (non-blocking)
    this.prisma.recommendationFeedback
      .create({
        data: {
          recId: data.recId,
          userId,
          deviceId,
          productId: data.productId,
          algorithm: algo,
          placement: data.placement || 'unknown',
          position: data.position || 0,
          action: data.action,
        },
      })
      .catch((e) => this.logger.warn(`Feedback DB write failed: ${e.message}`));

    // Update real-time Redis counters
    if (data.action === 'impression') {
      await this.recRedis.pfadd(
        this.recRedis.keys.feedbackImpressions(today, algo),
        data.recId,
      );
    } else if (data.action === 'click') {
      await this.recRedis.pfadd(
        this.recRedis.keys.feedbackClicks(today, algo),
        data.recId,
      );
    } else if (data.action === 'purchase') {
      await this.recRedis.incr(this.recRedis.keys.feedbackConversions(today));
    }
  }

  private extractAlgorithm(recId: string): string {
    const parts = recId.split('_');
    return parts.length >= 3 ? parts[2] : 'unknown';
  }
}
